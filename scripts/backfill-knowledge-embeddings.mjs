#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CHUNK_SIZE = 1500;
const EMBEDDING_DIMENSIONS = 1536;
const OPENAI_MODEL = "text-embedding-3-small";
const OPENROUTER_MODEL = `openai/${OPENAI_MODEL}`;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const useOpenAiDirect = args.has("--openai-direct");
const insertNullChunks = args.has("--insert-null-chunks");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(join(process.env.HOME ?? "", "vault", ".env"));
loadEnvFile(".env.local");

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const openAiKey = process.env.OPENAI_API_KEY;
const openRouterKey = process.env.OPENROUTER_API_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase URL or service role key.");
}

if (useOpenAiDirect && !openAiKey && !insertNullChunks) {
  throw new Error("Missing OPENAI_API_KEY for --openai-direct.");
}

if (!useOpenAiDirect && !openRouterKey && !insertNullChunks) {
  throw new Error("Missing OPENROUTER_API_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
  db: { schema: "knowledge" },
});

function chunkContent(content) {
  const chunks = [];
  const paragraphs = content.split(/\n\n+/);
  let current = "";
  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > CHUNK_SIZE && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function buildDocumentEmbeddingInput({ relPath, title, document_type, domain, content }) {
  return `Path: ${relPath}\nTitle: ${title}\nType: ${document_type}\nDomain: ${domain}\n\n${content}`;
}

function embeddingInputForDoc(doc, content) {
  return buildDocumentEmbeddingInput({
    relPath: doc.source_path ?? "",
    title: doc.title ?? "",
    document_type: doc.document_type ?? "",
    domain: doc.domain ?? "",
    content,
  });
}

async function embed(text) {
  const input = text.slice(0, 2000);
  const endpoint = useOpenAiDirect
    ? "https://api.openai.com/v1/embeddings"
    : "https://openrouter.ai/api/v1/embeddings";
  const token = useOpenAiDirect ? openAiKey : openRouterKey;
  const model = useOpenAiDirect ? OPENAI_MODEL : OPENROUTER_MODEL;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input, dimensions: EMBEDDING_DIMENSIONS }),
  });

  const json = await res.json().catch(() => ({}));
  const embedding = json.data?.[0]?.embedding;
  if (!res.ok || !embedding) {
    throw new Error(`Embedding failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`);
  }
  return embedding;
}

async function fetchAll(table, select, configure = query => query) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    query = configure(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function fetchChunkDocumentIds() {
  const chunks = await fetchAll("chunks", "document_id", query => query.not("document_id", "is", null));
  return new Set(chunks.map(chunk => chunk.document_id).filter(id => id != null));
}

async function updateDocumentEmbedding(doc) {
  if (dryRun || doc.embedding) return false;
  const embedding = await embed(embeddingInputForDoc(doc, doc.content ?? ""));
  const { error } = await supabase.from("documents").update({ embedding }).eq("id", doc.id);
  if (error) throw error;
  return true;
}

async function backfillDocumentChunks(doc) {
  const { count, error: countError } = await supabase
    .from("chunks")
    .select("*", { count: "exact", head: true })
    .eq("document_id", doc.id);
  if (countError) throw countError;
  if ((count ?? 0) > 0) return 0;

  const chunks = chunkContent(doc.content ?? "");
  if (dryRun) return chunks.length;

  const rows = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const content = chunks[i];
    const embedding = insertNullChunks ? null : await embed(embeddingInputForDoc(doc, content));
    rows.push({ document_id: doc.id, chunk_index: i, content, embedding });
  }

  if (rows.length === 0) return 0;
  const { error } = await supabase.from("chunks").insert(rows);
  if (error) throw error;
  return rows.length;
}

async function backfillNullChunkEmbedding(chunk, docsById) {
  if (dryRun || chunk.embedding) return false;
  const doc = docsById.get(chunk.document_id) ?? {};
  const embedding = await embed(embeddingInputForDoc(doc, chunk.content ?? ""));
  const { error } = await supabase.from("chunks").update({ embedding }).eq("id", chunk.id);
  if (error) throw error;
  return true;
}

async function main() {
  const provider = useOpenAiDirect ? "OpenAI API" : "OpenRouter gateway";
  const mode = insertNullChunks ? "chunk-row insert without embeddings" : `${provider} / ${useOpenAiDirect ? OPENAI_MODEL : OPENROUTER_MODEL}`;
  console.log(`${dryRun ? "Dry run" : "Backfill"} using ${mode}`);

  const docs = await fetchAll(
    "documents",
    "id,title,source_path,document_type,domain,content,embedding",
    query => query.not("content", "is", null).order("id", { ascending: true }),
  );
  const docsById = new Map(docs.map(doc => [doc.id, doc]));
  const chunkDocumentIds = await fetchChunkDocumentIds();
  const docsMissingChunks = docs.filter(doc => !chunkDocumentIds.has(doc.id) && (doc.content ?? "").trim());
  const docsMissingEmbeddings = docs.filter(doc => !doc.embedding && (doc.content ?? "").trim());
  const chunksMissingEmbeddings = await fetchAll(
    "chunks",
    "id,document_id,content,embedding",
    query => query.is("embedding", null).order("id", { ascending: true }),
  );

  console.log(`Documents with content and no chunks: ${docsMissingChunks.length}`);
  console.log(`Documents with null embedding: ${docsMissingEmbeddings.length}`);
  console.log(`Chunks with null embedding: ${chunksMissingEmbeddings.length}`);

  let insertedChunks = 0;
  let updatedDocs = 0;
  let updatedChunks = 0;

  if (!insertNullChunks) {
    for (const doc of docsMissingEmbeddings) {
      if (await updateDocumentEmbedding(doc)) updatedDocs += 1;
    }
  }

  for (const doc of docsMissingChunks) {
    const count = await backfillDocumentChunks(doc);
    insertedChunks += count;
    if (count > 0) {
      console.log(`  document ${doc.id}: ${dryRun ? "would insert" : "inserted"} ${count} chunk(s)`);
    }
  }

  if (!insertNullChunks) {
    for (const chunk of chunksMissingEmbeddings) {
      if (await backfillNullChunkEmbedding(chunk, docsById)) updatedChunks += 1;
    }
  }

  console.log(`${dryRun ? "Would update" : "Updated"} document embeddings: ${insertNullChunks ? 0 : dryRun ? docsMissingEmbeddings.length : updatedDocs}`);
  console.log(`${dryRun ? "Would insert" : "Inserted"} chunks: ${insertedChunks}`);
  console.log(`${dryRun ? "Would update" : "Updated"} chunk embeddings: ${insertNullChunks ? 0 : dryRun ? chunksMissingEmbeddings.length : updatedChunks}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
