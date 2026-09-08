// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TargetPicker } from "./target-picker";
import { initializeSessionMode, resetSessionModeForTests, setRestingAgents } from "@/lib/session-mode";

afterEach(() => document.body.replaceChildren());
beforeEach(async () => {
  localStorage.clear();
  resetSessionModeForTests();
  await initializeSessionMode(async () => "launch-1");
});

describe("TargetPicker", () => {
  it("lists agents and teams only", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(
      <TargetPicker
        profiles={[
          { name: "fable", displayName: "Fable", isDefault: true, model: "m1", provider: "p", gatewayRunning: true, description: "", avatarStyle: "trace", avatarSeed: 73, avatarKind: "star", avatarColor: "#123456" },
          { name: "keel", displayName: "Keel", isDefault: false, model: "m2", provider: "p", gatewayRunning: true, description: "", avatarStyle: "sphere", avatarKind: "orb", avatarColor: "#654321" },
        ]}
        target="fable"
        usable={() => true}
        onTarget={vi.fn()}
        teams={[{ id: "t1", name: "Build team", members: ["hermes:fable", "hermes:keel"], projects: [] }]}
        onTeam={vi.fn()}
        onClose={vi.fn()}
      />,
    ));

    const options = [...host.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options.map((option) => option.textContent)).toEqual([
      "Fablem1default›",
      "Keelm2",
      "Build team2",
    ]);
    expect(host.textContent).toContain("Teams");
    expect(host.textContent).not.toContain("Rooms");
    expect(host.querySelectorAll("[data-agent-avatar]")).toHaveLength(2);
    expect(host.querySelector('[data-avatar-style="trace"][data-avatar-seed="73"]')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it("keeps a quiet conversation addressable and offers an explicit restore", async () => {
    setRestingAgents(["hermes:fable"]);
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    const onTarget = vi.fn();
    const onClose = vi.fn();
    const profile = { name: "fable", displayName: "Fable", isDefault: true, model: "m1", provider: "p", gatewayRunning: true, description: "" };
    await act(async () => root.render(<TargetPicker profiles={[profile]} target="fable" usable={() => true} onTarget={onTarget} onClose={onClose} />));
    expect(host.textContent).toContain("quiet today");
    expect(host.textContent).toContain("Restore Fable");

    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-selected="true"]')!.click());
    expect(onTarget).toHaveBeenCalledWith("fable");

    await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Restore Fable")!.click());
    expect(host.textContent).not.toContain("Restore Fable");
    await act(async () => root.unmount());
  });
});
