import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("@/lib/supabase", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("https://fixture.supabase.co", "fixture-anon-key", { global: { fetch: mocks.fetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) };
});

import {
  getWorkspaceDatabaseRecordModel,
  listWorkspaceDatabaseRecordFields,
  listWorkspaceDatabaseWayIn,
} from "./data";

const database = {
  id: "database-1",
  entity: "genzen",
  name: "Tasks",
  icon: null,
  schema: [],
  header_field_ids: [],
  taxonomy: {},
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-02T00:00:00.000Z",
};

function json(value: unknown, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json", ...headers } });
}

afterEach(() => vi.clearAllMocks());

describe("database way-in reads", () => {
  it("uses an exact record head count and makes a capped revision delta explicitly lower-bound", async () => {
    mocks.fetch.mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/databases")) return Promise.resolve(json([database]));
      if (url.pathname.endsWith("/records")) return Promise.resolve(new Response(null, { status: 200, headers: { "content-range": "0-0/7" } }));
      if (url.pathname.endsWith("/record_revisions")) return Promise.resolve(json(Array.from({ length: 500 }, () => ({ database_id: database.id }))));
      throw new Error(`Unexpected request: ${url.pathname}`);
    });

    await expect(listWorkspaceDatabaseWayIn({ since: "2026-09-01T00:00:00.000Z" })).resolves.toEqual([
      expect.objectContaining({ id: database.id, recordCount: 7, revisionCount: 500, revisionCountCapped: true }),
    ]);
    expect(new URL(String(mocks.fetch.mock.calls[1]?.[0])).pathname).toBe("/rest/v1/records");
  });

  it("pages record fields in deterministic order and reports completion", async () => {
    const firstPage = Array.from({ length: 250 }, (_, index) => ({ id: `record-${index}`, fields: { position: index } }));
    mocks.fetch.mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (!url.pathname.endsWith("/records")) throw new Error(`Unexpected request: ${url.pathname}`);
      return Promise.resolve(json(url.searchParams.get("offset") === "250" ? [{ id: "record-250", fields: { position: 250 } }] : firstPage));
    });

    await expect(listWorkspaceDatabaseRecordFields(database.id)).resolves.toEqual({
      complete: true,
      records: [...firstPage, { id: "record-250", fields: { position: 250 } }],
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("stops at the 5,000-record ceiling and marks the field inventory incomplete", async () => {
    mocks.fetch.mockImplementation(() => Promise.resolve(json(Array.from({ length: 250 }, (_, index) => ({ id: `record-${index}`, fields: {} })))));

    const result = await listWorkspaceDatabaseRecordFields(database.id);

    expect(result.complete).toBe(false);
    expect(result.records).toHaveLength(5_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(20);
  });

  it("rejects a direct record route when the record belongs to another database", async () => {
    mocks.fetch.mockResolvedValue(json({
      id: "record-1",
      database_id: "other-database",
      fields: {},
      body: null,
      taxonomy: {},
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    }));

    await expect(getWorkspaceDatabaseRecordModel("record-1", database.id)).rejects.toThrow("not present in this database");
  });
});
