import { describe, expect, it, vi } from "vitest";
import { createNativeSupabaseFetch } from "./supabase-native-fetch";

describe("native Supabase fetch", () => {
  it("forwards the request through the constrained native command", async () => {
    const invoke = vi.fn(async () => ({
      status: 200,
      statusText: "OK",
      headers: [["content-type", "application/json"]],
      bodyBase64: btoa(JSON.stringify([{ id: "record-1" }])),
    }));
    const nativeFetch = createNativeSupabaseFetch(invoke);

    const response = await nativeFetch(
      "https://example.supabase.co/rest/v1/records?select=id",
      {
        method: "POST",
        headers: {
          apikey: "anon-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Draft" }),
      },
    );

    expect(await response.json()).toEqual([{ id: "record-1" }]);
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("supabase_proxy_request", {
      input: expect.objectContaining({
        url: "https://example.supabase.co/rest/v1/records?select=id",
        method: "POST",
        headers: expect.arrayContaining([
          ["apikey", "anon-key"],
          ["content-type", "application/json"],
        ]),
        bodyBase64: btoa(JSON.stringify({ name: "Draft" })),
      }),
    });
  });

  it("preserves HTTP error responses for Supabase to interpret", async () => {
    const invoke = vi.fn(async () => ({
      status: 409,
      statusText: "Conflict",
      headers: [["content-type", "application/json"]],
      bodyBase64: btoa(JSON.stringify({ message: "duplicate" })),
    }));

    const response = await createNativeSupabaseFetch(invoke)(
      "https://example.supabase.co/rest/v1/records",
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: "duplicate" });
  });

  it("returns bodyless success responses without inventing an empty body", async () => {
    const invoke = vi.fn(async () => ({
      status: 204,
      statusText: "No Content",
      headers: [],
      bodyBase64: "",
    }));

    const response = await createNativeSupabaseFetch(invoke)(
      "https://example.supabase.co/rest/v1/hierarchy_nodes?id=eq.project-1",
      { method: "PATCH", body: JSON.stringify({ folders: ["/work"] }) },
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
});
