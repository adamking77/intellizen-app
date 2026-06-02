# Bklit Chart Migration

## Decision

IntelliZen can replace its current Recharts-based database chart renderer with Bklit UI charts.

Bklit UI is a shadcn registry of React source components. It is not a Recharts wrapper. Installing Bklit chart components vendors chart source into the app and adds the required runtime dependencies, primarily `@visx/*`, `d3-*`, `motion`, and small supporting packages.

This fits IntelliZen because the app is already Tauri + Vite + React, uses Tailwind v4, has the `@/*` path alias, and already exposes `@/lib/utils`.

## Current IntelliZen Surface

Recharts usage is currently concentrated in `src/components/database/DatabaseChartView.tsx`.

The current chart view supports:

- `bar`
- `line`, implemented as a filled Recharts `AreaChart`
- `donut`, implemented with Recharts `PieChart`
- `pie`, implemented with Bklit `PieChart` and no inner radius
- `gauge`, implemented with Bklit `Gauge`

The chart settings are already persisted in `workspace_views.config`:

- `chartType`
- `chartValueField`
- `chartAggregation`
- `chartShowLegend`
- `chartShowGrid`
- `chartPalette`
- `chartRange`
- `chartSeriesMode`
- `chartValueFields`
- `chartOrientation`
- `chartLineVariant`
- `chartShowXAxis`
- `chartShowYAxis`
- `chartGoalValue`

No Supabase schema change is required for the Bklit migration if the same settings remain sufficient.

## Recommended Component Mapping

| IntelliZen chart type | Current implementation | Bklit target |
| --- | --- | --- |
| `bar` | Recharts `BarChart` | `@bklit/bar-chart` |
| `line` | Recharts `AreaChart` | `@bklit/line-chart` |
| `donut` | Recharts `PieChart` | `@bklit/pie-chart` |
| `pie` | new chart option | `@bklit/pie-chart` |
| `gauge` | new chart option | `@bklit/gauge-chart` |

Use Bklit `line-chart` for IntelliZen's `line` option so single-line and multi-line charts share the same rendering model.
Use Bklit `pie-chart` for IntelliZen's `donut` option because it supports the same part-to-whole slice model with an inner radius. Bklit's `ring-chart` is better suited to concentric KPI rings, not a categorical donut replacement.

## Implementation Plan

1. Add `components.json` with the `@bklit` registry:

   ```json
   {
     "registries": {
       "@bklit": "https://ui.bklit.com/r/{name}.json"
     }
   }
   ```

2. Install the initial chart set:

   ```bash
   pnpm dlx shadcn@latest add @bklit/bar-chart
   pnpm dlx shadcn@latest add @bklit/line-chart
   pnpm dlx shadcn@latest add @bklit/pie-chart
   pnpm dlx shadcn@latest add @bklit/gauge-chart
   ```

3. Add IntelliZen chart CSS variables to `src/index.css`, mapped to the existing Catppuccin tokens.

4. Replace the Recharts imports and the three renderer functions in `DatabaseChartView.tsx`.

5. Preserve the existing IntelliZen behavior around:

   - data aggregation
   - empty states
   - compact dashboard sizing
   - chart range filtering
   - legends
   - palette selection

6. Run:

   ```bash
   pnpm check
   pnpm build
   pnpm tauri dev
   ```

7. Remove `recharts` only after no imports remain.

## Supabase Placement

There are two separate Supabase concerns:

1. Chart view settings
2. This migration/architecture note

### Chart View Settings

Keep chart settings in `workspace_views.config`.

Bklit is a rendering-layer migration, so it should not create a new table or new top-level columns unless the app adds genuinely new user-facing chart options. The existing JSONB config already holds chart type, aggregation, palette, legend/grid toggles, and time range.

If future Bklit-only options are added, place them inside the same config object:

```json
{
  "chartType": "line",
  "chartPalette": "blue",
  "chartSeriesMode": "multi",
  "chartValueFields": ["revenue", "cost"],
  "chartOrientation": "horizontal",
  "chartLineVariant": "profitLoss",
  "chartShowXAxis": true,
  "chartShowYAxis": true,
  "chartGoalValue": 100
}
```

This keeps view-level presentation state attached to the saved view that owns it.

### Migration Note

Store this decision note in the GenZen Brain knowledge document table used by the app:

- schema: `knowledge`
- table: `documents`
- `document_type`: `strategy`
- `domain`: `internal`
- `source_path`: `intellizen/architecture/bklit-chart-migration.md`

Suggested metadata:

```json
{
  "app": "intellizen",
  "area": "charts",
  "decision": "replace-recharts-with-bklit",
  "status": "proposed",
  "tags": ["tauri", "react", "charts", "bklit", "recharts", "supabase"]
}
```

Example insert:

```sql
insert into knowledge.documents (
  title,
  source_path,
  document_type,
  domain,
  content,
  metadata
) values (
  'IntelliZen Bklit Chart Migration',
  'intellizen/architecture/bklit-chart-migration.md',
  'strategy',
  'internal',
  '<markdown content>',
  '{
    "app": "intellizen",
    "area": "charts",
    "decision": "replace-recharts-with-bklit",
    "status": "proposed",
    "tags": ["tauri", "react", "charts", "bklit", "recharts", "supabase"]
  }'::jsonb
);
```

Do not store this in `vault_files`. That table is for generated investigation/project artifacts. This is an app architecture decision, so `knowledge.documents` is the cleaner long-term home.

## Notes

- Bklit's "Skills" are AI-agent instructions, not runtime dependencies.
- Astro compatibility is separate from IntelliZen's Tauri frontend. Bklit can be used on Astro sites through React islands, but IntelliZen itself should integrate Bklit directly in its Vite React frontend.
- Supabase's April 2026 Data API behavior change means newly created tables may not be exposed automatically. This migration should avoid new tables, so that change is not a blocker.
