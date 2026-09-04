import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { callPromisedTool, parseEngineRecord, pluginStagePlan, promisedTools } from "./promised-tools.js";
import { DRY_RUN_BANNER } from "./write-contract.js";

const unusedSupabase = {} as SupabaseClient;
const receipt = async () => undefined;

test("engine records accept only a usable local port and token", () => {
  assert.deepEqual(parseEngineRecord({ port: 4242, token: "secret" }), { port: 4242, token: "secret" });
  assert.equal(parseEngineRecord({ port: 0, token: "secret" }), null);
  assert.equal(parseEngineRecord({ port: 4242, token: "" }), null);
  assert.equal(parseEngineRecord("not a record"), null);
});

test("plugin staging stays in the loader-ignored staging tree", () => {
  const plan = pluginStagePlan("weather-card");
  assert.match(plan.root, /\.hermes\/plugins\/\.intellizen-staging\/weather-card$/);
  assert.equal(plan.entry, `${plan.root}/intellizen/plugin.js`);
  assert.throws(() => pluginStagePlan("../escape"), /lowercase slug/);
  assert.throws(() => pluginStagePlan("Uppercase"), /lowercase slug/);
});

test("every promised mutation requires explicit write confirmation", () => {
  assert.deepEqual(promisedTools.map((tool) => tool.name), ["move_card", "pin_plugin_widget", "author_plugin"]);
  for (const tool of promisedTools) assert.ok("confirm_write" in tool.inputSchema.properties, tool.name);
});

test("pin preview does not create the Home Pins database", async () => {
  let ensured = false;
  const result = await callPromisedTool(unusedSupabase, "pin_plugin_widget", {
    plugin_id: "weather",
    widget_id: "forecast",
    actor: "test",
  }, {
    findHomePinsDatabase: async () => null,
    ensureHomePinsDatabase: async () => {
      ensured = true;
      return { id: "pins" };
    },
    listHomePinRecords: async () => [],
    recordWorkEvent: receipt,
  }) as Record<string, unknown>;

  assert.equal(result.banner, DRY_RUN_BANNER);
  assert.equal(result.write_performed, false);
  assert.equal(ensured, false);
});

test("confirmed plugin pin writes the shared record shape and its receipt", async () => {
  let inserted: Record<string, unknown> | undefined;
  let event: Record<string, unknown> | undefined;
  const supabase = {
    schema: () => ({
      from: () => ({
        insert: (rows: Record<string, unknown>[]) => {
          [inserted] = rows;
          return { select: () => ({ single: async () => ({ data: { id: "record-1" }, error: null }) }) };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  const result = await callPromisedTool(supabase, "pin_plugin_widget", {
    plugin_id: "weather",
    widget_id: "forecast",
    title: "Forecast",
    actor: "test",
    confirm_write: true,
  }, {
    findHomePinsDatabase: async () => ({ id: "pins", entity: "genzen" }),
    ensureHomePinsDatabase: async () => ({ id: "pins" }),
    listHomePinRecords: async () => [],
    recordWorkEvent: async (input) => { event = input; },
  }) as Record<string, unknown>;

  const fields = inserted?.fields as Record<string, unknown>;
  assert.equal(fields.home_pin_kind, "plugin");
  assert.equal(fields.home_pin_widget, JSON.stringify({ pluginId: "weather", widgetId: "forecast" }));
  assert.equal(result.write_performed, true);
  assert.equal(event?.event_kind, "plugin_widget.pinned");
  assert.equal(event?.record_id, "record-1");
});

test("author preview neither stages files nor opens an approval record", async () => {
  const pluginId = `test-preview-${Date.now()}`;
  const result = await callPromisedTool(unusedSupabase, "author_plugin", {
    plugin_id: pluginId,
    name: "Preview",
    source: "export default { register(ctx) { return ctx; } };",
    actor: "test",
  }, {
    findHomePinsDatabase: async () => null,
    ensureHomePinsDatabase: async () => ({ id: "pins" }),
    listHomePinRecords: async () => [],
    recordWorkEvent: receipt,
  }) as Record<string, unknown>;

  assert.equal(result.banner, DRY_RUN_BANNER);
  assert.equal(result.write_performed, false);
  assert.match(String(result.staging_path), new RegExp(`${pluginId}$`));
});
