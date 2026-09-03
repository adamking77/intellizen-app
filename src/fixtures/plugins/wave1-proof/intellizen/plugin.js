// D.13 acceptance fixture: one contribution on every supported surface.
export default {
  name: "Wave 1 proof",
  description: "Local proof of IntelliZen's generic plugin contract.",
  register(ctx) {
    const { h } = ctx;
    ctx.register({
      route: {
        title: "Plugin contract proof",
        render: () =>
          h(
            "div",
            { className: "flex h-full flex-col gap-3 bg-[var(--base)] p-6 text-[var(--text)]" },
            h("h1", { className: "font-ui text-[16px] font-light uppercase tracking-[0.16em]" }, "Plugin contract proof"),
            h("p", { className: "font-ui text-[13px] text-[var(--text-muted)]" }, "Route contribution loaded from ~/.hermes/plugins."),
          ),
      },
      sidebar: { label: "Plugin proof", order: 100 },
      widget: {
        id: "contract-proof",
        label: "Plugin contract proof",
        description: "D.13 local fixture.",
        render: () =>
          h(
            "div",
            { className: "font-ui text-[13px] text-[var(--text)]" },
            "Home widget contribution is live.",
          ),
      },
      command: {
        id: "open-proof",
        label: "Plugin proof: open page",
        hint: "Wave 1",
        run: ({ navigate }) => navigate(ctx.routeHref()),
      },
      panelAction: {
        id: "ask-status",
        label: "Plugin proof: ask for status",
        run: ({ send }) => send("Give me a one-line status update."),
      },
    });
  },
};
