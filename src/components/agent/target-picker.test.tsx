// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TargetPicker } from "./target-picker";

afterEach(() => document.body.replaceChildren());

describe("TargetPicker", () => {
  it("lists agents and teams only", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(
      <TargetPicker
        profiles={[
          { name: "fable", displayName: "Fable", isDefault: true, model: "m1", provider: "p", gatewayRunning: true, description: "", avatarStyle: "blob", avatarKind: "star", avatarColor: "#123456" },
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

    await act(async () => root.unmount());
  });
});
