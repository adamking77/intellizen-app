import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { dryRunPreview, resolveHomePinPlacement, type HomePinPlacement } from "./write-contract.js";

type WorkEvent = (input: {
  record_id?: string | null;
  event_kind: string;
  actor: string;
  durable_role?: string | null;
  summary?: string | null;
  payload?: Record<string, unknown>;
}) => Promise<void>;

type Database = { id: string; entity?: string | null; taxonomy?: Record<string, unknown> | null };
type PinRecord = { id: string; fields: Record<string, unknown> };
type Dependencies = {
  findHomePinsDatabase: () => Promise<Database | null>;
  ensureHomePinsDatabase: () => Promise<Database>;
  listHomePinRecords: (databaseId: string) => Promise<PinRecord[]>;
  recordWorkEvent: WorkEvent;
};

type WriteInput = {
  actor: string;
  durable_role?: string | null;
  summary?: string | null;
  confirm_write?: boolean;
};

const TASKS_DATABASE_ID = "654acc9c-0270-49e2-86f7-788e25c59a76";
export const HOME_PIN_FIELDS = {
  pinId: "home_pin_id",
  kind: "home_pin_kind",
  databaseId: "home_pin_database_id",
  viewId: "home_pin_view_id",
  title: "home_pin_title",
  filter: "home_pin_filter",
  config: "home_pin_config",
  widget: "home_pin_widget",
  pinnedAt: "home_pin_pinned_at",
  x: "home_pin_x",
  y: "home_pin_y",
  w: "home_pin_w",
  h: "home_pin_h",
} as const;
const PLUGIN_STAGE = join(homedir(), ".hermes", "plugins", ".intellizen-staging");

export const promisedTools = [
  {
    name: "move_card",
    description: "Preview or move one Hermes kanban card to another column through the running engine's REST door. Every confirmed move emits a workspace.work_events receipt.",
    inputSchema: {
      type: "object",
      properties: {
        board: { type: "string", description: "Hermes board slug." },
        card_id: { type: "string" },
        status: { type: "string", description: "Exact target column name." },
        actor: { type: "string" },
        durable_role: { type: "string" },
        summary: { type: "string" },
        confirm_write: { type: "boolean", description: "Required true to move the card. Defaults to preview only." },
      },
      required: ["board", "card_id", "status", "actor"],
    },
  },
  {
    name: "pin_plugin_widget",
    description: "Preview or pin an installed plugin widget to the shared Home Pins grid. The desktop app picks the record up without per-Mac localStorage. Every confirmed pin emits a workspace.work_events receipt.",
    inputSchema: {
      type: "object",
      properties: {
        plugin_id: { type: "string" },
        widget_id: { type: "string" },
        title: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        actor: { type: "string" },
        durable_role: { type: "string" },
        summary: { type: "string" },
        confirm_write: { type: "boolean", description: "Required true to pin. Defaults to preview only." },
      },
      required: ["plugin_id", "widget_id", "actor"],
    },
  },
  {
    name: "author_plugin",
    description: "Preview or stage an IntelliZen plugin and open an ordinary workspace Tasks record for Adam's approval. This never installs or loads the plugin. Every confirmed staging write emits a workspace.work_events receipt.",
    inputSchema: {
      type: "object",
      properties: {
        plugin_id: { type: "string", description: "Lowercase folder slug." },
        name: { type: "string" },
        description: { type: "string" },
        version: { type: "string" },
        source: { type: "string", description: "Contents of intellizen/plugin.js." },
        actor: { type: "string" },
        durable_role: { type: "string" },
        summary: { type: "string" },
        confirm_write: { type: "boolean", description: "Required true to write staging files and the approval record. Defaults to preview only." },
      },
      required: ["plugin_id", "name", "source", "actor"],
    },
  },
] as const;

type Engine = { port: number; token: string };

export function parseEngineRecord(value: unknown): Engine | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!Number.isInteger(record.port) || (record.port as number) < 1 || (record.port as number) > 65_535) return null;
  if (typeof record.token !== "string" || !record.token) return null;
  return { port: record.port as number, token: record.token };
}

function engineCandidates() {
  const override = process.env.INTELLIZEN_ENGINE_RECORD;
  return [
    ...(override ? [override] : []),
    join(homedir(), "Library", "Application Support", "com.genzen.intellizen", "engine.json"),
    join(homedir(), "Library", "Application Support", "com.genzen.intellizen.dev", "engine.json"),
  ];
}

async function resolveEngine(): Promise<Engine> {
  for (const path of engineCandidates()) {
    try {
      const engine = parseEngineRecord(JSON.parse(readFileSync(path, "utf8")));
      if (!engine) continue;
      const response = await fetch(`http://127.0.0.1:${engine.port}/api/health`, {
        headers: { "x-hermes-session-token": engine.token },
      });
      if (response.ok) return engine;
    } catch {
      // Try the next exact app record; never scan or scrape processes here.
    }
  }
  throw new Error("Hermes is offline. Open IntelliZen or start its engine before using move_card.");
}

