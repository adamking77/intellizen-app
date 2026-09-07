import { GradientAvatar } from "@outpacelabs/avatars";
import { Blobatar } from "blobatar/react";
import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

import { flavorById, loadTheme, THEME_CHANGED_EVENT } from "@/lib/theme";
import { useMotionEnabled } from "@/components/ui/motion";

import type { Agent, AvatarStyle } from "./agent-model";

/** Silhouettes exposed by Blobatar 2.x. Values pin the center of each shape band. */
export const BLOB_KINDS = [
  "round",
  "organic",
  "boxy",
  "capsule",
  "nub",
  "cloud",
  "droplet",
  "hexagon",
  "sun",
  "triangle",
] as const;

export type BlobKind = (typeof BLOB_KINDS)[number];

const KIND_TRAIT: Record<BlobKind, number> = {
  round: 0.11,
  organic: 0.35,
  boxy: 0.54,
  capsule: 0.65,
  nub: 0.745,
  cloud: 0.825,
  droplet: 0.8875,
  hexagon: 0.9325,
  sun: 0.965,
  triangle: 0.99,
};

/** Identity avoids semantic status hues: waiting, verified, failed, and runtime. */
const IDENTITY_ACCENTS = ["mauve", "teal", "lavender", "pink", "flamingo", "sky", "sapphire", "rosewater"] as const;
const RESERVED_IDENTITY_ACCENTS = new Set(["red", "peach", "green"]);

type AvatarAgent = Pick<Agent, "displayName" | "avatarKind" | "avatarColor" | "avatarSeed"> & { avatarStyle?: AvatarStyle };

