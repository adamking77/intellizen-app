import { GradientAvatar } from "@outpacelabs/avatars";
import { Blobatar } from "blobatar/react";
import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

import { flavorById, loadTheme, THEME_CHANGED_EVENT } from "@/lib/theme";

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
  const accents = flavorById(loadTheme().flavor).accents;
  const colors = IDENTITY_ACCENTS.map((name) => accents.find((accent) => accent.name === name)?.hex).filter(
    (color): color is string => Boolean(color),
  );
  const first = pinned ?? colors[hash(seed) % colors.length] ?? loadTheme().accent;
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
 * same saved renderer, silhouette, color, and seed are used everywhere. An
 * uploaded profile picture is a reversible override, not another identity.
 */
export function Avatar({
  agent,
  size = 24,
  image,
  className,
  animate = "hover",
  speaking,
}: {
  agent: AvatarAgent;
  size?: number;
  image?: string | null;
  className?: string;
  /** Blob motion. Use always only for a single, prominent identity. */
  animate?: boolean | "hover" | "always";
  /** Measured voice level, 0..1. Undefined means silent. */
  speaking?: number;
}) {
  useThemeSnapshot();
  const seed = agent.displayName || "agent";

  if (image) {
    return speakingWrapper(
      <img
        src={image}
        alt=""
        aria-hidden
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size, borderRadius: 999, objectFit: "cover", flexShrink: 0, display: "block" }}
      />,
      speaking,
      size,
    );
  }

  const palette = identityPalette(seed, agent.avatarColor);
  const style: AvatarStyle = agent.avatarStyle === "blob" || agent.avatarStyle === "trace" ? agent.avatarStyle : "sphere";
  if (style === "blob") {
    const kind = BLOB_KINDS.includes(agent.avatarKind as BlobKind) ? (agent.avatarKind as BlobKind) : undefined;
    return speakingWrapper(
      <Blobatar
        name={seed}
        size={size}
        className={className}
        palette={agent.avatarColor ? { head: agent.avatarColor } : undefined}
        traits={kind ? { shape: KIND_TRAIT[kind] } : undefined}
        {...(animate ? { animate: animate === true ? "hover" as const : animate } : {})}
      />,
      speaking,
      size,
    );
  }

  if (style === "trace") {
    const traceSeed = Number.isInteger(agent.avatarSeed) ? agent.avatarSeed! : hash(seed);
    return speakingWrapper(
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
      speaking,
      size,
    );
  }

  return speakingWrapper(
    <GradientAvatar seed={seed} size={size} colors={palette} className={className} />,
    speaking,
    size,
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
          <Avatar agent={agent} size={size} image={images?.[agent.id]} animate={false} />
        </span>
      ))}
    </div>
  );
}
