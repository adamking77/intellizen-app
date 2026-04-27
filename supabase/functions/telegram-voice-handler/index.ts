import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const FUNCTION_SECRET = Deno.env.get("FUNCTION_SECRET")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type TelegramVoice = {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    voice?: TelegramVoice;
    audio?: TelegramVoice;
  };
};

// Telegram caps webhook bodies; we always 200 to prevent retries on errors we've already logged.
const ok = () => new Response("ok", { status: 200 });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== FUNCTION_SECRET) {
    console.warn("rejected: bad secret token");
    return new Response("forbidden", { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch (err) {
    console.error("invalid JSON body", err);
    return ok();
  }

  const msg = update.message;
  const voice = msg?.voice ?? msg?.audio;
  if (!msg || !voice) return ok(); // ignore text, stickers, photos, etc.

  try {
    await handleVoice(msg.chat.id, msg.message_id, voice);
  } catch (err) {
    console.error("voice handler failed", err);
    // Even on failure, return 200 so Telegram doesn't redeliver indefinitely.
    // The error is logged; user can retry by re-sending the voice note.
  }
  return ok();
});

async function handleVoice(
  chatId: number,
  messageId: number,
  voice: TelegramVoice,
) {
  // 1. Resolve Telegram file path
  const fileInfoRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${voice.file_id}`,
  );
  const fileInfo = await fileInfoRes.json();
  if (!fileInfo.ok) throw new Error(`getFile failed: ${JSON.stringify(fileInfo)}`);
  const filePath = fileInfo.result.file_path as string;

  // 2. Download audio
  const audioRes = await fetch(
    `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`,
  );
  if (!audioRes.ok) throw new Error(`audio download failed: ${audioRes.status}`);
  const audioBuf = new Uint8Array(await audioRes.arrayBuffer());

  // Telegram voice notes are .oga (OGG/Opus). Audio messages can be other formats — preserve extension.
  const ext = filePath.split(".").pop() || "oga";
  const mime = voice.mime_type ?? "audio/ogg";

  // 3. Upload to Storage
  const objectPath = `${crypto.randomUUID()}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from("voice-notes")
    .upload(objectPath, audioBuf, { contentType: mime, upsert: false });
  if (uploadErr) throw new Error(`storage upload: ${uploadErr.message}`);

  // 4. Transcribe via Whisper-1 (accepts OGG natively)
  const transcript = await transcribe(audioBuf, mime, ext);

  // 5. Generate slug + tags via Haiku
  const { slug, tags } = await classify(transcript);

  // 6. Insert into inbox for the local puller to pick up
  const { error: insertErr } = await supabase.from("voice_notes_inbox").insert({
    telegram_msg_id: messageId,
    telegram_chat_id: chatId,
    telegram_file_id: voice.file_id,
    duration_sec: voice.duration,
    transcript,
    slug,
    tags,
    audio_path: objectPath,
  });
  if (insertErr) throw new Error(`inbox insert: ${insertErr.message}`);

  console.log(`ingested voice note ${messageId} → slug=${slug} tags=${tags.join(",")}`);
}

async function transcribe(
  audio: Uint8Array,
  mime: string,
  ext: string,
): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mime }), `voice.${ext}`);
  form.append("model", "whisper-1");
  form.append("response_format", "text");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`whisper failed (${res.status}): ${body}`);
  }
  // response_format=text returns plain text, not JSON
  return (await res.text()).trim();
}

async function classify(transcript: string): Promise<{ slug: string; tags: string[] }> {
  const prompt = `Voice note transcript:
"""
${transcript}
"""

Return ONLY a JSON object with two fields:
- "slug": a kebab-case identifier (max 6 words) that names the IDEA of the note. Skip preamble like "OK so I was just thinking" — name the actual concept being explored.
- "tags": an array of 3-7 kebab-case keywords drawn from the note's substance (entities, projects, concepts, topics). Favor specificity (e.g. "shadow-lotus" over "investigation", "predatory-entitlement" over "psychology"). No generic tags like "thoughts" or "voice-note".

Return only the JSON, no markdown fencing, no commentary.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`haiku failed (${res.status}): ${body}`);
    return fallbackSlugTags(transcript);
  }

  const data = await res.json();
  const raw = data.content?.[0]?.text?.trim() ?? "";
  const text = stripJsonFences(raw);
  try {
    const parsed = JSON.parse(text);
    const slug = sanitizeSlug(parsed.slug);
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map(sanitizeSlug).filter(Boolean).slice(0, 7)
      : [];
    if (!slug) return fallbackSlugTags(transcript);
    return { slug, tags };
  } catch {
    console.error(`haiku returned non-JSON: ${text}`);
    return fallbackSlugTags(transcript);
  }
}

// Haiku frequently wraps JSON in ```json ... ``` despite explicit instructions otherwise.
function stripJsonFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function sanitizeSlug(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function fallbackSlugTags(transcript: string): { slug: string; tags: string[] } {
  const firstWords = transcript.split(/\s+/).slice(0, 5).join(" ");
  return { slug: sanitizeSlug(firstWords) || "voice-note", tags: [] };
}
