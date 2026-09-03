import { beforeEach, describe, expect, it } from "vitest";

import helloJs from "../fixtures/plugins/hello/intellizen/plugin.js?raw";
import helloYaml from "../fixtures/plugins/hello/plugin.yaml?raw";
import brokenJs from "../fixtures/plugins/broken/intellizen/plugin.js?raw";
import { parsePluginYaml, reconcilePlugins, startPluginLoader, type PluginFs } from "./loader";
import { usePluginRegistry } from "./registry";

type File = { text: string; mtime: number };

/** An in-memory `~/.hermes/plugins`. Keys are paths under the root. */
function fakeFs(files: Map<string, File>): PluginFs {
  const ROOT = "/root";
  const under = (dir: string) => [...files.keys()].filter((p) => p.startsWith(`${dir}/`));
  return {
    readDir: async (dir) => {
      if (dir !== ROOT && under(dir).length === 0) throw new Error("ENOENT");
      const names = new Map<string, boolean>();
      for (const path of under(dir)) {
        const rest = path.slice(dir.length + 1).split("/");
        names.set(rest[0], rest.length > 1);
      }
      return [...names].map(([name, isDirectory]) => ({ name, isDirectory }));
    },
    readTextFile: async (path) => {
      const file = files.get(path);
      if (!file) throw new Error("ENOENT");
      return file.text;
    },
    mtime: async (path) => {
      const file = files.get(path);
      if (!file) throw new Error("ENOENT");
      return file.mtime;
    },
  };
}

const plugins = () => usePluginRegistry.getState().plugins;

beforeEach(() => {
  usePluginRegistry.getState().clear();
});

describe("parsePluginYaml", () => {
  it("reads top-level scalars and skips lists", () => {
    expect(parsePluginYaml(helloYaml)).toEqual({
      name: "hello",
      version: "0.1.0",
      description: "Example IntelliZen plugin: one of each contribution.",
    });
  });
  it("tolerates comments, nesting and a missing description", () => {
    const manifest = parsePluginYaml("# x\nname: disk-cleanup # trailing\nhooks:\n  - post_tool_call\nversion: 2.0.0\n");
    expect(manifest).toEqual({ name: "disk-cleanup", version: "2.0.0", description: undefined });
  });
});

describe("reconcilePlugins", () => {
  it("loads the hello fixture with one of each contribution", async () => {
    const files = new Map<string, File>([
      ["/root/hello/plugin.yaml", { text: helloYaml, mtime: 1 }],
      ["/root/hello/intellizen/plugin.js", { text: helloJs, mtime: 1 }],
      ["/root/kanban/plugin.yaml", { text: "name: kanban\n", mtime: 1 }],
    ]);
    const touched = await reconcilePlugins(fakeFs(files), "/root", new Map());
    expect(touched).toEqual(["hello"]);
    const hello = plugins().hello;
    expect(hello.status).toBe("loaded");
    expect(hello.name).toBe("Hello");
    expect(hello.version).toBe("0.1.0");
    const c = hello.contributions;
    expect([c.routes, c.sidebar, c.widgets, c.commands, c.panelActions].map((l) => l.length)).toEqual([1, 1, 1, 1, 1]);
    expect(plugins().kanban).toBeUndefined();
    let to = "";
    c.commands[0].run({ navigate: (t) => (to = t) });
    expect(to).toBe("/plugin/hello");
  });

  it("isolates a plugin that throws, at evaluation or in register", async () => {
    const files = new Map<string, File>([
      ["/root/hello/intellizen/plugin.js", { text: helloJs, mtime: 1 }],
      ["/root/syntax/intellizen/plugin.js", { text: "export default {", mtime: 1 }],
      ["/root/throws/plugin.yaml", { text: "name: Throws\n", mtime: 1 }],
      ["/root/throws/intellizen/plugin.js", { text: brokenJs, mtime: 1 }],
      ["/root/shape/intellizen/plugin.js", { text: "export default 42", mtime: 1 }],
    ]);
    await reconcilePlugins(fakeFs(files), "/root", new Map());
    expect(plugins().hello.status).toBe("loaded");
    expect(plugins().syntax.status).toBe("error");
    expect(plugins().throws).toMatchObject({ status: "error", name: "Throws", error: "D.13 deliberate isolated failure" });
    expect(plugins().shape.error).toMatch(/register\(ctx\)/);
    expect(plugins().throws.contributions.routes).toEqual([]);
  });

  it("hot reloads on mtime change, runs onDispose, and drops removed folders", async () => {
    const v1 =
      "export default { name: 'One', register(ctx) { ctx.register({ sidebar: { label: 'v1' } }); ctx.onDispose(() => { globalThis.__disposed = (globalThis.__disposed ?? 0) + 1 }) } }";
    const v2 = "export default { name: 'Two', register(ctx) { ctx.register({ sidebar: { label: 'v2' } }) } }";
    const files = new Map<string, File>([["/root/p/intellizen/plugin.js", { text: v1, mtime: 1 }]]);
    const fs = fakeFs(files);
    const stamps = new Map<string, string>();
    await reconcilePlugins(fs, "/root", stamps);
    expect(plugins().p.contributions.sidebar[0].label).toBe("v1");

    expect(await reconcilePlugins(fs, "/root", stamps)).toEqual([]); // unchanged: no reload

    files.set("/root/p/intellizen/plugin.js", { text: v2, mtime: 2 });
    expect(await reconcilePlugins(fs, "/root", stamps)).toEqual(["p"]);
    expect(plugins().p.name).toBe("Two");
    expect(plugins().p.contributions.sidebar[0].label).toBe("v2");
    expect((globalThis as { __disposed?: number }).__disposed).toBe(1);

    files.delete("/root/p/intellizen/plugin.js");
    await reconcilePlugins(fs, "/root", stamps);
    expect(plugins().p).toBeUndefined();
    expect(stamps.size).toBe(0);
  });

  it("returns nothing when the root does not exist", async () => {
    expect(await reconcilePlugins(fakeFs(new Map()), "/missing", new Map())).toEqual([]);
  });
});

describe("startPluginLoader", () => {
  it("polls and picks up a fixing save", async () => {
    const files = new Map<string, File>([["/root/p/intellizen/plugin.js", { text: "export default {", mtime: 1 }]]);
    const loaded: string[] = [];
    const stop = startPluginLoader({ fs: fakeFs(files), root: "/root", intervalMs: 10, onLoaded: (id) => loaded.push(id) });
    await new Promise((r) => setTimeout(r, 5));
    expect(plugins().p.status).toBe("error");
    files.set("/root/p/intellizen/plugin.js", { text: "export default { register() {} }", mtime: 2 });
    await new Promise((r) => setTimeout(r, 40));
    stop();
    expect(plugins().p.status).toBe("loaded");
    expect(loaded).toEqual(["p", "p"]);
  });
});
