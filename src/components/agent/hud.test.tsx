// @vitest-environment happy-dom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { HermesProfile } from "@/engine/profiles";
import type { VoiceHandle } from "@/voice/use-voice";
import { Hud, hudGroundCanDrag, type HudOpen } from "./hud";
import type { RunState } from "./run-state";

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

function render(open: HudOpen, talking: string | null = null, run: RunState = { kind: "idle" }, voiceOverrides: Partial<VoiceHandle> = {}) {
  return renderToStaticMarkup(
    <Hud
      agent={profile}
      profiles={[profile]}
      target={profile.name}
      messages={[]}
      run={run}
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
  });
});
