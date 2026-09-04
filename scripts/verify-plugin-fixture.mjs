import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Hidden at the plugin root so the live loader deliberately ignores proof
// plugins while this verifier can still exercise their exact installed bytes.
const installedRoot = join(homedir(), ".hermes", "plugins", ".retired-wave1-proof");
const repositoryRoot = new URL("../src/fixtures/plugins/", import.meta.url);

async function source(path) {
  return readFile(path, "utf8");
}

const healthyPath = join(installedRoot, "intellizen-wave1-fixture", "intellizen", "plugin.js");
const brokenPath = join(installedRoot, "intellizen-wave1-broken", "intellizen", "plugin.js");
const healthySource = await source(healthyPath);
const brokenSource = await source(brokenPath);

const expectedHealthy = await source(new URL("wave1-proof/intellizen/plugin.js", repositoryRoot));
const expectedBroken = await source(new URL("broken/intellizen/plugin.js", repositoryRoot));
if (healthySource.trimEnd() !== expectedHealthy.trimEnd() || brokenSource.trimEnd() !== expectedBroken.trimEnd()) {
  throw new Error("Installed D.13 fixtures do not match the repository fixtures.");
}

async function evaluate(text) {
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(text)}`);
}

const contributions = [];
const healthy = (await evaluate(healthySource)).default;
healthy.register({
  h: (...args) => args,
  register: (value) => contributions.push(value),
  onDispose: () => undefined,
  routeHref: (path = "") => `/plugin/intellizen-wave1-fixture${path ? `/${path}` : ""}`,
});

const combined = Object.assign({}, ...contributions);
const required = ["route", "sidebar", "widget", "command", "panelAction"];
for (const key of required) {
  if (!combined[key]) throw new Error(`D.13 fixture is missing ${key}.`);
}

let brokenFailedAlone = false;
try {
  (await evaluate(brokenSource)).default.register({});
} catch (error) {
  brokenFailedAlone =
    error instanceof Error && error.message === "D.13 deliberate isolated failure";
}
if (!brokenFailedAlone) throw new Error("The deliberately broken fixture did not fail as expected.");

console.log(
  `D.13 installed plugin proof passed: ${required.join(", ")}; broken plugin failed alone.`,
);
