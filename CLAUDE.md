# InteliZen — Build Context

macOS-only Tauri v2 desktop intelligence platform for GenZen. Full spec in `intellizen-tauri-spec.md`. Read it before writing any code.

## Credentials

```
VITE_SUPABASE_URL=https://jicrdrwtwubveyvzyyrh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppY3Jkcnd0d3VidmV5dnp5eXJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NTI2MjgsImV4cCI6MjA4NzIyODYyOH0.tvPbYnbvHFhBp2u44h9P-O4DFFj9pd6mepuA0Yk9cvc
VITE_EXA_API_KEY=ca04e163-e55b-49ca-9b40-3454d11a35d6
```

These are also in `.env.local`. The Supabase project is the existing GenZen Brain project — do not create a new project.

## Stack

Tauri v2 · React 18 + TypeScript + Vite · Tailwind CSS v4 · shadcn/ui · Zustand · TanStack Query · Supabase JS v2 · Exa JavaScript SDK (`exa-js`) · React Flow · pnpm

## Build Sequence

Follow this order exactly:

1. Run Supabase migrations — 4 tables: `intel_signals`, `projects`, `project_signals`, `monitors` (SQL in spec)
2. Scaffold Tauri v2 app with Vite + React + TypeScript
3. Install all deps — Tailwind v4, shadcn/ui init, Zustand, TanStack Query, Supabase client, Exa SDK, React Flow
4. Sidebar nav layout, 5-screen routing skeleton, `.env.local` wired
5. Monitors screen — CRUD, seed 7 default Watch domains
6. Inbox screen — Exa pull on Refresh, signal cards, triage actions, project selector drawer
7. Projects screen — list view, create, detail view
8. Search screen — all 7 Exa modes, add-to-project flow
9. Graph migrations (`graph_nodes` + `graph_edges`), then Graph screen — React Flow, manual mode

## Key Decisions (do not re-litigate)

- **No Anthropic API. No `claude -p` subprocess.** Exa handles all data collection. Claude is external.
- **No Vercel webhook in V1.** Signals are pulled from Exa on demand when Inbox refreshes.
- **shadcn/ui, not HeroUI.** Copy components into `src/components/ui/`.
- **Tailwind v4**, not v3.
- **Single user, no auth.** Supabase anon key, RLS disabled on InteliZen tables.
- **macOS only.** No cross-platform build targets.
- **Supabase project is shared with GenZen Brain.** Add the 4 new tables without touching existing Brain tables (`documents`, `chunks`, `cases`, `decisions`, `config`, `taste_preferences`).

## V1 Screens (5)

| Screen | Route | Purpose |
|---|---|---|
| Inbox | `/inbox` | Daily signal feed from Monitors, triage |
| Search | `/search` | All 7 Exa search modes, save to Projects |
| Projects | `/projects` | Organize saved intel by use case |
| Monitors | `/monitors` | Manage search templates |
| Graph | `/graph` | React Flow canvas, manual node/edge creation |

## Exa Integration Reference

Install: `pnpm add exa-js`

### Client setup (`src/lib/exa.ts`)

```typescript
import Exa from "exa-js"
export const exa = new Exa(import.meta.env.VITE_EXA_API_KEY)
```

### Search mode implementations

**Web** (semantic, autoprompt):
```typescript
const results = await exa.searchAndContents(query, {
  type: 'auto',
  useAutoprompt: true,
  numResults: 10,
  highlights: { numSentences: 3, highlightsPerUrl: 1 }
})
```

**News** (date-filterable):
```typescript
const results = await exa.searchAndContents(query, {
  type: 'auto',
  category: 'news',
  numResults: 10,
  highlights: { numSentences: 3, highlightsPerUrl: 1 },
  startPublishedDate: startDate // optional ISO 8601, e.g. '2026-01-01T00:00:00Z'
})
```

**Research Papers:**
```typescript
const results = await exa.searchAndContents(query, {
  category: 'research paper',
  numResults: 10,
  highlights: { numSentences: 3, highlightsPerUrl: 1 }
})
```

**Company:**
```typescript
const results = await exa.search(query, {
  category: 'company',
  numResults: 10
})
```

**People** (LinkedIn + personal sites):
```typescript
const results = await exa.search(query, {
  category: 'personal site',
  numResults: 10
})
```

**Financial Reports:**
```typescript
const results = await exa.search(query, {
  category: 'financial report',
  numResults: 10
})
```

**Deep Research** (async — REST API, not in SDK):
```typescript
// Fire
const res = await fetch('https://api.exa.ai/research/v1', {
  method: 'POST',
  headers: {
    'x-api-key': import.meta.env.VITE_EXA_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    instructions: query,
    model: 'exa-research'
  })
})
const { id } = await res.json()

// Poll until complete (2s interval)
async function pollResearch(id: string): Promise<string> {
  const res = await fetch(`https://api.exa.ai/research/v1/${id}`, {
    headers: { 'x-api-key': import.meta.env.VITE_EXA_API_KEY }
  })
  const data = await res.json()
  if (data.status === 'completed') return data.data
  if (data.status === 'failed') throw new Error(data.error)
  await new Promise(r => setTimeout(r, 2000))
  return pollResearch(id)
}
```

Deep Research returns a markdown string, not a results array. Display as formatted text, not a card list.

### Exa result shape

```typescript
interface ExaResult {
  id: string
  url: string
  title: string
  publishedDate: string | null
  author: string | null
  score: number
  highlights?: string[]
  highlightScores?: number[]
  text?: string
}
```

### Mapping Exa result → `intel_signals` row

```typescript
function toSignal(result: ExaResult, monitorId: number | null, watchDomain: string) {
  return {
    monitor_id: monitorId,
    title: result.title,
    url: result.url,
    source: new URL(result.url).hostname,
    published_at: result.publishedDate ?? null,
    snippet: result.highlights?.[0] ?? result.text?.slice(0, 300) ?? null,
    watch_domain: watchDomain,
    exa_score: result.score,
    raw_payload: result,
    status: 'new'
  }
}
```

### Inbox Refresh logic

```typescript
async function refreshInbox(monitors: Monitor[]) {
  const active = monitors.filter(m => m.status === 'active')

  const { data: existing } = await supabase
    .from('intel_signals')
    .select('url')
  const seen = new Set(existing?.map(r => r.url) ?? [])

  for (const monitor of active) {
    const results = await exa.searchAndContents(monitor.query, {
      type: 'auto',
      numResults: 10,
      highlights: { numSentences: 3, highlightsPerUrl: 1 }
    })

    const newSignals = results.results
      .filter(r => !seen.has(r.url))
      .map(r => toSignal(r, monitor.id, monitor.watch_domain))

    if (newSignals.length > 0) {
      await supabase.from('intel_signals').insert(newSignals)
      await supabase
        .from('monitors')
        .update({ last_run: new Date().toISOString() })
        .eq('id', monitor.id)
    }
  }
}
```

## V2 (out of scope — do not build)

Reports page, Triggers, Exa Monitor webhooks, Auto Graph, 6-phase Investigation workflow, Vault sync.
