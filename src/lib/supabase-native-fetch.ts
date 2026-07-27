import { invoke } from "@tauri-apps/api/core";

interface SupabaseProxyResponse {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  bodyBase64: string;
}

type InvokeFunction = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function createNativeSupabaseFetch(
  invokeCommand: InvokeFunction = invoke as InvokeFunction,
): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    if (request.signal.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    const method = request.method.toUpperCase();
    const bodyBase64 =
      method === "GET" || method === "HEAD"
        ? undefined
        : bytesToBase64(new Uint8Array(await request.arrayBuffer()));
    const response = (await invokeCommand("supabase_proxy_request", {
      input: {
        url: request.url,
        method,
        headers: Array.from(request.headers.entries()),
        bodyBase64,
      },
    })) as SupabaseProxyResponse;

    return new Response(base64ToBytes(response.bodyBase64), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}
