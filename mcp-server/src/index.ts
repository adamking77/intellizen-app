import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import ExaModule from "exa-js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Exa = (ExaModule as any).Exa ?? ExaModule.default ?? ExaModule;
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator === -1) return [line, ""];
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
        return [key, value];
      }),
  );
}

const localEnv = loadEnvFile(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env.local"),
);

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  localEnv.VITE_SUPABASE_URL ??
  localEnv.SUPABASE_URL ??
  "https://jicrdrwtwubveyvzyyrh.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  localEnv.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ??
  localEnv.VITE_SUPABASE_SERVICE_ROLE_KEY;
const EXA_API_KEY =
  process.env.VITE_EXA_API_KEY ??
  process.env.EXA_API_KEY ??
  localEnv.VITE_EXA_API_KEY ??
  localEnv.EXA_API_KEY ??
  "ca04e163-e55b-49ca-9b40-3454d11a35d6";

if (!SUPABASE_KEY) {
  throw new Error("Missing Supabase service role key. Set SUPABASE_SERVICE_ROLE_KEY in .env.local.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const exa = new Exa(EXA_API_KEY);
const VAULT_BASE = join(homedir(), "vault", "intelligence");

function vaultPath(...segments: string[]): string {
  return join(VAULT_BASE, ...segments);
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function snippetFromResult(r: {
  highlights?: string[];
  text?: string;
}): string {
  if (r.highlights?.length) return r.highlights[0];
  if (r.text) return r.text.slice(0, 400);
  return "";
}

type ExaSearchCategory = "web" | "news" | "research paper" | "company" | "personal site";

interface ExaSearchInput {
  query: string;
  category?: ExaSearchCategory;
  num_results?: number;
  start_published_date?: string;
  project_id?: number;
  monitor_id?: number;
  watch_domain?: string;
}

interface UpsertedSearchResult {
  query: string;
  total_results: number;
  signal_ids: number[];
  titles: string[];
}

function definedFields<T extends Record<string, unknown>>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

async function runSearchAndUpsert(input: ExaSearchInput): Promise<UpsertedSearchResult> {
  const {
    query,
    category = "web",
    num_results = 10,
    start_published_date,
    project_id,
    monitor_id,
    watch_domain,
  } = input;

  const searchOptions: Record<string, unknown> = {
    type: "auto",
    useAutoprompt: true,
    numResults: Math.min(num_results, 25),
    highlights: { numSentences: 3, highlightsPerUrl: 1 },
  };

  if (category !== "web") {
    searchOptions.category = category;
  }
  if (start_published_date) {
    searchOptions.startPublishedDate = start_published_date;
  }

  const res = await exa.searchAndContents(query, searchOptions);
  const upserted: number[] = [];

  for (const r of res.results as Array<{
    title?: string;
    url: string;
    publishedDate?: string;
    score?: number;
    highlights?: string[];
    text?: string;
  }>) {
    const source = domainFromUrl(r.url);
    const snippet = snippetFromResult(r);

    const { data, error } = await supabase
      .schema("intel").from("signals")
      .upsert(
        {
          monitor_id: monitor_id ?? null,
          title: r.title ?? r.url,
          url: r.url,
          source,
          published_at: r.publishedDate ?? null,
          snippet,
          exa_score: r.score ?? null,
          watch_domain: watch_domain ?? query.slice(0, 100),
          raw_payload: r,
          status: "new",
        },
        { onConflict: "url", ignoreDuplicates: true },
      )
      .select("id")
      .single();

    if (!error && data) {
      upserted.push(data.id);
    } else if (error?.code === "23505" || error?.code === "PGRST116") {
      const { data: existing } = await supabase
        .schema("intel").from("signals")
        .select("id")
        .eq("url", r.url)
        .single();
      if (existing) upserted.push(existing.id);
    }
  }

  if (project_id && upserted.length > 0) {
    const rows = upserted.map((signal_id) => ({ project_id, signal_id }));
    await supabase
      .schema("intel").from("project_signals")
      .upsert(rows, { onConflict: "project_id,signal_id", ignoreDuplicates: true });
  }

  return {
    query,
    total_results: res.results.length,
    signal_ids: upserted,
    titles: (res.results as Array<{ title?: string; url: string }>).map((r) => r.title ?? r.url),
  };
}

async function runMonitor(monitor: {
  id: number;
  query: string;
  watch_domain: string;
}): Promise<UpsertedSearchResult> {
  const result = await runSearchAndUpsert({
    query: monitor.query,
    category: "web",
    num_results: 10,
    monitor_id: monitor.id,
    watch_domain: monitor.watch_domain,
  });

  const { error } = await supabase
    .schema("intel").from("monitors")
    .update({
      last_run: new Date().toISOString(),
      signal_count: result.signal_ids.length,
    })
    .eq("id", monitor.id);

  if (error) throw new Error(error.message);
  return result;
}

async function generateCaseId(): Promise<string> {
  const { count } = await supabase
    .schema("intel").from("investigations")
    .select("*", { count: "exact", head: true });
  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `case-${new Date().getFullYear()}-${seq}`;
}

const server = new Server(
  { name: "intelizen", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Search ──────────────────────────────────────────────────────────────
    {
      name: "run_exa_search",
      description:
        "Run an Exa search, upsert results into intel_signals, and optionally attach them to a project. Returns the IDs of upserted signals.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          category: {
            type: "string",
            enum: ["web", "news", "research paper", "company", "personal site"],
            description: "Search category. Defaults to 'web'.",
          },
          num_results: {
            type: "number",
            description: "Number of results (default 10, max 25)",
          },
          start_published_date: {
            type: "string",
            description: "ISO date string to filter news by date e.g. '2024-01-01'",
          },
          project_id: {
            type: "number",
            description: "If provided, attach all results to this project",
          },
        },
        required: ["query"],
      },
    },
    // ── Projects ────────────────────────────────────────────────────────────
    {
      name: "list_projects",
      description: "List all InteliZen projects.",
      inputSchema: { type: "object", properties: {} },
    },
    // ── Operations ──────────────────────────────────────────────────────────
    {
      name: "list_operations",
      description: "List GenZen operations.",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["active", "archived"],
            description: "Filter by operation status. Omit to return all.",
          },
        },
      },
    },
    {
      name: "create_operation",
      description: "Create a new operation.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
        },
        required: ["name"],
      },
    },
    {
      name: "update_operation",
      description: "Update an operation's name, description, or status.",
      inputSchema: {
        type: "object",
        properties: {
          operation_id: { type: "number" },
          name: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["active", "archived"] },
        },
        required: ["operation_id"],
      },
    },
    {
      name: "delete_operation",
      description: "Delete an operation. Linked projects and investigations are preserved with operation_id cleared by database constraints.",
      inputSchema: {
        type: "object",
        properties: {
          operation_id: { type: "number" },
        },
        required: ["operation_id"],
      },
    },
    // ── Projects ────────────────────────────────────────────────────────────
    {
      name: "create_project",
      description: "Create a new project.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: {
            type: "string",
            enum: ["report", "scoping", "research", "client_case"],
          },
          watch_domain: { type: "string" },
          notes: { type: "string" },
          operation_id: { type: "number" },
        },
        required: ["name", "type"],
      },
    },
    {
      name: "update_project",
      description: "Update a project's metadata, status, or operation link.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "number" },
          name: { type: "string" },
          type: {
            type: "string",
            enum: ["report", "scoping", "research", "client_case"],
          },
          watch_domain: { type: "string" },
          status: { type: "string", enum: ["active", "archived", "on_hold"] },
          notes: { type: "string" },
          operation_id: { type: "number" },
        },
        required: ["project_id"],
      },
    },
    {
      name: "delete_project",
      description: "Delete a project and its project-signal links.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "number" },
        },
        required: ["project_id"],
      },
    },
    {
      name: "add_signal_to_project",
      description: "Attach an existing signal to a project.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "number" },
          signal_id: { type: "number" },
          notes: { type: "string" },
        },
        required: ["project_id", "signal_id"],
      },
    },
    {
      name: "list_project_signals",
      description: "List all signals attached to a project.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "number" },
        },
        required: ["project_id"],
      },
    },
    // ── Monitors / Inbox ───────────────────────────────────────────────────
    {
      name: "list_monitors",
      description: "List inbox monitors.",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["active", "paused"],
            description: "Filter by monitor status. Omit to return all.",
          },
        },
      },
    },
    {
      name: "create_monitor",
      description: "Create a monitor used by Inbox refresh.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          query: { type: "string" },
          watch_domain: { type: "string" },
          frequency: { type: "string", enum: ["daily", "weekly"] },
          status: { type: "string", enum: ["active", "paused"] },
        },
        required: ["name", "query", "watch_domain"],
      },
    },
    {
      name: "update_monitor",
      description: "Update a monitor.",
      inputSchema: {
        type: "object",
        properties: {
          monitor_id: { type: "number" },
          name: { type: "string" },
          query: { type: "string" },
          watch_domain: { type: "string" },
          frequency: { type: "string", enum: ["daily", "weekly"] },
          status: { type: "string", enum: ["active", "paused"] },
        },
        required: ["monitor_id"],
      },
    },
    {
      name: "delete_monitor",
      description: "Delete a monitor.",
      inputSchema: {
        type: "object",
        properties: {
          monitor_id: { type: "number" },
        },
        required: ["monitor_id"],
      },
    },
    {
      name: "run_monitor",
      description: "Run one monitor now, upsert signals, and update last_run/signal_count.",
      inputSchema: {
        type: "object",
        properties: {
          monitor_id: { type: "number" },
        },
        required: ["monitor_id"],
      },
    },
    {
      name: "refresh_inbox",
      description: "Run all active monitors and return aggregate upserted signal IDs.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_signals",
      description: "List inbox signals with optional status/watch_domain filters.",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["new", "saved", "dismissed"],
          },
          watch_domain: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
    {
      name: "update_signal_status",
      description: "Update one signal's status.",
      inputSchema: {
        type: "object",
        properties: {
          signal_id: { type: "number" },
          status: { type: "string", enum: ["new", "saved", "dismissed"] },
        },
        required: ["signal_id", "status"],
      },
    },
    // ── Investigations ───────────────────────────────────────────────────────
    {
      name: "list_investigations",
      description:
        "List InteliZen investigations with status, use case, signal count, and linked project.",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["active", "archived", "completed"],
            description: "Filter by status. Omit to return all.",
          },
        },
      },
    },
    {
      name: "get_investigation",
      description:
        "Get full investigation details including all collected signals. Run this before analysis.",
      inputSchema: {
        type: "object",
        properties: {
          case_id: { type: "string" },
        },
        required: ["case_id"],
      },
    },
    {
      name: "create_investigation",
      description:
        "Create a new investigation. Returns the generated case_id.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Investigation name" },
          use_case: {
            type: "string",
            enum: ["scoping", "post", "sit_rep"],
            description: "Output type: scoping brief, post draft, or sit rep",
          },
          scope_notes: {
            type: "string",
            description: "Analytical scope and boundaries",
          },
          seed_entities: {
            type: "array",
            items: { type: "string" },
            description: "Key entities to anchor the investigation",
          },
          humint_input: {
            type: "string",
            description: "Optional human intelligence / contractor input",
          },
          project_id: {
            type: "number",
            description: "Parent project ID (optional)",
          },
        },
        required: ["name", "use_case"],
      },
    },
    {
      name: "update_investigation",
      description: "Update investigation fields (scope, use_case, entities, HUMINT, phase).",
      inputSchema: {
        type: "object",
        properties: {
          case_id: { type: "string" },
          name: { type: "string" },
          use_case: {
            type: "string",
            enum: ["scoping", "post", "sit_rep"],
          },
          scope_notes: { type: "string" },
          seed_entities: { type: "array", items: { type: "string" } },
          humint_input: { type: "string" },
          current_phase: { type: "number" },
          status: {
            type: "string",
            enum: ["active", "archived", "completed"],
          },
        },
        required: ["case_id"],
      },
    },
    {
      name: "add_signal_to_investigation",
      description: "Attach a signal to an investigation.",
      inputSchema: {
        type: "object",
        properties: {
          case_id: { type: "string" },
          signal_id: { type: "number" },
          notes: { type: "string" },
        },
        required: ["case_id", "signal_id"],
      },
    },
    {
      name: "import_project_signals_to_investigation",
      description:
        "Bulk-import all signals from a project into an investigation (mirrors 'Add all from parent project' in the app).",
      inputSchema: {
        type: "object",
        properties: {
          case_id: { type: "string" },
          project_id: { type: "number" },
        },
        required: ["case_id", "project_id"],
      },
    },
    // ── Graph ────────────────────────────────────────────────────────────────
    {
      name: "upsert_graph_nodes",
      description:
        "Batch-upsert entity nodes into a graph. Positions are auto-spread if omitted. Linked to a project or standalone (project_id optional).",
      inputSchema: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "Project to link graph to. Omit for standalone graph.",
          },
          nodes: {
            type: "array",
            description: "Nodes to upsert.",
            items: {
              type: "object",
              properties: {
                node_id: { type: "string", description: "Unique kebab-case slug" },
                label:   { type: "string", description: "Display label (≤4 words)" },
                entity_type: {
                  type: "string",
                  enum: ["person", "organisation", "location", "event"],
                },
                position_x: { type: "number" },
                position_y: { type: "number" },
              },
              required: ["node_id", "label", "entity_type"],
            },
          },
        },
        required: ["nodes"],
      },
    },
    {
      name: "upsert_graph_edges",
      description:
        "Batch-upsert relationship edges into a graph. Validates that source and target nodes exist first.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: {
            type: "number",
            description: "Must match the project_id used when creating the nodes.",
          },
          edges: {
            type: "array",
            description: "Edges to upsert.",
            items: {
              type: "object",
              properties: {
                edge_id:        { type: "string", description: "Unique kebab-case slug" },
                source_node_id: { type: "string" },
                target_node_id: { type: "string" },
                label:          { type: "string", description: "Relationship verb (≤3 words)" },
              },
              required: ["edge_id", "source_node_id", "target_node_id"],
            },
          },
        },
        required: ["edges"],
      },
    },
    // ── Vault / Analysis ────────────────────────────────────────────────────
    {
      name: "write_analysis",
      description:
        "Write analysis output to vault and record in vault_files table.",
      inputSchema: {
        type: "object",
        properties: {
          case_id: { type: "string" },
          file_name: { type: "string" },
          file_type: {
            type: "string",
            enum: ["brief", "analysis", "report", "assessment"],
          },
          content: { type: "string" },
        },
        required: ["case_id", "file_name", "file_type", "content"],
      },
    },
    {
      name: "read_vault_file",
      description: "Read an existing vault file for an investigation.",
      inputSchema: {
        type: "object",
        properties: {
          case_id: { type: "string" },
          file_name: { type: "string" },
        },
        required: ["case_id", "file_name"],
      },
    },
    {
      name: "list_vault_files",
      description: "List all vault files recorded for an investigation.",
      inputSchema: {
        type: "object",
        properties: {
          case_id: { type: "string" },
        },
        required: ["case_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // ── run_exa_search ─────────────────────────────────────────────────────────
  if (name === "run_exa_search") {
    const input = args as {
      query: string;
      category?: ExaSearchCategory;
      num_results?: number;
      start_published_date?: string;
      project_id?: number;
    };
    const result = await runSearchAndUpsert(input);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  // ── list_projects ──────────────────────────────────────────────────────────
  if (name === "list_projects") {
    const { data, error } = await supabase
      .schema("anchors").from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── list_operations ───────────────────────────────────────────────────────
  if (name === "list_operations") {
    let query = supabase
      .schema("anchors").from("operations")
      .select("*, projects:projects(count), investigations:investigations(count)")
      .order("created_at", { ascending: false });
    if (args?.status) query = query.eq("status", args.status as string);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── create_operation ──────────────────────────────────────────────────────
  if (name === "create_operation") {
    const { name: operationName, description } = args as {
      name: string;
      description?: string;
    };
    const { data, error } = await supabase
      .schema("anchors").from("operations")
      .insert({ name: operationName, description: description ?? null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── update_operation ──────────────────────────────────────────────────────
  if (name === "update_operation") {
    const { operation_id, ...fields } = args as {
      operation_id: number;
      name?: string;
      description?: string | null;
      status?: string;
    };
    const updates = definedFields(fields);
    const { data, error } = await supabase
      .schema("anchors").from("operations")
      .update(updates)
      .eq("id", operation_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── delete_operation ──────────────────────────────────────────────────────
  if (name === "delete_operation") {
    const { operation_id } = args as { operation_id: number };
    const { error } = await supabase.schema("anchors").from("operations").delete().eq("id", operation_id);
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: `Operation ${operation_id} deleted.` }] };
  }

  // ── create_project ─────────────────────────────────────────────────────────
  if (name === "create_project") {
    const { name: pname, type, watch_domain, notes, operation_id } = args as {
      name: string;
      type: string;
      watch_domain?: string;
      notes?: string;
      operation_id?: number;
    };
    const { data, error } = await supabase
      .schema("anchors").from("projects")
      .insert({ name: pname, type, watch_domain, notes, operation_id: operation_id ?? null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── update_project ────────────────────────────────────────────────────────
  if (name === "update_project") {
    const { project_id, ...fields } = args as {
      project_id: number;
      name?: string;
      type?: string;
      watch_domain?: string | null;
      status?: string;
      notes?: string | null;
      operation_id?: number | null;
    };
    const updates = definedFields(fields);
    const { data, error } = await supabase
      .schema("anchors").from("projects")
      .update(updates)
      .eq("id", project_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── delete_project ────────────────────────────────────────────────────────
  if (name === "delete_project") {
    const { project_id } = args as { project_id: number };
    const { error } = await supabase.schema("anchors").from("projects").delete().eq("id", project_id);
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: `Project ${project_id} deleted.` }] };
  }

  // ── add_signal_to_project ──────────────────────────────────────────────────
  if (name === "add_signal_to_project") {
    const { project_id, signal_id, notes } = args as {
      project_id: number;
      signal_id: number;
      notes?: string;
    };
    const { error } = await supabase
      .schema("intel").from("project_signals")
      .upsert({ project_id, signal_id, notes }, { onConflict: "project_id,signal_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: `Signal ${signal_id} added to project ${project_id}.` }] };
  }

  // ── list_project_signals ───────────────────────────────────────────────────
  if (name === "list_project_signals") {
    const { project_id } = args as { project_id: number };
    const { data, error } = await supabase
      .schema("intel").from("project_signals")
      .select(`signal:signals(id, title, url, source, published_at, snippet, exa_score, status)`)
      .eq("project_id", project_id);
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data?.map((r) => r.signal), null, 2) }] };
  }

  // ── list_monitors ─────────────────────────────────────────────────────────
  if (name === "list_monitors") {
    let query = supabase
      .schema("intel").from("monitors")
      .select("*")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (args?.status) query = query.eq("status", args.status as string);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── create_monitor ────────────────────────────────────────────────────────
  if (name === "create_monitor") {
    const { name: monitorName, query, watch_domain, frequency, status } = args as {
      name: string;
      query: string;
      watch_domain: string;
      frequency?: string;
      status?: string;
    };
    const { data, error } = await supabase
      .schema("intel").from("monitors")
      .insert({
        name: monitorName,
        query,
        watch_domain,
        frequency: frequency ?? "daily",
        status: status ?? "active",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── update_monitor ────────────────────────────────────────────────────────
  if (name === "update_monitor") {
    const { monitor_id, ...fields } = args as {
      monitor_id: number;
      name?: string;
      query?: string;
      watch_domain?: string;
      frequency?: string;
      status?: string;
    };
    const updates = definedFields(fields);
    const { data, error } = await supabase
      .schema("intel").from("monitors")
      .update(updates)
      .eq("id", monitor_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── delete_monitor ────────────────────────────────────────────────────────
  if (name === "delete_monitor") {
    const { monitor_id } = args as { monitor_id: number };
    const { error } = await supabase.schema("intel").from("monitors").delete().eq("id", monitor_id);
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: `Monitor ${monitor_id} deleted.` }] };
  }

  // ── run_monitor ───────────────────────────────────────────────────────────
  if (name === "run_monitor") {
    const { monitor_id } = args as { monitor_id: number };
    const { data: monitor, error } = await supabase
      .schema("intel").from("monitors")
      .select("id, query, watch_domain")
      .eq("id", monitor_id)
      .single();
    if (error) throw new Error(error.message);
    const result = await runMonitor(monitor as { id: number; query: string; watch_domain: string });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  // ── refresh_inbox ─────────────────────────────────────────────────────────
  if (name === "refresh_inbox") {
    const { data: monitors, error } = await supabase
      .schema("intel").from("monitors")
      .select("id, query, watch_domain")
      .eq("status", "active")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const results = [];
    for (const monitor of monitors ?? []) {
      results.push(await runMonitor(monitor as { id: number; query: string; watch_domain: string }));
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              monitor_count: monitors?.length ?? 0,
              signal_ids: results.flatMap((result) => result.signal_ids),
              results,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  // ── list_signals ──────────────────────────────────────────────────────────
  if (name === "list_signals") {
    const { status, watch_domain, limit = 50 } = args as {
      status?: string;
      watch_domain?: string;
      limit?: number;
    };
    let query = supabase
      .schema("intel").from("signals")
      .select("id, monitor_id, title, url, source, published_at, snippet, watch_domain, exa_score, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 200));
    if (status) query = query.eq("status", status);
    if (watch_domain) query = query.eq("watch_domain", watch_domain);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── update_signal_status ──────────────────────────────────────────────────
  if (name === "update_signal_status") {
    const { signal_id, status } = args as {
      signal_id: number;
      status: string;
    };
    const { data, error } = await supabase
      .schema("intel").from("signals")
      .update({ status })
      .eq("id", signal_id)
      .select("id, title, status, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── list_investigations ────────────────────────────────────────────────────
  if (name === "list_investigations") {
    let query = supabase
      .schema("intel").from("investigations")
      .select(
        `id, case_id, name, status, use_case, current_phase,
         scope_notes, seed_entities, created_at, updated_at,
         project:projects(id, name),
         signals:investigation_signals(count)`
      )
      .order("created_at", { ascending: false });
    if (args?.status) query = query.eq("status", args.status as string);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── get_investigation ──────────────────────────────────────────────────────
  if (name === "get_investigation") {
    const { case_id } = args as { case_id: string };
    const { data: investigation, error: invError } = await supabase
      .schema("intel").from("investigations")
      .select(`*, project:projects(id, name, type, watch_domain, notes)`)
      .eq("case_id", case_id)
      .single();
    if (invError) throw new Error(invError.message);
    if (!investigation) throw new Error(`Not found: ${case_id}`);

    const { data: signalRows, error: sigError } = await supabase
      .schema("intel").from("investigation_signals")
      .select(
        `notes, phase_added, added_at,
         signal:signals(id, title, url, source, published_at, snippet, exa_score, status)`
      )
      .eq("investigation_id", investigation.id)
      .order("added_at", { ascending: true });
    if (sigError) throw new Error(sigError.message);

    const result = {
      ...investigation,
      signals:
        signalRows?.map((row) => ({ ...(row.signal as object), notes: row.notes, phase_added: row.phase_added })) ?? [],
    };
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  // ── create_investigation ───────────────────────────────────────────────────
  if (name === "create_investigation") {
    const {
      name: invName,
      use_case,
      scope_notes,
      seed_entities,
      humint_input,
      project_id,
    } = args as {
      name: string;
      use_case: string;
      scope_notes?: string;
      seed_entities?: string[];
      humint_input?: string;
      project_id?: number;
    };

    const case_id = await generateCaseId();

    const { data, error } = await supabase
      .schema("intel").from("investigations")
      .insert({
        case_id,
        name: invName,
        use_case,
        scope_notes: scope_notes ?? null,
        seed_entities: seed_entities ?? [],
        humint_input: humint_input ?? null,
        project_id: project_id ?? null,
        current_phase: 1,
        status: "active",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── update_investigation ───────────────────────────────────────────────────
  if (name === "update_investigation") {
    const { case_id, ...fields } = args as {
      case_id: string;
      name?: string;
      use_case?: string;
      scope_notes?: string;
      seed_entities?: string[];
      humint_input?: string;
      current_phase?: number;
      status?: string;
    };
    const updates = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined)
    );
    const { data, error } = await supabase
      .schema("intel").from("investigations")
      .update(updates)
      .eq("case_id", case_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── add_signal_to_investigation ────────────────────────────────────────────
  if (name === "add_signal_to_investigation") {
    const { case_id, signal_id, notes } = args as {
      case_id: string;
      signal_id: number;
      notes?: string;
    };
    const { data: inv } = await supabase
      .schema("intel").from("investigations")
      .select("id")
      .eq("case_id", case_id)
      .single();
    if (!inv) throw new Error(`Investigation not found: ${case_id}`);

    const { error } = await supabase
      .schema("intel").from("investigation_signals")
      .upsert(
        { investigation_id: inv.id, signal_id, notes: notes ?? null, phase_added: 2 },
        { onConflict: "investigation_id,signal_id", ignoreDuplicates: true }
      );
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: `Signal ${signal_id} added to ${case_id}.` }] };
  }

  // ── import_project_signals_to_investigation ────────────────────────────────
  if (name === "import_project_signals_to_investigation") {
    const { case_id, project_id } = args as {
      case_id: string;
      project_id: number;
    };
    const { data: inv } = await supabase
      .schema("intel").from("investigations")
      .select("id")
      .eq("case_id", case_id)
      .single();
    if (!inv) throw new Error(`Investigation not found: ${case_id}`);

    const { data: projectSignals, error: psError } = await supabase
      .schema("intel").from("project_signals")
      .select("signal_id")
      .eq("project_id", project_id);
    if (psError) throw new Error(psError.message);
    if (!projectSignals?.length) {
      return { content: [{ type: "text", text: "No signals found on project." }] };
    }

    const rows = projectSignals.map(({ signal_id }) => ({
      investigation_id: inv.id,
      signal_id,
      phase_added: 2,
    }));

    const { error } = await supabase
      .schema("intel").from("investigation_signals")
      .upsert(rows, { onConflict: "investigation_id,signal_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);

    return {
      content: [
        {
          type: "text",
          text: `Imported ${projectSignals.length} signals from project ${project_id} into ${case_id}.`,
        },
      ],
    };
  }

  // ── write_analysis ─────────────────────────────────────────────────────────
  if (name === "write_analysis") {
    const { case_id, file_name, file_type, content } = args as {
      case_id: string;
      file_name: string;
      file_type: string;
      content: string;
    };
    const filePath = vaultPath("investigations", case_id, file_name);
    ensureDir(filePath);
    writeFileSync(filePath, content, "utf-8");
    const { error } = await supabase.schema("ingest").from("vault_files").insert({
      case_id,
      file_type,
      file_path: join("investigations", case_id, file_name),
      file_name,
      generated_by: "claude-mcp",
    });
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: `Written: ${filePath}` }] };
  }

  // ── read_vault_file ────────────────────────────────────────────────────────
  if (name === "read_vault_file") {
    const { case_id, file_name } = args as { case_id: string; file_name: string };
    const filePath = vaultPath("investigations", case_id, file_name);
    if (!existsSync(filePath)) throw new Error(`Not found: ${filePath}`);
    return { content: [{ type: "text", text: readFileSync(filePath, "utf-8") }] };
  }

  // ── list_vault_files ───────────────────────────────────────────────────────
  if (name === "list_vault_files") {
    const { case_id } = args as { case_id: string };
    const { data, error } = await supabase
      .schema("ingest").from("vault_files")
      .select("*")
      .eq("case_id", case_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── upsert_graph_nodes ────────────────────────────────────────────────────
  if (name === "upsert_graph_nodes") {
    const { project_id, nodes } = args as {
      project_id?: number;
      nodes: Array<{
        node_id: string;
        label: string;
        entity_type: string;
        position_x?: number;
        position_y?: number;
      }>;
    };

    // Auto-spread positions using a grid layout centred at (3000, 2000)
    const COLS = Math.ceil(Math.sqrt(nodes.length));
    const SPACING = 500;
    const ORIGIN_X = 3000 - Math.floor(COLS / 2) * SPACING;
    const ORIGIN_Y = 2000 - Math.floor(nodes.length / COLS / 2) * SPACING;

    const rows = nodes.map((n, i) => ({
      project_id: project_id ?? null,
      node_id: n.node_id,
      label: n.label,
      entity_type: n.entity_type,
      position_x: n.position_x ?? ORIGIN_X + (i % COLS) * SPACING,
      position_y: n.position_y ?? ORIGIN_Y + Math.floor(i / COLS) * SPACING,
    }));

    const { error } = await supabase
      .schema("intel").from("graph_nodes")
      .upsert(rows, { onConflict: "project_id,node_id", ignoreDuplicates: false });
    if (error) throw new Error(error.message);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ upserted: rows.length, node_ids: rows.map((r) => r.node_id) }, null, 2),
        },
      ],
    };
  }

  // ── upsert_graph_edges ────────────────────────────────────────────────────
  if (name === "upsert_graph_edges") {
    const { project_id, edges } = args as {
      project_id?: number;
      edges: Array<{
        edge_id: string;
        source_node_id: string;
        target_node_id: string;
        label?: string;
      }>;
    };

    // Validate all referenced node_ids exist
    const referencedIds = [...new Set(edges.flatMap((e) => [e.source_node_id, e.target_node_id]))];
    const nodeQuery = supabase
      .schema("intel").from("graph_nodes")
      .select("node_id")
      .in("node_id", referencedIds);
    if (project_id !== undefined) {
      nodeQuery.eq("project_id", project_id);
    } else {
      nodeQuery.is("project_id", null);
    }
    const { data: existingNodes, error: nodeErr } = await nodeQuery;
    if (nodeErr) throw new Error(nodeErr.message);

    const existingIds = new Set(existingNodes?.map((n: { node_id: string }) => n.node_id) ?? []);
    const invalid = referencedIds.filter((id) => !existingIds.has(id));
    if (invalid.length > 0) {
      throw new Error(`Referenced node_ids not found: ${invalid.join(", ")}`);
    }

    const rows = edges.map((e) => ({
      project_id: project_id ?? null,
      edge_id: e.edge_id,
      source_node_id: e.source_node_id,
      target_node_id: e.target_node_id,
      label: e.label ?? null,
    }));

    const { error } = await supabase
      .schema("intel").from("graph_edges")
      .upsert(rows, { onConflict: "project_id,edge_id", ignoreDuplicates: false });
    if (error) throw new Error(error.message);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ upserted: rows.length, edge_ids: rows.map((r) => r.edge_id) }, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("InteliZen MCP server v2 running\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
