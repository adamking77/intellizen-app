// The smallest store the vendored room engine needs: nanostores' `atom`
// surface (`get`, `set`, `listen`) so `group-chat.ts`, `group-rounds.ts` and
// `group-activity.ts` read as they do in Hermes Desktop, plus one React hook.

import { useSyncExternalStore } from "react";

export interface Atom<T> {
  get(): T;
  set(value: T): void;
  listen(listener: (value: T) => void): () => void;
}

export function atom<T>(initial: T): Atom<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of [...listeners]) listener(value);
    },
    listen: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Subscribe a component to an atom. */
export function useValue<T>(store: Atom<T>): T {
  return useSyncExternalStore(store.listen, store.get, store.get);
}
