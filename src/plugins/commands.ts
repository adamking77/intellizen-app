// Plugin commands in the shape the ⌘K palette ranks and runs.
import { useMemo } from "react";

import { isTauriRuntime } from "@/components/layout/window-chrome";
import { toastError } from "@/lib/toast";

import { reloadPluginsNow } from "./boot";
import { usePluginCommands } from "./registry";

export interface PluginPaletteCommand {
  id: string;
  label: string;
  hint?: string;
  kind: "action";
  run: (ctx: { navigate: (to: string) => void }) => void;
}

export function usePluginPaletteCommands(): PluginPaletteCommand[] {
  const commands = usePluginCommands();
  return useMemo(() => {
    const list: PluginPaletteCommand[] = commands.map((command) => ({
      id: `plugin:${command.pluginId}:${command.id}`,
      label: command.label,
      hint: command.hint ?? command.pluginName,
      kind: "action",
      run: (ctx) => {
        try {
          command.run(ctx);
        } catch (error) {
          toastError(`Plugin “${command.pluginName}” command failed`, error);
        }
      },
    }));
    if (isTauriRuntime) {
      list.push({
        id: "plugin:reload",
        label: "Reload plugins",
        hint: "~/.hermes/plugins",
        kind: "action",
        run: () => {
          reloadPluginsNow().catch((error) => toastError("Could not reload plugins", error));
        },
      });
    }
    return list;
  }, [commands]);
}