const TRACE_FIGURES = ["sine", "loop", "arc", "knot", "dotted"] as const;

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function pathFrom(points: Array<[number, number]>) {
  return points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

function traceFigure(seed: number) {
  const random = mulberry32(seed);
  const figure = TRACE_FIGURES[Math.floor(random() * TRACE_FIGURES.length)];
  const count = 1 + Math.floor(random() * 3);
  return Array.from({ length: count }, (_, strand) => {
    const amplitude = 3 + random() * 6;
    const wavelength = 8 + random() * 8;
    const phase = random() * Math.PI * 2;
    const drift = (random() - 0.5) * 5;
    const strokeWidth = 0.9 + random() * 0.9;
    const opacity = strand === 0 ? 0.9 : 0.35 + random() * 0.35;
    const offset = (strand - (count - 1) / 2) * 1.8;
    const points = Array.from({ length: 37 }, (_, index): [number, number] => {
      const t = index / 36;
      if (figure === "loop") {
        const angle = phase + t * Math.PI * 2 * (1.15 + 8 / wavelength);
        return [20 + offset + (amplitude + 2) * Math.sin(angle), 20 + 15 * Math.cos(angle) + drift * (t - 0.5)];
      }
      if (figure === "arc") {
        const direction = Math.cos(phase) < 0 ? -1 : 1;
        return [3 + t * 34, 20 + offset + drift * (t - 0.5) + direction * amplitude * Math.sin(Math.PI * t)];
      }
      if (figure === "knot") {
        const angle = t * Math.PI * 2;
        return [20 + offset + (amplitude + 3) * Math.sin(angle * 2 + phase), 20 + 14 * Math.sin(angle * 3 + phase / 2) + drift * (t - 0.5)];
      }
      const y = 3 + t * 34;
      return [20 + offset + drift * (t - 0.5) * 2 + amplitude * Math.sin(phase + (y / wavelength) * 2), y];
    });
    return {
      d: pathFrom(points),
      opacity,
      strokeWidth,
      strokeDasharray: figure === "dotted" ? `${(0.8 + random() * 0.8).toFixed(1)} ${(1.4 + random() * 1.8).toFixed(1)}` : undefined,
    };
  });
}

function hash(seed: string): number {
  let value = 0;
  for (let index = 0; index < seed.length; index += 1) {
    value = (value * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return value;
}

function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGED_EVENT, onChange);
}

function themeSnapshot() {
  const theme = loadTheme();
  return `${theme.flavor}:${theme.accent}`;
}

function useThemeSnapshot() {
  return useSyncExternalStore(subscribeTheme, themeSnapshot, () => "mocha");
}

function identityPalette(seed: string, pinned?: string): string[] {
  const theme = loadTheme();
  const accents = flavorById(theme.flavor).accents;
  const sameColor = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
  const identityColors = IDENTITY_ACCENTS.map((name) => accents.find((accent) => accent.name === name)?.hex).filter(
    (color): color is string => typeof color === "string",
  );
  const colors = identityColors.filter((color) => !sameColor(color, theme.accent));
  const preferred = pinned ?? identityColors[hash(seed) % identityColors.length];
  const preferredAccent = accents.find((accent) => preferred && sameColor(accent.hex, preferred));
  const safePreferred = preferred
    && !sameColor(preferred, theme.accent)
    && (!preferredAccent || !RESERVED_IDENTITY_ACCENTS.has(preferredAccent.name));
  const start = preferredAccent ? accents.indexOf(preferredAccent) : -1;
  const fallback = accents
    .slice(start + 1).concat(accents.slice(0, start + 1))
    .find((accent) => !RESERVED_IDENTITY_ACCENTS.has(accent.name) && !sameColor(accent.hex, theme.accent))?.hex;
  const first = safePreferred ? preferred : fallback ?? colors[0] ?? "currentColor";
  return [first, ...colors.filter((color) => color !== first)];
}

/** Stable identity color shared by the avatar, message bubble, speaking state, and HUD. */
export function identityColor(seed: string, pinned?: string): string {
  return identityPalette(seed, pinned)[0];
}

function speakingWrapper(inner: ReactNode, level: number | undefined, size: number) {
  if (level === undefined) return inner;
  const normalized = Math.min(1, Math.max(0, level));
  const eased = Math.pow(normalized, 0.7);
  const style = {
    "--avatar-scale": (1 + eased * 0.07).toFixed(3),
    "--avatar-brightness": (1 + eased * 0.22).toFixed(3),
    "--avatar-saturation": (1 + eased * 0.18).toFixed(3),
    width: size,
    height: size,
  } as CSSProperties;
  return (
    <span aria-hidden className="avatar-speaking" style={style}>
      {inner}
    </span>
  );
}

/**
 * The canonical IntelliZen/Hermes agent face.
 *
 * Mesh spheres come from @outpacelabs/avatars; blobs come from Blobatar. The
 * same saved renderer, silhouette, color, seed, and motion are used everywhere.
 * Legacy stored pictures do not override the three generated styles.
 */
export function Avatar({
  agent,
  size = 24,
  className,
  animate = "hover",
  speaking,
}: {
  agent: AvatarAgent;
  size?: number;
  /** Accepted for legacy callers; stored pictures no longer override the style. */
  image?: string | null;
  className?: string;
  /** Shared style motion. Use always only for a single, prominent identity. */
  animate?: boolean | "hover" | "always";
  /** Measured voice level, 0..1. Undefined means silent. */
  speaking?: number;
}) {
  useThemeSnapshot();
  const movement = useMotionEnabled();
  const motionMode = movement && animate ? animate === true ? "hover" : animate : "none";
  const seed = agent.displayName || "agent";
  const palette = identityPalette(seed, agent.avatarColor);
  const style: AvatarStyle = agent.avatarStyle === "blob" || agent.avatarStyle === "trace" ? agent.avatarStyle : "sphere";
  const frame = (inner: ReactNode) => speakingWrapper(
    <span className="avatar-motion" data-avatar-kind={style} data-avatar-motion={motionMode} aria-hidden style={{ width: size, height: size }}>
      <span className="avatar-motion__visual">{inner}</span>
    </span>,
    movement ? speaking : undefined,
    size,
  );
  if (style === "blob") {
    const kind = BLOB_KINDS.includes(agent.avatarKind as BlobKind) ? (agent.avatarKind as BlobKind) : undefined;
    return frame(
      <Blobatar
        name={seed}
        size={size}
        className={className}
        palette={{ head: palette[0] }}
        traits={kind ? { shape: KIND_TRAIT[kind] } : undefined}
        {...(motionMode !== "none" ? { animate: motionMode } : {})}
      />,
    );
  }

  if (style === "trace") {
    const traceSeed = Number.isInteger(agent.avatarSeed) ? agent.avatarSeed! : hash(seed);
    return frame(
      <svg
        viewBox="0 0 40 40"
        width={size}
        height={size}
        className={className}
        data-avatar-style="trace"
        data-avatar-seed={traceSeed}
        aria-hidden
        style={{ width: size, height: size, flexShrink: 0, display: "block" }}
      >
        {traceFigure(traceSeed).map((strand, index) => (
          <path
            key={index}
            d={strand.d}
            fill="none"
            stroke={palette[0]}
            strokeWidth={strand.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={strand.opacity}
            strokeDasharray={strand.strokeDasharray}
          />
        ))}
      </svg>,
    );
  }

  return frame(
    <GradientAvatar seed={seed} size={size} colors={palette} className={className} />,
  );
}

/** Overlapping identities. Running members remain full strength; idle recedes. */
export function TeamStack({
  agents,
  size = 20,
  ring = "var(--mantle)",
  images,
  running = [],
}: {
  agents: Agent[];
  size?: number;
  ring?: string;
  images?: Record<string, string | null>;
  running?: string[];
}) {
  return (
    <div className="team-avatar-stack" style={{ "--avatar-ring": ring } as CSSProperties}>
      {agents.map((agent, index) => (
        <span
          key={agent.id}
          title={agent.displayName}
          className="team-avatar-stack__member"
          data-running={running.includes(agent.id) || undefined}
          style={{ marginInlineStart: index ? -7 : 0 }}
        >
          <Avatar agent={agent} size={size} image={images?.[agent.id]} />
        </span>
      ))}
    </div>
  );
}