async function hermes<T>(engine: Engine, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${engine.port}${path}`, {
    ...init,
    headers: { "content-type": "application/json", "x-hermes-session-token": engine.token, ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status}`);
  return response.json() as Promise<T>;
}

async function moveCard(input: WriteInput & { board: string; card_id: string; status: string }, receipt: WorkEvent) {
  const board = input.board.trim();
  const cardId = input.card_id.trim();
  const status = input.status.trim();
  if (!board || !cardId || !status) throw new Error("move_card needs board, card_id, and status.");
  const engine = await resolveEngine();
  const snapshot = await hermes<{ columns?: Array<{ name?: string; tasks?: Array<Record<string, unknown>> }> }>(
    engine,
    `/api/plugins/kanban/board?board=${encodeURIComponent(board)}`,
  );
  const columns = snapshot.columns ?? [];
  const cards: Array<Record<string, unknown> & { column?: string }> = columns.flatMap(
    (column) => (column.tasks ?? []).map((card) => ({ ...card, column: column.name })),
  );
  const current = cards.find((card) => card.id === cardId);
  if (!current) throw new Error(`Card ${cardId} was not found on board ${board}.`);
  if (!columns.some((column) => column.name === status)) throw new Error(`Board ${board} has no “${status}” column.`);
  const payload = { board, card_id: cardId, title: current.title ?? null, from: current.column ?? null, to: status };
  if (current.column === status) return { dry_run: false, write_performed: false, already_in_column: true, ...payload };
  if (!input.confirm_write) return dryRunPreview("move_card", "move this kanban card", payload);
  const result = await hermes<{ task?: Record<string, unknown> }>(
    engine,
    `/api/plugins/kanban/tasks/${encodeURIComponent(cardId)}?board=${encodeURIComponent(board)}`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
  if (!result.task) throw new Error("Hermes returned no moved card.");
  await receipt({
    event_kind: "kanban.card_moved",
    actor: input.actor,
    durable_role: input.durable_role,
    summary: input.summary ?? `Moved “${String(current.title ?? cardId)}” from ${String(current.column)} to ${status}`,
    payload: { tool: "move_card", ...payload },
  });
  return { dry_run: false, write_performed: true, card: result.task };
}

function number(value: unknown, fallback: number, minimum: number, maximum = Number.MAX_SAFE_INTEGER) {
  const result = value === undefined ? fallback : value;
  if (!Number.isInteger(result) || (result as number) < minimum || (result as number) > maximum) {
    throw new Error(`Grid value must be an integer from ${minimum} to ${maximum}.`);
  }
  return result as number;
}

function pinPlacement(record: PinRecord): HomePinPlacement {
  return {
    x: number(record.fields[HOME_PIN_FIELDS.x], 0, 0),
    y: number(record.fields[HOME_PIN_FIELDS.y], 0, 0),
    w: number(record.fields[HOME_PIN_FIELDS.w], 4, 3, 12),
    h: number(record.fields[HOME_PIN_FIELDS.h], 11, 8),
  };
}

function pluginWidget(value: unknown): { pluginId: string; widgetId: string } | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object") return null;
    const row = parsed as Record<string, unknown>;
    return typeof row.pluginId === "string" && typeof row.widgetId === "string"
      ? { pluginId: row.pluginId, widgetId: row.widgetId }
      : null;
  } catch {
    return null;
  }
}

async function pinPluginWidget(supabase: SupabaseClient, input: WriteInput & {
  plugin_id: string;
  widget_id: string;
  title?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}, deps: Dependencies) {
  const pluginId = input.plugin_id.trim();
  const widgetId = input.widget_id.trim();
  if (!pluginId || !widgetId) throw new Error("pin_plugin_widget needs plugin_id and widget_id.");
  const existingDatabase = await deps.findHomePinsDatabase();
  const records = existingDatabase ? await deps.listHomePinRecords(existingDatabase.id) : [];
  const duplicate = records.find((record) => {
    const widget = pluginWidget(record.fields[HOME_PIN_FIELDS.widget]);
    return widget?.pluginId === pluginId && widget.widgetId === widgetId;
  });
  if (duplicate) return { dry_run: false, write_performed: false, already_pinned: true, pin_record_id: duplicate.id };
  const w = number(input.width, 4, 3, 12);
  const h = number(input.height, 11, 8);
  const placement = resolveHomePinPlacement(records.map(pinPlacement), { x: input.x, y: input.y, w, h }, 12);
  const pinId = randomUUID();
  const title = input.title?.trim() || widgetId;
  const widget = { pluginId, widgetId };
  const payload = { plugin_id: pluginId, widget_id: widgetId, title, placement };
  if (!input.confirm_write) return dryRunPreview("pin_plugin_widget", "pin this plugin widget", payload);
  const database = existingDatabase ?? await deps.ensureHomePinsDatabase();

  const { data, error } = await supabase.schema("workspace").from("records").insert([{
    database_id: database.id,
    entity: database.entity ?? "genzen",
    fields: {
      [HOME_PIN_FIELDS.pinId]: pinId,
      [HOME_PIN_FIELDS.kind]: "plugin",
      [HOME_PIN_FIELDS.title]: title,
      [HOME_PIN_FIELDS.widget]: JSON.stringify(widget),
      [HOME_PIN_FIELDS.pinnedAt]: new Date().toISOString(),
      [HOME_PIN_FIELDS.x]: placement.x,
      [HOME_PIN_FIELDS.y]: placement.y,
      [HOME_PIN_FIELDS.w]: placement.w,
      [HOME_PIN_FIELDS.h]: placement.h,
    },
    body: null,
    taxonomy: { ...(database.taxonomy ?? {}), object_type: "home_dashboard_pin", routing_rule: "home_dashboard_pins" },
  }]).select("id").single();
  if (error) throw new Error(error.message);
  const recordId = (data as { id: string }).id;
  await deps.recordWorkEvent({
    record_id: recordId,
    event_kind: "plugin_widget.pinned",
    actor: input.actor,
    durable_role: input.durable_role,
    summary: input.summary ?? `Pinned ${pluginId}:${widgetId} to Home`,
    payload: { tool: "pin_plugin_widget", pin_id: pinId, ...payload },
  });
  return { dry_run: false, write_performed: true, pin_record_id: recordId, pin_id: pinId, ...payload };
}

