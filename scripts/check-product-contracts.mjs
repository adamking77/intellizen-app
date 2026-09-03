import { readdirSync, readFileSync } from "node:fs";

const sourceRoot = new URL("../src/", import.meta.url);
const forbidden = /needs(?:[\s_-]+)me/i;

function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) inspect(path);
    else if (
      forbidden.test(entry.name) ||
      (/\.(?:ts|tsx|js|jsx|css|html)$/.test(entry.name) && forbidden.test(readFileSync(path, "utf8")))
    ) {
      throw new Error(`Product contract: Needs me is user-defined data, not core app code (${path.pathname}).`);
    }
  }
}

inspect(sourceRoot);

for (const path of ["../ROADMAP.md", "../docs/stages/wave-1-spec.md"]) {
  const contract = readFileSync(new URL(path, import.meta.url), "utf8");
  if (!/workflow design requires Adam's explicit approval|workflow-design approval gate/i.test(contract)) {
    throw new Error(`Product contract: Adam must approve workflow design before implementation (${path}).`);
  }
}

const capabilities = JSON.parse(
  readFileSync(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"),
);
if (!capabilities.permissions?.includes("fs:allow-appdata-write-recursive")) {
  throw new Error("Product contract: agent teams must remain writable under $APPDATA.");
}

const approvedFlows = {
  agents: readFileSync(new URL("../src/views/Agents.tsx", import.meta.url), "utf8"),
  pluginActions: readFileSync(new URL("../src/plugins/panel-actions.tsx", import.meta.url), "utf8"),
  graphMenu: readFileSync(new URL("../src/components/graph/graph-export-menu.tsx", import.meta.url), "utf8"),
  graphView: readFileSync(new URL("../src/views/Graph.tsx", import.meta.url), "utf8"),
  voice: readFileSync(new URL("../src/voice/use-voice.ts", import.meta.url), "utf8"),
  panel: readFileSync(new URL("../src/components/layout/agent-panel.tsx", import.meta.url), "utf8"),
};
if (!approvedFlows.agents.includes(".selectRoom(") || /navigate\(`\/room\//.test(approvedFlows.agents)) {
  throw new Error("Product contract: Team Open in chat must use the right-hand panel, not the center route.");
}
if (/aria-haspopup=["']menu["']|>\s*Actions\s*</.test(approvedFlows.pluginActions)) {
  throw new Error("Product contract: plugin actions are direct controls above the composer, not a dropdown.");
}
if (!approvedFlows.graphMenu.includes("Add to document") || approvedFlows.graphView.includes("copyGraphEmbedReference")) {
  throw new Error("Product contract: Graph inserts into a chosen document and never uses the clipboard workflow.");
}
if (!approvedFlows.voice.includes("startBrowserDictation") || !approvedFlows.panel.includes("voice.interim")) {
  throw new Error("Product contract: voice shows live interim words before the local final transcript.");
}

console.log("Product contract checks passed.");
