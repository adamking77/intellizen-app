export type ViewTransitionKind = "room" | "drawer" | "segment";
let activeTransition = 0;

interface BrowserViewTransition {
  finished: Promise<void>;
}

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => BrowserViewTransition;
};

function allowed() {
  return typeof document !== "undefined"
    && typeof (document as TransitionDocument).startViewTransition === "function"
    && !(typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

export function runViewTransition(kind: ViewTransitionKind, update: () => void, source?: HTMLElement | null) {
  const name = kind === "drawer" ? "kit-drawer" : null;
  if (!allowed()) {
    update();
    return;
  }

  const root = document.documentElement;
  const token = ++activeTransition;
  if (name && source) source.style.viewTransitionName = name;
  root.dataset.viewTransition = kind;

  let updated = false;
  try {
    const transition = (document as TransitionDocument).startViewTransition!(async () => {
      if (source) source.style.viewTransitionName = "";
      updated = true;
      update();
      await Promise.resolve();
    });
    const clear = () => {
      if (activeTransition === token) delete root.dataset.viewTransition;
    };
    void transition.finished.then(clear, clear);
  } catch {
    if (source) source.style.viewTransitionName = "";
    if (activeTransition === token) delete root.dataset.viewTransition;
    if (!updated) update();
  }
}
