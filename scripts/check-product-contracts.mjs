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

console.log("Product contract checks passed.");
