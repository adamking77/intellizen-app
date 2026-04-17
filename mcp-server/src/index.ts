import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  "https://jicrdrwtwubveyvzyyrh.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppY3Jkcnd0d3VidmV5dnp5eXJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NTI2MjgsImV4cCI6MjA4NzIyODYyOH0.tvPbYnbvHFhBp2u44h9P-O4DFFj9pd6mepuA0Yk9cvc";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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

const server = new Server(
  { name: "intelizen", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_investigations",
      description:
        "List InteliZen investigations. Returns id, case_id, name, status, use_case, current_phase, project, and signal count.",
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
        "Get full investigation details including scope, seed entities, HUMINT input, and all collected signals. Run this before performing analysis.",
      inputSchema: {
        type: "object",
        properties: {
          case_id: {
            type: "string",
            description: "Investigation case_id slug, e.g. 'case-2026-001'",
          },
        },
        required: ["case_id"],
      },
    },
    {
      name: "list_projects",
      description: "List all InteliZen projects with their type and status.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "write_analysis",
      description:
        "Write analysis output (brief, report, assessment) to the vault and record it in the database. Use after completing inline analysis.",
      inputSchema: {
        type: "object",
        properties: {
          case_id: {
            type: "string",
            description: "Investigation case_id slug",
          },
          file_name: {
            type: "string",
            description: "Filename including extension, e.g. 'scoping-brief.md'",
          },
          file_type: {
            type: "string",
            enum: ["brief", "analysis", "report", "assessment"],
            description: "Type of output file",
          },
          content: {
            type: "string",
            description: "Full markdown content to write",
          },
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

    if (args?.status) {
      query = query.eq("status", args.status as string);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  if (name === "get_investigation") {
    const { case_id } = args as { case_id: string };

    const { data: investigation, error: invError } = await supabase
      .from("investigations")
      .select(
        `*, project:projects(id, name, type, watch_domain, notes)`
      )
      .eq("case_id", case_id)
      .single();

    if (invError) throw new Error(invError.message);
    if (!investigation) throw new Error(`Investigation not found: ${case_id}`);

    const { data: signalRows, error: sigError } = await supabase
      .from("investigation_signals")
      .select(
        `notes, phase_added, added_at,
         signal:intel_signals(
           id, title, url, source, published_at, snippet, exa_score, status
         )`
      )
      .eq("investigation_id", investigation.id)
      .order("added_at", { ascending: true });

    if (sigError) throw new Error(sigError.message);

    const result = {
      ...investigation,
      signals:
        signalRows?.map((row) => ({
          ...(row.signal as object),
          notes: row.notes,
          phase_added: row.phase_added,
        })) ?? [],
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  if (name === "list_projects") {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

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

    const relPath = join("investigations", case_id, file_name);
    const { error } = await supabase.from("vault_files").insert({
      case_id,
      file_type,
      file_path: relPath,
      file_name,
      generated_by: "claude-mcp",
    });

    if (error) throw new Error(error.message);

    return {
      content: [
        {
          type: "text",
          text: `Written: ${filePath}\nRecorded in vault_files as '${file_type}'.`,
        },
      ],
    };
  }

  if (name === "read_vault_file") {
    const { case_id, file_name } = args as {
      case_id: string;
      file_name: string;
    };

    const filePath = vaultPath("investigations", case_id, file_name);
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = readFileSync(filePath, "utf-8");
    return { content: [{ type: "text", text: content }] };
  }

  if (name === "list_vault_files") {
    const { case_id } = args as { case_id: string };

    const { data, error } = await supabase
      .from("vault_files")
      .select("*")
      .eq("case_id", case_id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("InteliZen MCP server running\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
