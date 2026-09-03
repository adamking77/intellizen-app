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

type AvatarAgent = Pick<Agent, "displayName" | "avatarKind" | "avatarColor"> & { avatarStyle?: AvatarStyle };

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
  animate = true,
  speaking,
}: {
  agent: AvatarAgent;
  size?: number;
  image?: string | null;
  className?: string;
  /** Blob motion is direct-hover only. Disable it for dense rows and stacks. */
  animate?: boolean;
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
  const style: AvatarStyle = agent.avatarStyle === "blob" ? "blob" : "sphere";
  if (style === "blob") {
    const kind = BLOB_KINDS.includes(agent.avatarKind as BlobKind) ? (agent.avatarKind as BlobKind) : undefined;
    return speakingWrapper(
      <Blobatar
        name={seed}
        size={size}
        className={className}
        palette={agent.avatarColor ? { head: agent.avatarColor } : undefined}
        traits={kind ? { shape: KIND_TRAIT[kind] } : undefined}
        {...(animate ? { animate: "hover" as const } : {})}
      />,
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
