import { useEngineStore } from "./engine-store";

/** Hermes REST beside the gateway: `/api/cron`, `/api/plugins/kanban`, `/api/plugins/<id>`.
 *  Throws when the engine is not up; callers decide how to show that. */
export async function hermesRest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const info = useEngineStore.getState().info;
  if (!info) throw new Error("Hermes offline");
  const res = await fetch(`http://127.0.0.1:${info.port}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-hermes-session-token": info.token,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status}`);
  return (await res.json()) as T;
}
