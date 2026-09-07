// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { CommandPaletteProvider, askSources } from "./command-palette";
import { emptyThread, useSessionStore } from "@/engine/session-store";
import { CONVERSATION_CONTEXT_STORAGE_KEY, createRouteConversationContext } from "@/lib/conversation-context";
import { readPanelDraft, writePanelDraft } from "@/components/agent/panel-draft";
import { runRoomAction } from "@/components/agent/panel-room";
import { $groupChats } from "@/rooms/group-chat";
import { FakeGatewayClient } from "@/engine/test-support";
import { setGatewayClient } from "@/engine/gateway";

vi.mock("@/lib/data", () => ({
  investigationIdForSignal: vi.fn(async () => null),
  searchWorkspace: vi.fn(async () => []),
}));
vi.mock("@/lib/use-hierarchy", () => ({ useHierarchy: () => ({ tree: { organizations: [] } }) }));
vi.mock("@/plugins/commands", () => ({ usePluginPaletteCommands: () => [] }));
vi.mock("@/components/agent/panel-room", () => ({ runRoomAction: vi.fn(async () => ({ messageId: "team-question", thread: "ask-thread" })) }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
const originalSend = useSessionStore.getState().send;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  window.localStorage.clear();
  $groupChats.set({});
  setGatewayClient(null);
  useSessionStore.setState({ selectedProfile: null, selectedRoomId: null, profileDirectory: {}, threads: {}, send: originalSend });
  vi.clearAllMocks();
});

function openPalette() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
}

function enter(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("keeps an Ask answer bound to its original panel target across close and reopen", async () => {
  const fiona = { name: "fiona", displayName: "Fiona", description: "", model: "model", provider: "Hermes", isDefault: true, gatewayRunning: true, avatarStyle: "sphere" as const };
  const marcus = { ...fiona, name: "marcus", displayName: "Marcus", isDefault: false };
  const send = vi.fn(async (profile: string, text: string, _attachments: unknown[], _context: unknown, options?: { onQueued?: (messageId: string, sessionId: string) => void }) => {
    useSessionStore.setState((state) => {
      const thread = state.threads[profile] ?? emptyThread(profile);
      return {
        threads: {
          ...state.threads,
          [profile]: {
            ...thread,
            sessionId: "session-fiona",
            transcript: {
              ...thread.transcript,
              seq: thread.transcript.seq + 1,
              messages: [...thread.transcript.messages, { id: "ask-user", from: "you", text, at: 1 }],
            },
          },
        },
      };
    });
    options?.onQueued?.("ask-user", "session-fiona");
  });
  useSessionStore.setState({
    selectedProfile: "fiona",
    selectedRoomId: null,
    profileDirectory: { fiona, marcus },
    threads: { fiona: emptyThread("fiona"), marcus: emptyThread("marcus") },
    send: send as never,
  });
  window.localStorage.setItem(CONVERSATION_CONTEXT_STORAGE_KEY, JSON.stringify(createRouteConversationContext({ pathname: "/docs", search: "?document=one" }, "2026-09-07T00:00:00.000Z")));

  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CommandPaletteProvider><span>App</span></CommandPaletteProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  ));

  await act(async () => openPalette());
  const input = host.querySelector<HTMLInputElement>('[role="combobox"]')!;
  await act(async () => enter(input, "Who owns Northwind?"));
  const ask = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Who owns Northwind"))!;
  await act(async () => ask.click());
  expect(send).toHaveBeenCalledWith("fiona", "Who owns Northwind?", [], expect.objectContaining({ route: expect.objectContaining({ pathname: "/docs" }) }), expect.objectContaining({ preservePanelDraft: true, onQueued: expect.any(Function) }));

  await act(async () => openPalette());
  await act(async () => {
    useSessionStore.setState((state) => ({
      selectedProfile: "marcus",
      threads: {
        ...state.threads,
        fiona: {
          ...state.threads.fiona,
          transcript: {
            ...state.threads.fiona.transcript,
            seq: 2,
            messages: [...state.threads.fiona.transcript.messages, { id: "ask-answer", from: "fiona", text: "Aldgate owns it. [Registry](https://registry.example/northwind)", streaming: false, at: 2 }],
          },
        },
        marcus: {
          ...state.threads.marcus,
          transcript: {
            ...state.threads.marcus.transcript,
            seq: 1,
            messages: [{ id: "wrong-answer", from: "marcus", text: "A different answer", streaming: false, at: 2 }],
          },
        },
      },
    }));
    openPalette();
  });

  const answer = host.querySelector('[aria-label="Answer from Fiona"]')!;
  expect(answer.textContent).toContain("Aldgate owns it");
  expect(answer.textContent).not.toContain("A different answer");
  const source = answer.querySelector<HTMLAnchorElement>('a[href="https://registry.example/northwind"]')!;
  expect(source.textContent).toBe("Registry");
  const sourceEnter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  source.dispatchEvent(sourceEnter);
  expect(sourceEnter.defaultPrevented).toBe(false);
  expect(send).toHaveBeenCalledTimes(1);
});

