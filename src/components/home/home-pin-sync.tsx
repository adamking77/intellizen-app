import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { listHomePinsFromWorkspace } from "@/lib/data";
import { homePinIdentitySignature } from "@/lib/home-pin-sync";
import { WORKSPACE_REMOTE_WRITE_EVENT } from "@/lib/workspace-events";
import { isTauriRuntime } from "@/components/layout/window-chrome";

const HOME_PIN_SYNC_INTERVAL_MS = 15_000;

/**
 * Keeps agent/MCP Home pin writes synchronized even when /home is not mounted.
 * External MCP processes cannot emit into this WebView's Tauri event bus, so
 * the persistent poll is the cross-process fallback.
 */
export function HomePinSync() {
  const queryClient = useQueryClient();
  const { data: pins = [] } = useQuery({
    queryKey: ["home-pins"],
    queryFn: listHomePinsFromWorkspace,
    staleTime: 0,
    refetchInterval: HOME_PIN_SYNC_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    networkMode: "always",
  });
  const pinSignature = homePinIdentitySignature(pins);

  // A remote pin can reference a newly created view. Refresh the catalog in
  // the same sync cycle so Home never has fresh pins paired with stale views.
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] });
  }, [pinSignature, queryClient]);

  useEffect(() => {
    const refreshHomeData = () => {
      void queryClient.invalidateQueries({ queryKey: ["home-pins"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] });
    };

    const onWindowFocus = () => refreshHomeData();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshHomeData();
    };
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    let disposed = false;
    let unlistenWorkspaceWrite: UnlistenFn | null = null;
    let unlistenTauriFocus: UnlistenFn | null = null;

    if (isTauriRuntime) {
      void listen(WORKSPACE_REMOTE_WRITE_EVENT, refreshHomeData).then((unlisten) => {
        if (disposed) unlisten();
        else unlistenWorkspaceWrite = unlisten;
      });
      void getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused) refreshHomeData();
      }).then((unlisten) => {
        if (disposed) unlisten();
        else unlistenTauriFocus = unlisten;
      });
    }

    return () => {
      disposed = true;
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unlistenWorkspaceWrite?.();
      unlistenTauriFocus?.();
    };
  }, [queryClient]);

  return null;
}
