// @vitest-environment happy-dom

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { flavorById, saveTheme } from "@/lib/theme";
import { Avatar, identityColor } from "./avatar";

beforeEach(() => localStorage.clear());

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

  it("keeps an uploaded picture ahead of the procedural renderer", () => {
    const markup = trace(73, "data:image/png;base64,AA==");
    expect(markup).toContain("<img");
    expect(markup).not.toContain('data-avatar-style="trace"');
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
