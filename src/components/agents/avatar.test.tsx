// @vitest-environment happy-dom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Avatar } from "./avatar";

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
});
