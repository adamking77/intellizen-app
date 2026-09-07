// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HermesProfile } from "@/engine/profiles";
import type { SessionAttachment } from "@/engine/session";
import type { VoiceHandle } from "@/voice/use-voice";
import type { ApprovalDecision, Message } from "@/engine/transcript";
import { Hud, hudGroundCanDrag, type HudOpen } from "./hud";
import type { RunState } from "./run-state";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => document.body.replaceChildren());

const profile: HermesProfile = {
  name: "fiona",
  displayName: "Fiona",
  description: "",
  model: "claude-sonnet",
  provider: "anthropic",
  isDefault: true,
  gatewayRunning: true,
  avatarStyle: "blob",
};

function voice(talking: string | null = null): VoiceHandle {
  return {
    mine: false,
    hearing: false,
    talking,
    said: 0.4,
    saidLevels: [0.2, 0.4],
    levels: [],
    note: null,
    interim: "",
    setNote: vi.fn(),
    convo: false,
    setConvo: vi.fn(),
    canConverse: true,
    why: "",
    dictationOn: true,
    dictate: vi.fn(),
    abandon: vi.fn(),
    readAloud: vi.fn(),
    interrupt: vi.fn(),
  };
}

function render(open: HudOpen, talking: string | null = null, run: RunState = { kind: "idle" }, voiceOverrides: Partial<VoiceHandle> = {}, decision?: ApprovalDecision, composer: { attachments?: SessionAttachment[]; onAttach?: () => void; permission?: string | null } = {}, messages: Message[] = []) {
  return renderToStaticMarkup(
    <Hud
      agent={profile}
      profiles={[profile]}
      target={profile.name}
      messages={messages}
      run={run}
      decision={decision}
      onApprove={vi.fn()}
      onClarify={vi.fn()}
      attachments={composer.attachments}
      onAttach={composer.onAttach}
      permission={composer.permission ?? null}
      voice={{ ...voice(talking), ...voiceOverrides }}
      open={open}
      onOpen={vi.fn()}
      onTarget={vi.fn()}
      onSend={vi.fn()}
      draft=""
      onDraft={vi.fn()}
      onStop={vi.fn()}
      onGrow={vi.fn()}
      onRedock={vi.fn()}
      sending={false}
      ready
    />,
  );
}

