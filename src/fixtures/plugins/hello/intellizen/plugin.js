// Example IntelliZen plugin. Copy this folder to ~/.hermes/plugins/hello/ to
// try it. No imports: React comes in on ctx (`ctx.h` is createElement).
export default {
  name: "Hello",
  description: "The example plugin: a page, a sidebar row, a widget, a command, a panel action.",
  register(ctx) {
    const { h } = ctx;
    ctx.register({
      route: {
        title: "Hello",
        render: () => h("div", { className: "p-6 font-ui text-[13px] text-[var(--text)]" }, "Hello from a plugin."),
      },
      sidebar: { label: "Hello" },
      widget: {
        id: "greeting",
        label: "Hello widget",
        description: "Says hello on Home.",
        render: () => h("p", { className: "font-ui text-[13px] text-[var(--text)]" }, "Hello from Home."),
      },
      command: {
        id: "open",
        label: "Hello: open the page",
        run: ({ navigate }) => navigate(ctx.routeHref()),
      },
      panelAction: {
        id: "greet",
        label: "Ask for a greeting",
        run: ({ send }) => send("Say hello in one line."),
      },
    });
    ctx.onDispose(() => {});
  },
};
