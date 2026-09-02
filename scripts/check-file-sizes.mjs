import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const threshold = 1_000;
const sourceRoots = ["src", "src-tauri/src", "mcp-server/src"];
const extensions = new Set([".ts", ".tsx", ".rs"]);

// Existing debt is explicit and cannot grow. Lower a budget whenever a split lands;
// delete the entry once the file is at or below the general threshold.
const legacyBudgets = new Map(
  Object.entries({
    "mcp-server/src/index.ts": 5377,
    "src-tauri/src/runtimes.rs": 1089,
    "src/components/canvas/CanvasEditor.tsx": 1811,
    "src/components/database/DatabaseChartView.tsx": 1587,
    "src/components/database/DatabasePeekPanel.tsx": 1317,
    "src/components/database/DatabaseTableView.tsx": 1124,
    "src/components/database/ViewTabBar.tsx": 1549,
    "src/lib/data.ts": 5427,
    "src/lib/database-core.ts": 1077,
    "src/services/workflow-runner.ts": 1199,
    "src/views/DatabaseEditor.tsx": 1671,
    "src/views/Graph.tsx": 3561,
    "src/views/Investigation.tsx": 1427,
    "src/views/Projects.tsx": 1434,
  }),
);

async function sourceFiles(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (extensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const files = (await Promise.all(sourceRoots.map(sourceFiles))).flat();
const observed = new Map();
const failures = [];

for (const file of files) {
  const path = relative(root, join(root, file));
  const lines = (await readFile(join(root, file), "utf8")).split("\n").length - 1;
  observed.set(path, lines);
  const budget = legacyBudgets.get(path) ?? threshold;
  if (lines > budget) failures.push(`${path}: ${lines} lines exceeds ${budget}`);
}

for (const path of legacyBudgets.keys()) {
  if (!observed.has(path)) {
    failures.push(`${path}: stale legacy budget; remove it after the file move/delete`);
  }
}

if (failures.length) {
  console.error("File-size gate failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(
  `File-size gate passed (${files.length} source files; ${legacyBudgets.size} ratcheted exceptions).`,
);
