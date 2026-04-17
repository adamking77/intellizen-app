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

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  "https://jicrdrwtwubveyvzyyrh.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppY3Jkcnd0d3VidmV5dnp5eXJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NTI2MjgsImV4cCI6MjA4NzIyODYyOH0.tvPbYnbvHFhBp2u44h9P-O4DFFj9pd6mepuA0Yk9cvc";
const EXA_API_KEY =
  process.env.EXA_API_KEY ?? "ca04e163-e55b-49ca-9b40-3454d11a35d6";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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

async function generateCaseId(): Promise<string> {
  const { count } = await supabase
    .from("investigations")
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
        },
        required: ["name", "type"],
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
    const {
      query,
      category = "web",
      num_results = 10,
      start_published_date,
      project_id,
    } = args as {
      query: string;
      category?: string;
      num_results?: number;
      start_published_date?: string;
      project_id?: number;
    };

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
        .from("intel_signals")
        .upsert(
          {
            title: r.title ?? r.url,
            url: r.url,
            source,
            published_at: (r as { publishedDate?: string }).publishedDate ?? null,
            snippet,
            exa_score: r.score ?? null,
            watch_domain: query.slice(0, 100),
            raw_payload: r,
            status: "new",
          },
          { onConflict: "url", ignoreDuplicates: true }
        )
        .select("id")
        .single();

      if (!error && data) {
        upserted.push(data.id);
      } else if (error?.code === "23505" || error?.code === "PGRST116") {
        // Already exists — fetch the id
        const { data: existing } = await supabase
          .from("intel_signals")
          .select("id")
          .eq("url", r.url)
          .single();
        if (existing) upserted.push(existing.id);
      }
    }

    // Optionally attach to project
    if (project_id && upserted.length > 0) {
      const rows = upserted.map((signal_id) => ({ project_id, signal_id }));
      await supabase
        .from("project_signals")
        .upsert(rows, { onConflict: "project_id,signal_id", ignoreDuplicates: true });
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            query,
            total_results: res.results.length,
            signal_ids: upserted,
            titles: (res.results as Array<{ title?: string; url: string }>).map((r) => r.title ?? r.url),
          }, null, 2),
        },
      ],
    };
  }

  // ── list_projects ──────────────────────────────────────────────────────────
  if (name === "list_projects") {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── create_project ─────────────────────────────────────────────────────────
  if (name === "create_project") {
    const { name: pname, type, watch_domain, notes } = args as {
      name: string;
      type: string;
      watch_domain?: string;
      notes?: string;
    };
    const { data, error } = await supabase
      .from("projects")
      .insert({ name: pname, type, watch_domain, notes })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  // ── add_signal_to_project ──────────────────────────────────────────────────
  if (name === "add_signal_to_project") {
    const { project_id, signal_id, notes } = args as {
      project_id: number;
      signal_id: number;
      notes?: string;
    };
    const { error } = await supabase
      .from("project_signals")
      .upsert({ project_id, signal_id, notes }, { onConflict: "project_id,signal_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: `Signal ${signal_id} added to project ${project_id}.` }] };
  }

  // ── list_project_signals ───────────────────────────────────────────────────
  if (name === "list_project_signals") {
    const { project_id } = args as { project_id: number };
    const { data, error } = await supabase
      .from("project_signals")
      .select(`signal:intel_signals(id, title, url, source, published_at, snippet, exa_score, status)`)
      .eq("project_id", project_id);
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data?.map((r) => r.signal), null, 2) }] };
  }

  // ── list_investigations ────────────────────────────────────────────────────
  if (name === "list_investigations") {
    let query = supabase
      .from("investigations")
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
      .from("investigations")
      .select(`*, project:projects(id, name, type, watch_domain, notes)`)
      .eq("case_id", case_id)
      .single();
    if (invError) throw new Error(invError.message);
    if (!investigation) throw new Error(`Not found: ${case_id}`);

    const { data: signalRows, error: sigError } = await supabase
      .from("investigation_signals")
      .select(
        `notes, phase_added, added_at,
         signal:intel_signals(id, title, url, source, published_at, snippet, exa_score, status)`
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
      .from("investigations")
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
      .from("investigations")
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
      .from("investigations")
      .select("id")
      .eq("case_id", case_id)
      .single();
    if (!inv) throw new Error(`Investigation not found: ${case_id}`);

    const { error } = await supabase
      .from("investigation_signals")
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
      .from("investigations")
      .select("id")
      .eq("case_id", case_id)
      .single();
    if (!inv) throw new Error(`Investigation not found: ${case_id}`);

    const { data: projectSignals, error: psError } = await supabase
      .from("project_signals")
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
      .from("investigation_signals")
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
    const { error } = await supabase.from("vault_files").insert({
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
      .from("vault_files")
      .select("*")
      .eq("case_id", case_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
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
