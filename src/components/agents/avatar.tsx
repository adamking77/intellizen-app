// An agent's face: the profile's own picture when it has one, otherwise a
// gradient sphere drawn from the name. Deterministic, so the same agent looks
// the same everywhere without anyone choosing a picture.
//
// ponytail: sphere only. The donor's second renderer (blobatar) and its mesh
// sphere (@outpacelabs/avatars) are two dependencies for one field; add them
// if Adam wants the blob silhouettes back.

import { flavorById, loadTheme } from "@/lib/theme";

import type { Agent } from "./agent-model";

/** Identity hues, by accent name, none within reach of --wait, --ok, --bad
 *  or --runtime (peach, green, red/maroon, blue are left out). Identity is
 *  never state. Hexes come from the flavor, never from this file. */
const IDENTITY_ACCENTS = ["mauve", "teal", "lavender", "pink", "flamingo", "sky", "sapphire", "rosewater"] as const;

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** The colour that stands for one agent: pinned when it has one, otherwise
 *  chosen from the flavor's accents by name. Never the only signal. */
export function identityColor(seed: string, pinned?: string): string {
  if (pinned) return pinned;
  const accents = flavorById(loadTheme().flavor).accents;
  const name = IDENTITY_ACCENTS[hash(seed) % IDENTITY_ACCENTS.length];
  return accents.find((a) => a.name === name)?.hex ?? accents[0]?.hex ?? "var(--accent)";
}

/** A second hue for the sphere's shadow side, one step round the wheel. */
function companionColor(seed: string): string {
  const accents = flavorById(loadTheme().flavor).accents;
  const name = IDENTITY_ACCENTS[(hash(seed) + 3) % IDENTITY_ACCENTS.length];
  return accents.find((a) => a.name === name)?.hex ?? "var(--mantle)";
}

export function Avatar({
  agent,
  size = 24,
  image,
  className,
}: {
  agent: Pick<Agent, "displayName" | "avatarColor">;
  size?: number;
  /** A data URL from `profiles.get_asset`, when loaded. */
  image?: string | null;
  className?: string;
}) {
  const seed = agent.displayName || "agent";
  if (image) {
    return (
      <img
        src={image}
        alt=""
        aria-hidden
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size, borderRadius: 999, objectFit: "cover", flexShrink: 0, display: "block" }}
      />
    );
  }
  const a = identityColor(seed, agent.avatarColor);
  const b = companionColor(seed);
  // The highlight drifts with the name so two agents on one colour still differ.
  const hx = 30 + (hash(seed) % 30);
  const hy = 25 + (hash(seed + "y") % 25);
  return (
    <span
      aria-hidden
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        flexShrink: 0,
        display: "block",
        background: `radial-gradient(circle at ${hx}% ${hy}%, color-mix(in srgb, ${a} 62%, var(--text)) 0%, ${a} 38%, ${b} 100%)`,
      }}
    />
  );
}

/** Overlapping avatars: the whole team in one line. Dimmed is idle. */
export function TeamStack({
  agents,
  size = 20,
  ring = "var(--mantle)",
  images,
}: {
  agents: Agent[];
  size?: number;
  /** The plane behind the stack, so each face cuts a clean edge. */
  ring?: string;
  images?: Record<string, string | null>;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
      {agents.map((a, i) => (
        <span
          key={a.id}
          title={a.displayName}
          style={{ marginLeft: i ? -7 : 0, borderRadius: 999, boxShadow: `0 0 0 2px ${ring}`, display: "flex", opacity: 0.35 }}
        >
          <Avatar agent={a} size={size} image={images?.[a.id]} />
        </span>
      ))}
    </div>
  );
}
