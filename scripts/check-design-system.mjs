import { readdirSync, readFileSync } from "node:fs";
import { accentForeground, contrast, mix, rgb } from "../shared/theme-contrast.mjs";

const sourceRoot = new URL("../src/", import.meta.url);
const files = [];
const codeFiles = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) walk(path);
    else if (/\.(?:css|ts|tsx)$/.test(entry.name)) {
      files.push(path);
      if (/\.(?:ts|tsx)$/.test(entry.name)) codeFiles.push(path);
    }
  }
}

walk(sourceRoot);

// Database controls remain a scoped exception to the v3 kit, but SPEC-2050
// governs their selection treatment: tinted planes share Accent Strength and
// the former accent rail is retired.
function isPreservedDatabaseSurface(path) {
  const relative = path.pathname.replace(sourceRoot.pathname, "src/");
  return relative.startsWith("src/components/database/")
    || relative === "src/views/Databases.tsx"
    || relative === "src/views/DatabaseEditor.tsx";
}

const kitFiles = files.filter((path) => !isPreservedDatabaseSurface(path));
const kitCodeFiles = codeFiles.filter((path) => !isPreservedDatabaseSurface(path));

function occurrences(pattern, paths = files) {
  let count = 0;
  for (const path of paths) count += readFileSync(path, "utf8").match(pattern)?.length ?? 0;
  return count;
}

function lines(pattern, paths = files) {
  return paths.flatMap((path) =>
    readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => pattern.test(line))
      .map((line) => `${path.pathname.replace(sourceRoot.pathname, "src/")}: ${line.trim()}`),
  );
}