it("settles without a reply and never adopts an answer after the next turn or a session replacement", async () => {
  const fiona = { name: "fiona", displayName: "Fiona", description: "", model: "model", provider: "Hermes", isDefault: true, gatewayRunning: true, avatarStyle: "sphere" as const };
  const send = vi.fn(async (_profile: string, text: string, _attachments: unknown[], _context: unknown, options?: { onQueued?: (messageId: string, sessionId: string) => void }) => {
    useSessionStore.setState((state) => ({
      threads: {
        ...state.threads,
        fiona: {
          ...state.threads.fiona,
          sessionId: "session-a",
          transcript: {
            ...state.threads.fiona.transcript,
            seq: 1,
            turnStartedAt: 1,
            messages: [{ id: "ask-user", from: "you", text, at: 1 }],
          },
        },
      },
    }));
    options?.onQueued?.("ask-user", "session-a");
  });
  useSessionStore.setState({
    selectedProfile: "fiona",
    selectedRoomId: null,
    profileDirectory: { fiona },
    threads: { fiona: { ...emptyThread("fiona"), sessionId: "session-a" } },
    send: send as never,
  });

  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(
    <MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CommandPaletteProvider><span>App</span></CommandPaletteProvider>
    </QueryClientProvider></MemoryRouter>,
  ));
  await act(async () => openPalette());
  await act(async () => enter(host.querySelector<HTMLInputElement>('[role="combobox"]')!, "Question without an answer"));
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Question without an answer"))!.click());

  await act(async () => useSessionStore.setState((state) => ({
    threads: { ...state.threads, fiona: { ...state.threads.fiona, transcript: { ...state.threads.fiona.transcript, turnStartedAt: null } } },
  })));
  expect(host.querySelector('[aria-label="Answer from Fiona"]')?.textContent).toContain("No answer was returned");
  expect([...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Question without an answer"))?.disabled).toBe(false);

  await act(async () => useSessionStore.setState((state) => ({
    threads: { ...state.threads, fiona: { ...state.threads.fiona, sessionId: "session-b", transcript: {
      ...state.threads.fiona.transcript,
      messages: [
        { id: "ask-user", from: "you", text: "Question without an answer", at: 2 },
        { id: "replacement-answer", from: "fiona", text: "Answer from another session", at: 3 },
      ],
    } } },
  })));
  expect(host.querySelector('[aria-label="Answer from Fiona"]')?.textContent).not.toContain("Answer from another session");

  await act(async () => useSessionStore.setState((state) => ({
    threads: { ...state.threads, fiona: { ...state.threads.fiona, sessionId: "session-a", transcript: {
      ...state.threads.fiona.transcript,
      messages: [
        { id: "ask-user", from: "you", text: "Question without an answer", at: 1 },
        { id: "later-user", from: "you", text: "A different question", at: 4 },
        { id: "late-answer", from: "fiona", text: "Too late for Ask", at: 5 },
      ],
    } } },
  })));
  expect(host.querySelector('[aria-label="Answer from Fiona"]')?.textContent).not.toContain("Too late for Ask");
});

it("routes Ask to the selected team and follows only that question's room thread", async () => {
  const profileSend = vi.fn();
  $groupChats.set({ team: { name: "Research team", owner: "local", log: [], watermarks: {}, members: [{ name: "fiona", door: "gateway" }] } });
  useSessionStore.setState({ selectedRoomId: "team", selectedProfile: "marcus", send: profileSend as never });
  window.localStorage.setItem(CONVERSATION_CONTEXT_STORAGE_KEY, JSON.stringify(createRouteConversationContext({ pathname: "/project/vendor-review" }, "2026-09-07T00:00:00.000Z")));
  vi.mocked(runRoomAction).mockImplementation(async (action) => {
    if (action.type !== "room-send") return;
    $groupChats.set({
      ...$groupChats.get(),
      team: {
        ...$groupChats.get().team,
        running: true,
        log: [{ id: "team-question", at: 1, from: { kind: "user", name: "You" }, text: action.text, thread: "ask-thread" }],
      },
    });
    return { messageId: "team-question", thread: "ask-thread" };
  });

  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(
    <MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CommandPaletteProvider><span>App</span></CommandPaletteProvider>
    </QueryClientProvider></MemoryRouter>,
  ));
  await act(async () => openPalette());
  await act(async () => enter(host.querySelector<HTMLInputElement>('[role="combobox"]')!, "Compare the evidence"));
  const ask = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Compare the evidence"))!;
  await act(async () => ask.click());
  expect(runRoomAction).toHaveBeenCalledWith(expect.objectContaining({
    type: "room-send",
    roomId: "team",
    text: "Compare the evidence",
    preservePanelDraft: true,
    context: expect.objectContaining({ route: expect.objectContaining({ pathname: "/project/vendor-review" }) }),
  }));
  expect(profileSend).not.toHaveBeenCalled();

  await act(async () => openPalette());
  await act(async () => {
    const room = $groupChats.get().team;
    $groupChats.set({ team: { ...room, running: false, log: [
      ...room.log,
      { id: "unrelated", at: 2, from: { kind: "member", name: "Marcus" }, text: "Wrong thread", thread: "another-thread" },
      { id: "team-answer", at: 3, from: { kind: "member", name: "Fiona" }, text: "The records agree.", thread: "ask-thread" },
    ] } });
    useSessionStore.setState({ selectedRoomId: null, selectedProfile: "marcus" });
    openPalette();
  });

  const answer = host.querySelector('[aria-label="Answer from Research team"]')!;
  expect(answer.textContent).toContain("The records agree");
  expect(answer.textContent).not.toContain("Wrong thread");

  await act(async () => {
    const room = $groupChats.get().team;
    $groupChats.set({ team: { ...room, running: true, log: [
      ...room.log,
      { id: "later-question", at: 4, from: { kind: "user", name: "You" }, text: "A later room turn", thread: "later-thread" },
      { id: "late-answer", at: 5, from: { kind: "member", name: "Fiona" }, text: "Must not join the old answer", thread: "ask-thread" },
    ] } });
  });
  expect(answer.textContent).not.toContain("Must not join the old answer");
});

it("preserves an unrelated matching panel draft for Ask while ordinary panel sends still clear it", async () => {
  const client = new FakeGatewayClient();
  setGatewayClient(client as never);
  const ready = { ...emptyThread("fiona"), sessionId: "session-1", storedSessionId: "stored-1", restored: true };
  useSessionStore.setState({ threads: { fiona: ready }, send: originalSend });

  writePanelDraft("fiona", { text: "Same words", attachments: [] });
  await originalSend("fiona", "Same words", [], null, { preservePanelDraft: true });
  expect(readPanelDraft("fiona").text).toBe("Same words");

  useSessionStore.setState({ threads: { fiona: { ...ready, transcript: emptyThread("fiona").transcript } } });
  writePanelDraft("fiona", { text: "Same words", attachments: [] });
  await originalSend("fiona", "Same words", [], null);
  expect(readPanelDraft("fiona").text).toBe("");
});

it("reports only explicit answer links as sources", () => {
  expect(askSources("From [one](https://one.example/a), also https://two.example/b and no other proof.")).toEqual([
    { label: "one", href: "https://one.example/a" },
    { label: "two.example", href: "https://two.example/b" },
  ]);
  expect(askSources("No citations here.")).toEqual([]);
});