export function pluginStagePlan(pluginId: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(pluginId)) {
    throw new Error("plugin_id must be a lowercase slug containing letters, numbers, and hyphens.");
  }
  const root = join(PLUGIN_STAGE, pluginId);
  return { root, manifest: join(root, "plugin.yaml"), entry: join(root, "intellizen", "plugin.js") };
}

async function authorPlugin(supabase: SupabaseClient, input: WriteInput & {
  plugin_id: string;
  name: string;
  description?: string;
  version?: string;
  source: string;
}, receipt: WorkEvent) {
  const pluginId = input.plugin_id.trim();
  const plan = pluginStagePlan(pluginId);
  const name = input.name.trim();
  const source = input.source.trim();
  if (!name || !source) throw new Error("author_plugin needs a name and non-empty source.");
  if (!/export\s+default/.test(source) || !/\bregister\s*[:(]/.test(source)) {
    throw new Error("Plugin source must default-export an object with register(ctx).");
  }
  const manifest = [
    `name: ${JSON.stringify(name)}`,
    `version: ${JSON.stringify(input.version?.trim() || "0.1.0")}`,
    ...(input.description?.trim() ? [`description: ${JSON.stringify(input.description.trim())}`] : []),
    "",
  ].join("\n");
  const payload = { plugin_id: pluginId, name, staging_path: plan.root, files: ["plugin.yaml", "intellizen/plugin.js"] };
  if (existsSync(plan.root)) throw new Error(`A staged plugin already exists at ${plan.root}; choose a new plugin_id.`);
  if (!input.confirm_write) return dryRunPreview("author_plugin", "stage this plugin and open its approval record", payload);

  mkdirSync(PLUGIN_STAGE, { recursive: true });
  mkdirSync(plan.root);
  mkdirSync(join(plan.root, "intellizen"));
  writeFileSync(plan.manifest, manifest, { encoding: "utf8", flag: "wx" });
  writeFileSync(plan.entry, `${source}\n`, { encoding: "utf8", flag: "wx" });

  const body = `## Plugin installation approval\n\nStaged by: ${input.actor}\nStaging path: ${plan.root}\nFiles:\n- plugin.yaml\n- intellizen/plugin.js\n\nApproval needed: review the staged code and explicitly approve installation. Staging does not load or install it.`;
  const { data, error } = await supabase.schema("workspace").from("records").insert([{
    database_id: TASKS_DATABASE_ID,
    entity: "genzen",
    fields: { task_name: `Approve plugin: ${name}`, task_status: "In progress", task_stage: "Review", task_assignee: input.actor },
    body,
    taxonomy: { entity: "genzen", area: "internal_ops", object_type: "plugin_install_approval", routing_rule: "tasks" },
  }]).select("id").single();
  if (error) throw new Error(`${error.message} The staged files remain at ${plan.root} for recovery.`);
  const recordId = (data as { id: string }).id;
  await receipt({
    record_id: recordId,
    event_kind: "plugin.staged",
    actor: input.actor,
    durable_role: input.durable_role,
    summary: input.summary ?? `Staged plugin “${name}” for approval`,
    payload: { tool: "author_plugin", ...payload, approval_record_id: recordId },
  });
  return { dry_run: false, write_performed: true, approval_record_id: recordId, ...payload };
}

export async function callPromisedTool(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
  deps: Dependencies,
): Promise<unknown | null> {
  if (name === "move_card") return moveCard(args as never, deps.recordWorkEvent);
  if (name === "pin_plugin_widget") return pinPluginWidget(supabase, args as never, deps);
  if (name === "author_plugin") return authorPlugin(supabase, args as never, deps.recordWorkEvent);
  return null;
}