function audit() {
  const preservedDatabaseMarkers = [
    ["src/views/Databases.tsx", "bg-[var(--selected)]"],
    ["src/views/Databases.tsx", "hover:bg-[var(--selected-hover)]"],
    ["src/views/DatabaseEditor.tsx", "text-[22px]"],
    ["src/components/database/ViewTabBar.tsx", '"accent-soft"'],
    ["src/components/database/DatabasePeekPanel.tsx", "db-record-resize-handle"],
    ["src/index.css", ".db-row-active {\n  background: var(--selected);\n  box-shadow: none;"],
    ["src/components/database/primitives/DatabaseDialog.tsx", "hidden={!open}"],
  ];
  const retiredDatabaseSelectionMarkers = [
    ["src/views/Databases.tsx", "bg-[var(--accent-soft)]"],
    ["src/views/Databases.tsx", "w-[2px] bg-[var(--accent)]"],
    ["src/index.css", "box-shadow: inset 2px 0 0 var(--accent);"],
  ];
  const closed = [
    ["retired radius token", /var\(--r-(?:row|msg)\)/g, kitFiles],
    ["bare or named Tailwind radius", /(?:["'`]\S*\s|\s)rounded(?=[\s"'`]|-(?:sm|md|lg|xl|2xl)\b)/gm, kitFiles],
    ["click-focus border", /focus:(?:border|ring)[^\s"`]*/g, kitFiles],
    ["left selection bar", /\bborder-l-(?:[2-4](?=\b)|\[(?:[2-4])px\])/g, kitFiles],
    ["one-pixel inset ring", /inset 0 0 0 1px/g, kitFiles],
    ["forbidden product phrase", /needs(?:[\s_-]+)me/gi, files],
  ];

  const failures = closed.flatMap(([name, pattern, paths]) => {
    const matches = lines(pattern, paths);
    return matches.length ? [`${name}:\n  ${matches.join("\n  ")}`] : [];
  });

  for (const [relative, marker] of preservedDatabaseMarkers) {
    const source = readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
    if (!source.includes(marker)) failures.push(`preserved Database design marker missing: ${relative} -> ${marker}`);
  }
  for (const [relative, marker] of retiredDatabaseSelectionMarkers) {
    const source = readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
    if (source.includes(marker)) failures.push(`retired Database selection marker remains: ${relative} -> ${marker}`);
  }

  const closedCode = [
    ["ring utility", /\bring-/g, kitCodeFiles],
    ["custom outline utility", /outline-(?!none)/g, kitCodeFiles],
    ["dashed border", /(?:border-dashed|border\s*:\s*[^;\n]*dashed)/g, kitFiles],
    ["Badge", /(?:<Badge\b|\bimport\s*\{[^}]*\bBadge\b)/g, kitCodeFiles],
    ["Loader2", /\bLoader2\b/g, kitCodeFiles.filter((path) => !/[\\/](?:control|receipt)\.tsx$/.test(path.pathname))],
  ];
  for (const [name, pattern, paths] of closedCode) {
    const count = occurrences(pattern, paths);
    const preservedDatabaseCount = name === "dashed border" ? 1 : 0;
    if (count > preservedDatabaseCount) {
      failures.push(`${name}: ${count - preservedDatabaseCount} remaining`);
    }
  }

  const legacyHeights = lines(/rounded-\[var\(--r-ctl\)\].*\bh-(?:7|8|9|10|11)\b|\bh-(?:7|8|9|10|11)\b.*rounded-\[var\(--r-ctl\)\]/, kitFiles);
  if (legacyHeights.length) failures.push(`legacy control heights:\n  ${legacyHeights.join("\n  ")}`);

  if (failures.length) throw new Error(`Design-system audit failed\n\n${failures.join("\n\n")}`);
  console.log("Design-system audit passed (v3 kit; preserved Database surfaces excluded).")
}

function token(block, name) {
  const value = block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
  if (!value) throw new Error(`Missing --${name} in flavor block`);
  return value;
}

function contrastAudit() {
  const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  const panelContracts = [
    ["src/components/agent/agent-panel-shell.tsx", ['background: "var(--mantle)"', "bg-transparent"]],
    ["src/components/ui/receipt.tsx", ["text-[var(--text-muted)]"]],
    ["src/components/agent/target-picker.tsx", ["text-[var(--text-muted)]"]],
    ["src/components/agent/ejected-panel.tsx", ["text-[var(--text-muted)] transition-colors"]],
    ["src/components/ui/status-pill.tsx", [
      'waiting: "bg-transparent text-[var(--wait)]"',
      'verified: "bg-transparent text-[var(--ok)]"',
      'failure: "bg-transparent text-[var(--bad)]"',
    ]],
    ["src/components/agent/agent-turn.tsx", ["var(--agent-bubble-weight)", "rounded-[var(--r-ctl)] bg-transparent px-[11px] py-2"]],
    ["src/components/agent/hud.tsx", ["var(--agent-bubble-weight)"]],
  ];
  for (const [relative, markers] of panelContracts) {
    const source = readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
    for (const marker of markers) {
      if (!source.includes(marker)) throw new Error(`Panel contrast contract needs updating: ${relative} -> ${marker}`);
    }
  }
  for (const token of [
    "--text-mid: var(--text-muted);",
    "--text-dim: var(--text-muted);",
    "--surface-line: var(--line);",
    "--r-surface: 10px;",
    "--question: var(--wait);",
    "--success: var(--ok);",
    "--danger: var(--bad);",
    "--info: var(--runtime);",
    "--wait: #e2a47d;",
    "--ok: #a6cfa1;",
    "--bad: #de96aa;",
    "--runtime: #8cabdc;",
    "--wait: #774a22;",
    "--ok: #375c3a;",
    "--bad: #893a4a;",
    "--runtime: #325586;",
    "--agent-bubble-weight: 11%;",
  ]) if (!css.includes(token)) throw new Error(`2050 token contract needs updating: ${token}`);
  // Assert the modeled formulas so changing CSS cannot silently leave this audit stale.
  for (const formula of [
    "--selected-base: color-mix(in srgb, var(--base) 75%, var(--raised));",
    "--selected: color-mix(in srgb, var(--selected-base), var(--accent) var(--sel-accent-weight));",
    "--selected-hover: color-mix(in srgb, var(--selected-base), var(--accent) calc(var(--sel-accent-weight) + 2%));",
    "--hover: color-mix(in srgb, var(--accent) var(--sel-accent-weight), transparent);",
    "--hover-strong: color-mix(in srgb, var(--accent) calc(var(--sel-accent-weight) + 2%), transparent);",
    "--accent-hover: color-mix(in srgb, var(--accent) 92%, var(--accent-contrast));",
    "--accent-text: color-mix(in srgb, var(--accent) 60%, white);",
    "--accent-text: color-mix(in srgb, var(--accent) 50%, black);",
    "--user-bubble: color-mix(in srgb, var(--accent) 15%, var(--raised));",
    "--user-bubble: color-mix(in srgb, var(--accent) 9%, #fff);",
    "--go-bg: var(--selected);", "--go-hover: var(--selected-hover);", "--go-fg: var(--text);",
    "--go-bg: var(--accent);", "--go-hover: var(--accent-hover);", "--go-fg: var(--accent-fg);",
  ]) if (!css.includes(formula)) throw new Error(`Contrast model needs updating: ${formula}`);
  const flavors = ["mocha", "nitro", "macchiato", "frappe", "oled", "latte", "flat"];
  const accents = ["rosewater", "flamingo", "pink", "mauve", "red", "maroon", "peach", "yellow", "green", "teal", "sky", "sapphire", "blue", "lavender"];
  const darkSemantics = {
    question: "#e2a47d", success: "#a6cfa1", danger: "#de96aa", info: "#8cabdc",
  };
  const lightSemantics = {
    question: "#774a22", success: "#375c3a", danger: "#893a4a", info: "#325586",
  };
  const results = [];
  for (const flavor of flavors) {
    const start = css.indexOf(`:root[data-flavor="${flavor}"]`);
    const block = css.slice(start, css.indexOf("}", start) + 1);
    if (flavor === "mocha") {
      if (token(block, "ground") !== "#1b1b29" || token(block, "surface") !== "#20202f") {
        throw new Error("Mocha 2050 ground/surface tokens need updating.");
      }
    } else if (!block.includes("--ground: var(--base);") || !block.includes("--surface: var(--raised);")) {
      throw new Error(`${flavor} 2050 ground/surface mapping needs updating.`);
    }
    const basePlanes = ["base", "raised", "mantle", "crust", "input"].map((name) => rgb(token(block, name)));
    const surface = flavor === "mocha" ? rgb(token(block, "surface")) : rgb(token(block, "raised"));
    const planes = [...basePlanes, surface];
    const [base, raised] = planes;
    const text = rgb(token(block, "text"));
    const muted = rgb(token(block, "text-muted"));
    const light = flavor === "latte" || flavor === "flat";
    const semanticForegrounds = light ? lightSemantics : darkSemantics;
    let minimum = Infinity, checks = 0;
    const check = (foreground, background, state, accent, strength) => {
      const ratio = contrast(foreground, background);
      if (ratio < 4.5) throw new Error(`${flavor}/${accent}/${strength} ${state}: ${ratio.toFixed(2)} < 4.5`);
      minimum = Math.min(minimum, ratio); checks++;
    };
    for (const plane of planes) {
      check(muted, plane, "meaningful mid metadata", "base", 0);
      check(muted, plane, "meaningful dim metadata", "base", 0);
    }
    for (const [role, hex] of Object.entries(semanticForegrounds)) {
      for (const plane of planes) check(rgb(hex), plane, `${role} semantic text`, "base", 0);
    }
    for (const accentName of accents) {
      const hex = token(block, accentName), accent = rgb(hex);
      const ink = rgb(accentForeground(hex));
      const hover = mix(accent, ink.map((channel) => 1 - channel), 0.08);
      const accentText = mix(accent, light ? [0, 0, 0] : [1, 1, 1], light ? 0.5 : 0.4);
      const userBubble = mix(light ? [1, 1, 1] : raised, accent, light ? 0.09 : 0.15);
      check(text, userBubble, "user bubble text", accentName, light ? 0.09 : 0.15);
      for (const plane of planes) {
        check(text, mix(plane, accent, 0.11), "agent bubble text", accentName, 0.11);
      }
      for (let step = 4; step <= 14; step++) {
        const strength = step / 100, weight = strength * 0.6;
        for (const extra of [0, 0.02]) {
          const selected = mix(mix(base, raised, 0.25), accent, weight + extra);
          check(text, selected, "selected text", accentName, strength);
          check(muted, selected, "selected muted", accentName, strength);
          check(light ? ink : text, light ? (extra ? hover : accent) : selected, "primary", accentName, strength);
          check(ink, extra ? hover : accent, "solid accent", accentName, strength);
          for (const plane of planes) {
            const wash = mix(plane, accent, weight + extra);
            check(text, wash, "hover text", accentName, strength);
            // Muted labels on hovered controls adopt normal text; static muted labels use their plane.
            check(accentText, wash, "accent text", accentName, strength);
            check(accentText, mix(plane, accent, 0.2), "accent-soft text", accentName, strength);
          }
        }
      }
    }
    results.push({ flavor, accents: accents.length, strengths: 11, checks, minimum: minimum.toFixed(2) });
  }
  console.table(results);
  console.log(`${results.reduce((sum, row) => sum + row.checks, 0)} actual foreground/state contrast pairs passed.`);
}

if (process.argv.includes("--contrast")) contrastAudit();
else audit();
