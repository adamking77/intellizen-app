// Guards the seam: every method and event in `contract.ts` must exist in the
// Hermes source at the pinned revision. Updating Hermes is: bump
// `HERMES_PIN`, run this, fix what turned red. See ROADMAP.md "Keeping it
// updated safely".

import { describe, expect, it } from "vitest";

import { GATEWAY_EVENTS, GATEWAY_METHODS, HERMES_REST_ROUTES } from "./contract";
import pinFile from "./HERMES_PIN?raw";

// The app tsconfig carries no Node types (it compiles a webview). The test
// runs under vitest on Node, so the built-ins are loaded through a
// non-literal specifier, which TypeScript types as `any`.
const nodeModule = (name: string) => import(/* @vite-ignore */ name);
const { execSync } = (await nodeModule("node:child_process")) as {
  execSync: (command: string, options: Record<string, unknown>) => string;
};
const { existsSync } = (await nodeModule("node:fs")) as { existsSync: (path: string) => boolean };
const { homedir } = (await nodeModule("node:os")) as { homedir: () => string };

const PIN = pinFile.trim();
const CHECKOUT = `${homedir()}/.hermes/hermes-agent`;

function git(args: string): string {
  return execSync(`git -C ${JSON.stringify(CHECKOUT)} ${args}`, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function pinnedGatewaySource(): { files: string[]; source: string } {
  const files = git(`ls-tree -r --name-only ${PIN} tui_gateway`)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".py"));
  const source = files.map((file) => git(`show ${PIN}:${file}`)).join("\n");
  return { files, source };
}

function pinnedRestSource(): { files: string[]; source: string } {
  const files = git(`ls-tree -r --name-only ${PIN} hermes_cli plugins/kanban`)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".py"));
  const source = files.map((file) => git(`show ${PIN}:${file}`)).join("\n");
  return { files, source };
}

const present = existsSync(`${CHECKOUT}/.git`);

if (!present) {
  it.skip("Hermes checkout not present; parity not checked", () => undefined);
}

(present ? describe : describe.skip)(`gateway parity against Hermes ${PIN.slice(0, 12)}`, () => {
  const { files, source } = pinnedGatewaySource();

  it("reads the pinned tui_gateway sources", () => {
    expect(PIN).toMatch(/^[0-9a-f]{40}$/);
    expect(files.length).toBeGreaterThan(5);
    expect(files).toContain("tui_gateway/server.py");
    expect(source.length).toBeGreaterThan(100_000);
  });

  it.each([...GATEWAY_METHODS])("registers method %s with @method(...)", (method) => {
    expect(
      source.includes(`@method("${method}")`) ||
      source.includes(`@_projects_method("${method}")`),
    ).toBe(true);
  });

  it.each([...GATEWAY_EVENTS])("emits event %s as a string literal", (event) => {
    expect(source.includes(`"${event}"`) || source.includes(`'${event}'`)).toBe(true);
  });

  const rest = pinnedRestSource();
  it("reads the pinned REST and kanban sources", () => {
    expect(rest.files).toContain("hermes_cli/web_server.py");
    expect(rest.files).toContain("plugins/kanban/dashboard/plugin_api.py");
  });

  it.each([...HERMES_REST_ROUTES])("registers $method $path", ({ method, path, ...route }) => {
    const sourcePath = "sourcePath" in route ? route.sourcePath : path;
    const decorator = `.${method.toLowerCase()}(\"${sourcePath}\")`;
    expect(rest.source.includes(decorator)).toBe(true);
  });
});