describe("HUD controls", () => {
  it("keeps voice actions in one place when the conversation is expanded", () => {
    const element = document.createElement("div");
    element.innerHTML = render("chat");
    expect(element.querySelectorAll('[aria-label="Speak instead of typing"]')).toHaveLength(1);
    expect(element.querySelectorAll('[aria-label="Start voice chat"]')).toHaveLength(1);
  });

  it("keeps unavailable voice controls visible with their setup reasons", () => {
    const element = document.createElement("div");
    element.innerHTML = render("none", null, { kind: "idle" }, { dictationOn: false, canConverse: false, why: "Turn on speaking in Settings" });
    for (const label of ["Dictation is switched off in Settings", "Turn on speaking in Settings"]) {
      const control = element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(control).toBeTruthy();
      expect(control?.disabled).toBe(true);
      expect(control?.title).toBe(label);
    }
  });

  it("keeps the essential controls in both resting and speaking states", () => {
    for (const markup of [render("none"), render("none", "message-1")]) {
      expect(markup).toContain("Open the conversation");
      expect(markup).toContain("Back to the full panel");
      expect(markup).toContain("Put the panel back in the main window");
    }
    expect(render("none", "message-1")).toContain("Stop speaking");
    expect(render("none", null, { kind: "working", label: null })).toContain("Stop this turn");
  });

  it("opens a selectable roster without an accent border state", () => {
    const markup = render("roster");
    expect(markup).toContain('role="listbox"');
    expect(markup).toContain('aria-selected="true"');
    const selectedRow = markup.match(/<button[^>]*role="option"[^>]*>/)?.[0];
    expect(selectedRow).toBeDefined();
    expect(selectedRow).not.toContain("accent-border");
  });

  it("keeps a profile approval actionable in the HUD conversation", () => {
    const markup = render("chat", null, { kind: "waiting" }, {}, {
      kind: "approval",
      requestId: "permission-1",
      command: "Write the report",
      description: "The draft is ready to save.",
      choices: ["once", "deny"],
      messageId: "message-1",
      at: 1,
    });
    expect(markup).toContain("A question for you");
    expect(markup).toContain("Allow once");
    expect(markup).toContain("Deny");
    const host = document.createElement("div");
    host.innerHTML = markup;
    expect(host.querySelector("[data-hud-log] [data-decision=approval]")).toBeTruthy();
  });

  it("keeps the shared attachment and permission controls in the HUD composer", () => {
    const markup = render("chat", null, { kind: "idle" }, {}, undefined, {
      attachments: [{ path: "/tmp/brief.pdf", name: "brief.pdf" }],
      onAttach: vi.fn(),
      permission: "Ask first",
    });
    expect(markup).toContain("brief.pdf");
    expect(markup).toContain("Remove brief.pdf");
    expect(markup).toContain("Attach files");
    expect(markup).toContain("Ask first");
  });

  it("does not paint an empty assistant bubble for a tool-only turn", () => {
    const markup = render("chat", null, { kind: "idle" }, {}, undefined, {}, [
      { id: "tool-turn", from: profile.name, text: "", tools: [{ id: "tool-1", name: "read", title: "Read document" }] },
      { id: "answer", from: profile.name, text: "Here is the answer." },
    ]);
    const element = document.createElement("div");
    element.innerHTML = markup;
    expect(element.querySelectorAll('div[style*="color-mix"]')).toHaveLength(1);
    expect(element.textContent).toContain("Here is the answer.");
  });

  it("disables a dispatched answer and restores a retry after the main window rejects it", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    let reject!: (error: Error) => void;
    const onApprove = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    const decision: ApprovalDecision = {
      kind: "approval", requestId: "permission-1", command: "Write the report", description: "The draft is ready to save.",
      choices: ["once", "deny"], messageId: "message-1", at: 1,
    };
    await act(async () => root.render(
      <Hud agent={profile} profiles={[profile]} target={profile.name} messages={[]} run={{ kind: "waiting" }} decision={decision}
        onApprove={onApprove} onClarify={vi.fn()} voice={voice()} open="chat" onOpen={vi.fn()} onTarget={vi.fn()}
        onSend={vi.fn()} draft="" onDraft={vi.fn()} onStop={vi.fn()} onGrow={vi.fn()} onRedock={vi.fn()} sending={false} ready permission={null} />,
    ));
    const allow = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Allow once"))!;
    await act(async () => allow.click());
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(allow.disabled).toBe(true);

    await act(async () => {
      reject(new Error("The main window could not answer this request."));
      await Promise.resolve();
    });
    expect(host.querySelector("[role=alert]")?.textContent).toContain("could not answer");
    expect(allow.disabled).toBe(false);
    await act(async () => allow.click());
    expect(onApprove).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  it("ignores a delayed approval rejection after the target changes with the same request id", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    let reject!: (error: Error) => void;
    const onApprove = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    const decision: ApprovalDecision = {
      kind: "approval", requestId: "permission-1", command: "Write the report", description: "The draft is ready to save.",
      choices: ["once", "deny"], messageId: "message-1", at: 1,
    };
    const second = { ...profile, name: "keel", displayName: "Keel" };
    const hud = (agent: HermesProfile) => <Hud agent={agent} profiles={[agent]} target={agent.name} messages={[]} run={{ kind: "waiting" }} decision={decision}
      onApprove={onApprove} onClarify={vi.fn()} voice={voice()} open="chat" onOpen={vi.fn()} onTarget={vi.fn()}
      onSend={vi.fn()} draft="" onDraft={vi.fn()} onStop={vi.fn()} onGrow={vi.fn()} onRedock={vi.fn()} sending={false} ready permission={null} />;
    await act(async () => root.render(hud(profile)));
    const oldAllow = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Allow once"))!;
    await act(async () => oldAllow.click());
    expect(oldAllow.disabled).toBe(true);
    await act(async () => root.render(hud(second)));
    const newAllow = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Allow once"))!;
    expect(newAllow.disabled).toBe(false);
    await act(async () => {
      reject(new Error("The old profile rejected this."));
      await Promise.resolve();
    });
    expect(host.querySelector("[role=alert]")).toBeNull();
    expect(newAllow.disabled).toBe(false);
    await act(async () => root.unmount());
  });

  it("drags empty transcript ground but keeps messages, controls and the scrollbar interactive", () => {
    const log = document.createElement("div");
    log.dataset.hudLog = "";
    Object.defineProperty(log, "getBoundingClientRect", { value: () => ({ right: 100 }) });
    const message = document.createElement("span");
    const button = document.createElement("button");
    log.append(message, button);

    expect(hudGroundCanDrag(log, 50)).toBe(true);
    expect(hudGroundCanDrag(log, 95)).toBe(false);
    expect(hudGroundCanDrag(message, 50)).toBe(false);
    expect(hudGroundCanDrag(button, 50)).toBe(false);
    for (const tag of ["summary", "select", "a"]) {
      expect(hudGroundCanDrag(document.createElement(tag), 50)).toBe(false);
    }
  });
});
