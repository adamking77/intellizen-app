import { afterEach, describe, expect, it, vi } from "vitest";
import { listWorkEvents } from "./work-receipts";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/supabase", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("https://fixture.supabase.co", "fixture-anon-key", { global: { fetch: mocks.fetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) };
});
afterEach(() => vi.clearAllMocks());
describe("session receipt database request", () => {
  it("sends session correlation filters with the limit so unrelated recent events cannot exhaust it", async () => {
    mocks.fetch.mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    await listWorkEvents({ sessionId: "older-session", sessionProfile: "fiona", limit: 500 });
    const url = new URL(String(mocks.fetch.mock.calls[0][0]));
    expect(url.pathname).toBe("/rest/v1/work_events");
    expect(url.searchParams.get("limit")).toBe("500");
    const filter = url.searchParams.get("or");
    for (const key of ["session_id", "sessionId", "session_key", "sessionKey"]) {
      expect(filter).toContain(`payload->>${key}.eq."older-session"`);
      expect(filter).toContain(`payload->>${key}.eq."fiona:older-session"`);
    }
  });
  it("quotes reserved characters in session identifiers in the filter grammar", async () => {
    mocks.fetch.mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    await listWorkEvents({ sessionId: 'session,"x"', sessionProfile: "fiona" });
    const url = new URL(String(mocks.fetch.mock.calls[0][0]));
    expect(url.searchParams.get("or")).toContain(`payload->>session_id.eq.${JSON.stringify('session,"x"')}`);
  });
});
