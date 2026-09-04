import { readdirSync, readFileSync } from "node:fs";

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
  const closed = [
    ["retired radius token", /var\(--r-(?:row|msg)\)/g],
    ["bare or named Tailwind radius", /(?:["'`]\S*\s|\s)rounded(?=[\s"'`]|-(?:sm|md|lg|xl|2xl)\b)/gm],
    ["click-focus border", /focus:(?:border|ring)[^\s"`]*/g],
    ["left selection bar", /border-l-/g],
    ["one-pixel inset ring", /inset 0 0 0 1px/g],
    ["forbidden product phrase", /needs(?:[\s_-]+)me/gi],
  ];

  const failures = closed.flatMap(([name, pattern]) => {
    const matches = lines(pattern);
    return matches.length ? [`${name}:\n  ${matches.join("\n  ")}`] : [];
  });

  // These are measured migration debt, not permission to add more. K.2 and
  // K.7 ratchet each ceiling to zero as the primitives and remaining pages move.
  const debt = [
    ["ring utility", /\bring-/g, 6],
    ["custom outline utility", /outline-(?!none)/g, 2],
    ["dashed border", /border-dashed/g, 12],
    ["Loader2", /\bLoader2\b/g, 36],
    ["Badge", /(?:<Badge\b|\bimport\s*\{[^}]*\bBadge\b)/g, 25],
  ];
  for (const [name, pattern, ceiling] of debt) {
    const count = occurrences(pattern, codeFiles);
    if (count > ceiling) failures.push(`${name}: ${count} exceeds migration ceiling ${ceiling}`);
  }

  const legacyHeights = lines(/rounded-\[var\(--r-ctl\)\].*\bh-(?:7|8|9|10|11)\b|\bh-(?:7|8|9|10|11)\b.*rounded-\[var\(--r-ctl\)\]/);
  if (legacyHeights.length > 42) failures.push(`legacy control heights: ${legacyHeights.length} exceeds migration ceiling 42`);

  if (failures.length) throw new Error(`Design-system audit failed\n\n${failures.join("\n\n")}`);
  console.log("Design-system audit passed (K.1 rules closed; migration debt did not grow).")
}

function hexRgb(hex) {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
}

function linear(channel) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function rgbToLab(hex) {
  const [r, g, b] = hexRgb(hex).map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function labToLch({ l, a, b }) {
  return { l, c: Math.hypot(a, b), h: Math.atan2(b, a) };
}

function lchToLab({ l, c, h }) {
  return { l, a: c * Math.cos(h), b: c * Math.sin(h) };
}

function labToRgb({ l, a, b }) {
  const ll = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const ss = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss,
    -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss,
    -0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss,
  ];
  return rgb.map((channel) => Math.min(1, Math.max(0, channel)));
}

function mixLch(from, to, amount) {
  let hueDelta = to.h - from.h;
  if (hueDelta > Math.PI) hueDelta -= 2 * Math.PI;
  if (hueDelta < -Math.PI) hueDelta += 2 * Math.PI;
  return {
    l: from.l + (to.l - from.l) * amount,
    c: from.c + (to.c - from.c) * amount,
    h: from.h + hueDelta * amount,
  };
}

function luminance(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function token(block, name) {
  const value = block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
  if (!value) throw new Error(`Missing --${name} in flavor block`);
  return value;
}

function contrastAudit() {
  const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  const flavors = ["mocha", "nitro", "macchiato", "frappe", "oled", "latte", "flat"];
  const results = [];

  for (const flavor of flavors) {
    const selector = flavor === "mocha" ? ':root[data-flavor="mocha"]' : `:root[data-flavor="${flavor}"]`;
    const start = css.indexOf(selector);
    const block = css.slice(start, css.indexOf("}", start) + 1);
    const base = labToLch(rgbToLab(token(block, "base")));
    const raised = labToLch(rgbToLab(token(block, "raised")));
    const muted = labToLch(rgbToLab(token(block, "text-muted")));
    const accent = labToLch(rgbToLab(token(block, "blue")));
    const light = flavor === "latte" || flavor === "flat";

    for (const strength of [0.04, 0.08, 0.14]) {
      const step = Math.max(strength, 0.06);
      let selected = { ...raised, l: raised.l + (light ? -step : step), c: raised.c + (light ? 0 : 0.02) };
      if (!light) selected = mixLch(selected, accent, strength * 0.6);
      const selectedMuted = { ...muted, l: light ? 0.28 : 0.98 };
      const delta = Math.abs(selected.l - base.l);
      const ratio = contrast(labToRgb(lchToLab(selectedMuted)), labToRgb(lchToLab(selected)));
      results.push({ flavor, strength: strength.toFixed(2), delta: delta.toFixed(3), contrast: ratio.toFixed(2), pass: delta >= 0.06 && ratio >= 4.5 });
    }
  }

  console.table(results);
  const failed = results.filter((row) => !row.pass);
  if (failed.length) throw new Error(`${failed.length} selection contrast checks failed`);
}

if (process.argv.includes("--contrast")) contrastAudit();
else audit();
