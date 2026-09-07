import { createContext, forwardRef, useContext, useSyncExternalStore, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

import { useSessionMode } from "@/lib/session-mode";
import { cn } from "@/lib/utils";
import "./motion.css";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
const MotionGate = createContext({ movement: true, transitions: true });
type InputModality = "pointer" | "keyboard";
let inputModality: InputModality = "pointer";
const modalityListeners = new Set<() => void>();

function setInputModality(next: InputModality) {
  if (inputModality === next) return;
  inputModality = next;
  for (const listener of modalityListeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => setInputModality("pointer"), true);
  window.addEventListener("keydown", () => setInputModality("keyboard"), true);
}

export function useMotionEnabled() {
  const reduced = useReducedMotion();
  const { mode } = useSessionMode();
  return !reduced && mode !== "not_today";
}

export function useInputModality() {
  return useSyncExternalStore(
    (listener) => { modalityListeners.add(listener); return () => modalityListeners.delete(listener); },
    readInputModality,
    () => "pointer",
  );
}

export function readInputModality() {
  return inputModality;
}

export function motionIsEnabled() {
  return document.documentElement.dataset.session !== "not-today"
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function MotionList({ children, className, ...props }: Omit<HTMLMotionProps<"div">, "children"> & { children?: ReactNode }) {
  const enabled = useMotionEnabled();
  const modality = useInputModality();
  return (
    <MotionGate.Provider value={{ movement: enabled && modality === "pointer", transitions: modality === "pointer" }}>
      <LayoutGroup>
        <motion.div className={cn("relative", className)} {...props}>
          <AnimatePresence initial={false} mode="popLayout">{children}</AnimatePresence>
        </motion.div>
      </LayoutGroup>
    </MotionGate.Provider>
  );
}

export const MotionListItem = forwardRef<HTMLDivElement, HTMLMotionProps<"div">>(function MotionListItem(props, ref) {
  const { movement, transitions } = useContext(MotionGate);
  return (
    <motion.div
      ref={ref}
      layout={movement ? "position" : false}
      transition={{ layout: { duration: movement ? 0.2 : 0, ease: EASE_IN_OUT }, opacity: { duration: transitions ? 0.2 : 0, ease: EASE_OUT } }}
      exit={transitions ? { opacity: 0 } : undefined}
      {...props}
    />
  );
});

export function ContentArrival(props: ComponentPropsWithoutRef<typeof motion.div>) {
  const enabled = useMotionEnabled();
  const modality = useInputModality();
  const transitions = modality === "pointer";
  return (
    <motion.div
      initial={transitions ? { opacity: 0, transform: enabled ? "translateY(4px)" : "none" } : false}
      animate={{ opacity: 1, transform: "none" }}
      transition={{ duration: transitions ? 0.2 : 0, ease: EASE_OUT }}
      {...props}
    />
  );
}

export function DoneWord({ done, doneLabel, children }: { done: boolean; doneLabel: ReactNode; children: ReactNode }) {
  const transitions = useInputModality() === "pointer";
  return (
    <span className="relative inline-grid" aria-live="polite">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          className="col-start-1 row-start-1"
          key={done ? "done" : "ready"}
          initial={transitions ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={transitions ? { opacity: 0 } : undefined}
          transition={{ duration: transitions ? 0.14 : 0, ease: EASE_OUT }}
        >
          {done ? doneLabel : children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
