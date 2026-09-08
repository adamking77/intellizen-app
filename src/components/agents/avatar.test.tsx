// @vitest-environment happy-dom

import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";

import { flavorById, saveTheme } from "@/lib/theme";
import { Avatar, identityColor } from "./avatar";
import { initializeSessionMode, resetSessionModeForTests, setSessionMode } from "@/lib/session-mode";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { localStorage.clear(); resetSessionModeForTests(); window.dispatchEvent(new Event("pointerdown")); });

function trace(seed?: number, image?: string) {
  return renderToStaticMarkup(
    <Avatar
      agent={{ displayName: "Fiona", avatarStyle: "trace", avatarSeed: seed }}
      size={44}
      image={image}
      animate={false}
    />,
  );
}

describe("trace avatar", () => {
  it("renders the same stroke figure for the same seed and changes for another", () => {
    expect(trace(73)).toBe(trace(73));
    expect(trace(73)).not.toBe(trace(74));
    expect(trace()).toBe(trace());
    expect(trace(73)).toContain('data-avatar-style="trace"');
    expect(trace(73)).toContain('fill="none"');
  });

  it("keeps the selected generated style even when a legacy picture is supplied", () => {
    const markup = trace(73, "data:image/png;base64,AA==");
    expect(markup).not.toContain("data:image/png;base64,AA==");
    expect(markup).toContain('data-avatar-style="trace"');
  });

  it("keeps safe saved colors and remaps selected or reserved role colors", () => {
    const accents = flavorById("mocha").accents;
    const color = (name: string) => accents.find((accent) => accent.name === name)!.hex;
    saveTheme("mocha", color("teal"));

    expect(identityColor("Fiona", color("mauve"))).toBe(color("mauve"));
    expect(identityColor("Fiona", "#123456")).toBe("#123456");
    expect(identityColor("Fiona", color("teal"))).toBe(color("sky"));
    expect(identityColor("Fiona", color("red"))).toBe(color("maroon"));
    expect(identityColor("Fiona", color("peach"))).toBe(color("yellow"));
    expect(identityColor("Fiona", color("green"))).toBe(color("sky"));
  });
});

it("gives all three styles motion and stops both preview and speech motion in Not today", async () => {
  await initializeSessionMode(async () => "avatar-motion");
  setSessionMode("thinking");
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    await act(async () => root.render(<>{(["sphere", "blob", "trace"] as const).map((avatarStyle) => <Avatar key={avatarStyle} agent={{ displayName: "Fiona", avatarStyle }} animate="always" speaking={0.5} />)}</>));
    expect(host.querySelectorAll('[data-avatar-motion="always"]')).toHaveLength(3);
    expect(host.querySelectorAll(".avatar-speaking")).toHaveLength(3);
    expect(host.querySelector(".mo-always")).not.toBeNull();
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" })));
    expect(host.querySelectorAll('[data-avatar-motion="always"]')).toHaveLength(3);
    await act(async () => setSessionMode("not_today"));
    expect(host.querySelectorAll('[data-avatar-motion="none"]')).toHaveLength(3);
    expect(host.querySelector(".avatar-speaking")).toBeNull();
    expect(host.querySelector(".mo-always")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    resetSessionModeForTests();
  }
});
