import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";

import { AGENT_PANEL_WIDTH_KEY } from "@/lib/agent-panel-persistence";

export const AGENT_PANEL_MIN_WIDTH = 300;
export const AGENT_PANEL_MAX_WIDTH = 560;

export function useAgentPanelResize(
  setPanelWidth: Dispatch<SetStateAction<number>>,
) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    },
    [],
  );

  return useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      cleanupRef.current?.();

      const onMove = (move: PointerEvent) => {
        const next = Math.min(
          Math.max(
            window.innerWidth - move.clientX,
            AGENT_PANEL_MIN_WIDTH,
          ),
          AGENT_PANEL_MAX_WIDTH,
        );
        setPanelWidth(next);
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      const onUp = () => {
        cleanup();
        cleanupRef.current = null;
        setPanelWidth((current) => {
          try {
            window.localStorage.setItem(
              AGENT_PANEL_WIDTH_KEY,
              String(current),
            );
          } catch {
            /* mounted state remains authoritative */
          }
          return current;
        });
      };

      cleanupRef.current = cleanup;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [setPanelWidth],
  );
}
