# IntelliZen Tauri App — Engineering Spec

## Purpose

Personal desktop app for the full GenZen intelligence workflow — four operational layers, each with different depth and intent:

1. **Monitoring** — passive, continuous collection from Exa Monitors. Inbox triage of signals by Watch domain.
2. **Search** — on-demand targeted queries on topics, situations, people, and organizations.
3. **Investigation** — deep OSINT on relationships, connections, and ecosystems. Structured 6-phase workflow from operational planning through report assembly.
4. **Reports** — intelligence outputs of varying depth and audience: internal sweep summaries, initial client assessments, deep case work, public-facing briefs.

Claude Code is the analytical engine. The app is the interface — managing what gets collected, initiating investigations, triggering `claude -p` at each phase, and organizing outputs by report type and audience.

---

## Stack

| Layer | Choice |
|---|---|
| Desktop shell | Tauri v2 |
| Frontend | React 18 + TypeScript |
| Build tool | Vite |
| UI components | HeroUI (heroui.com) |
| Styling | Tailwind CSS v3 (HeroUI peer dependency) |
| Supabase client | @supabase/supabase-js v2 |
| Webhook function | Vercel (Node 20, TypeScript) |
| Package manager | pnpm |

**HeroUI setup:**
```bash
pnpm add @heroui/react framer-motion
```

`tailwind.config.js`:
```js
const { heroui } = require('@heroui/react')

module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}'
  ],
  plugins: [heroui()]
}
```

`main.tsx`:
```tsx
import { HeroUIProvider } from '@heroui/react'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <HeroUIProvider>
    <App />
  </HeroUIProvider>
)
```

---

## Repo Structure

Monorepo. One repo, two packages.

```
intellizen/
├── app/                        # Tauri desktop app
│   ├── src-tauri/              # Rust backend (Tauri v2 default)
│   │   ├── tauri.conf.json
│   │   └── src/
│   │       └── main.rs
│   ├── src/                    # React frontend
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── views/
│   │       ├── Inbox.tsx           # Layer 1 — Monitoring
│   │       ├── WatchManager.tsx    # Layer 1 — Monitoring
│   │       ├── OsintSearch.tsx     # Layer 2 — Search
│   │       ├── Investigation.tsx   # Layer 3 — OSINT Investigation
│   │       └── Reports.tsx         # Layer 4 — Intel Reports
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── webhook/                    # Vercel serverless function
│   ├── api/
│   │   └── exa-webhook.ts
│   ├── vercel.json
│   └── package.json
│
├── pnpm-workspace.yaml
└── README.md
```

---

## Supabase Schema

### `intel_signals` table

```sql
create table intel_signals (
  id            uuid primary key default gen_random_uuid(),
  monitor_id    text not null,
  watch_id      text not null,
  title         text,
  source_url    text not null,
  source_domain text,
  published_date timestamptz,
  content       text,             -- highlights or full text from Exa
  raw_payload   jsonb,            -- full Exa result object, preserved for reference
  status        text not null default 'pending'
                check (status in ('pending', 'saved', 'dismissed')),
  tags          text[] default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Indexes
create index on intel_signals (status);
create index on intel_signals (watch_id);
create index on intel_signals (monitor_id);
create index on intel_signals (created_at desc);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger intel_signals_updated_at
  before update on intel_signals
  for each row execute function update_updated_at();
```

### `exa_monitors` table

Tracks which Exa Monitors exist and what GenZen Watch they belong to.

```sql
create table exa_monitors (
  id          text primary key,   -- Exa Monitor ID (from Exa API)
  watch_id    text not null,
  label       text not null,
  query       text not null,
  interval_hours int not null default 24,
  active      boolean not null default true,
  last_run    timestamptz,
  created_at  timestamptz not null default now()
);
```

---

## Webhook Function

**File:** `webhook/api/exa-webhook.ts`

Receives POST from Exa Monitors when new results arrive. Validates a shared secret header, maps Exa result fields to `intel_signals` schema, inserts to Supabase.

### Exa Monitor Webhook Payload Shape

```typescript
interface ExaMonitorPayload {
  monitorId: string;
  results: ExaResult[];
}

interface ExaResult {
  id: string;
  title: string;
  url: string;
  publishedDate: string | null;   // ISO 8601
  author: string | null;
  score: number;
  text?: string;                   // full page text, if requested
  highlights?: string[];           // extract snippets (preferred)
  highlightScores?: number[];
}
```

### Implementation

```typescript
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const secret = req.headers['x-exa-webhook-secret']
  if (secret !== process.env.EXA_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const payload: ExaMonitorPayload = req.body

  // Look up which watch_id this monitor belongs to
  const { data: monitor } = await supabase
    .from('exa_monitors')
    .select('watch_id')
    .eq('id', payload.monitorId)
    .single()

  const watchId = monitor?.watch_id ?? 'unknown'

  const rows = payload.results.map(result => ({
    monitor_id: payload.monitorId,
    watch_id: watchId,
    title: result.title,
    source_url: result.url,
    source_domain: new URL(result.url).hostname,
    published_date: result.publishedDate ?? null,
    content: result.highlights?.join('\n\n') ?? result.text ?? null,
    raw_payload: result,
    status: 'pending',
  }))

  const { error } = await supabase.from('intel_signals').insert(rows)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ inserted: rows.length })
}
```

### Environment Variables (Vercel)

```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
EXA_WEBHOOK_SECRET=     # shared secret set when creating the Exa Monitor
```

---

## Tauri App — Supabase Connection

Connect with the service-role key for the strictly local, single-user desktop app. Do not use the anon key for IntelliZen writes.

**`src/lib/supabase.ts`**
```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY
)
```

Environment variables go in `app/.env.local` (not committed).

---

## Tauri App — Exa API Connection

Direct from Tauri frontend to Exa REST API. Key stored in `app/.env.local` as `VITE_EXA_API_KEY`.

Use `exa-js` SDK or plain `fetch` to `https://api.exa.ai`.

---

## Views

Organized by the four operational layers.

---

### Layer 1 — Monitoring

#### 1. Inbox (`/inbox`)

Reads `intel_signals` where `status = 'pending'`, ordered by `created_at desc`. Groups by `watch_id`.

**Actions per signal:**
- **Save** — sets `status = 'saved'`
- **Dismiss** — sets `status = 'dismissed'`
- **Tag** — appends to `tags[]`
- **Open Investigation** — promotes signal into a new or existing case (sets `watch_id` to case ID)

Show unread count (pending signals) in tab/sidebar badge.

**Data query:**
```typescript
const { data } = await supabase
  .from('intel_signals')
  .select('*')
  .eq('status', 'pending')
  .order('created_at', { ascending: false })
```

---

#### 2. Watch Manager (`/watches`)

Reads `exa_monitors` table. Shows each Monitor with label, query, interval, active status, last run time.

**Actions:**
- **Pause / Resume** — calls Exa Monitors API `PATCH /monitors/{id}` to toggle active state, updates `exa_monitors.active`
- **Delete** — calls Exa Monitors API `DELETE /monitors/{id}`, removes row
- **Create** — form: label, query, interval (hours), watch assignment → `POST /monitors` to Exa API, insert to `exa_monitors`

**Exa Monitors API base URL:** `https://api.exa.ai`  
**Auth header:** `x-api-key: {EXA_API_KEY}`

---

### Layer 2 — Search

#### 3. OSINT Search (`/search`)

Direct Exa API search from the app. All search modes in one interface.

**Search types (tabs or dropdown):**
- **News** — `web_search_exa`, `type: "auto"`, optional date range
- **Company** — `web_search_advanced_exa`, `category: "company"`
- **People** — `web_search_advanced_exa`, `category: "people"`
- **Research** — `web_search_advanced_exa`, `category: "research paper"`
- **Personal Site** — `web_search_advanced_exa`, `category: "personal site"`
- **Financial** — `web_search_advanced_exa`, `category: "financial report"`
- **Deep Research** — Exa Research API (`/research/v1`). Input: `instructions` (natural language brief). Models: `exa-research-fast` / `exa-research` / `exa-research-pro`. Returns `researchId` for async polling, or use the MCP pair (`deep_researcher_start` / `deep_researcher_check`).
- **Company Profile** — `company_research_exa`, structured org profiling (funding stage, headcount, industry, key people). More reliable than the Company category filter for direct org targets.
- **LinkedIn / People** — `web_search_advanced_exa` with `category: "people"`, public LinkedIn profile discovery and professional background. No auth required — does not trigger profile view notifications.

**Save to inbox button** on any result — inserts to `intel_signals` with `watch_id: "manual"`.

---

### Layer 3 — Investigation

#### 4. Investigation (`/investigate`)

Structured 6-phase investigation workflow. Each phase maps to a vault artifact, has a gate condition that must be met before advancing, and has a **Run Phase** button that spawns the appropriate `claude -p` invocation.

Case files live at `~/vault/intelligence/investigations/{case-id}/`.

**Case list sidebar:** shows all active cases with current phase and gate status (green/amber/red).

**New case:** creates case folder, sets phase to 1.

---

**Phase 1 — Plan**

Scoping form before any collection starts.

Fields:
- Subject definition
- Investigation scope
- PLAN checkboxes: Proportionality, Legality, Accountability, Necessity
- Seed entities (list)
- Known hypotheses (list)

**Entity pre-profile (optional):** For each seed entity, a "Pre-profile" button runs `company_research_exa` (org entities) or `web_search_advanced_exa` with `category: "people"` (person entities) and pre-fills structured context into the plan before collection starts. Catches basic facts early so collection can be targeted rather than exploratory.

On submit: spawns `claude -p` with intelligence-research Investigate operation. Creates `{case-id}/plan.md`.

Gate: all required fields complete.

---

**Phase 2 — Collect**

Shows `intel_signals` tagged to this case. Allows importing saved signals from Inbox.

**Run Collection** button: spawns `claude -p` collection pass targeting the seed entities and scope from plan.md. Collection pass uses all available sensors:
- `deep_researcher_start` — fired first on primary investigation questions with `instructions` (natural language brief, not a query string); non-blocking, results collected at end of pass
- `company_research_exa` — structured org profiling for organizational targets
- `web_search_advanced_exa` with `category: "people"` — professional background and network for person targets
- `web_search_exa` / `web_search_advanced_exa` — news and domain-filtered results
- `deep_researcher_check` — called last to collect completed async research jobs

Fire-and-collect pattern: start deep research jobs first, run lighter sensors, collect deep results at the end.

Gate: minimum signals collected and reviewed.

---

**Phase 3 — Collate**

Displays extracted POLE entities (Person, Object, Location, Event) from `{case-id}/entities.md`.

**Run Collation** button: spawns `claude -p` entity extraction and relationship mapping.

Allows manual review/confirmation of entities before advancing.

Gate: entity register confirmed.

---

**Phase 4 — Timeline**

Renders `{case-id}/timeline.md` as a chronological event list, normalized to UTC. Flags temporal gaps and source timestamp contradictions.

**Run Timeline** button: spawns `claude -p` timeline reconstruction.

Gate: no unresolved temporal contradictions.

---

**Phase 5 — ACH**

Hypothesis × evidence matrix. Rows: hypotheses. Columns: evidence items. Cells: consistent / inconsistent / neutral.

Inconsistency Principle score displayed per hypothesis (fewest inconsistencies = most viable).

**Run ACH** button: spawns `claude -p` ACH analysis. Outputs to `{case-id}/ach.md`.

Gate: minimum 3 hypotheses, all evidence assessed.

---

**Phase 6 — Report**

Report type selector determines the `claude -p` prompt context and output format:
- **Internal sweep summary** — abbreviated, analyst-facing
- **Initial client assessment** — diagnostic framing, no methodology exposed
- **Deep case report** — full findings with evidence register, competing hypotheses, confidence levels
- **Public brief** — routed through copywriting-department before publishing

**Assemble Report** button: spawns `claude -p` with report type context. Output appears in Reports view.

---

**Shared `claude -p` invocation pattern:**
```typescript
import { Command } from '@tauri-apps/plugin-shell'

const prompt = buildPhasePrompt(caseId, phase, reportType?) 
const cmd = Command.create('claude', [
  '-p', prompt,
  '--allowedTools', 'WebSearch,WebFetch,Read,Write,mcp__exa__web_search_exa,mcp__exa__web_search_advanced_exa,mcp__exa__crawling_exa,mcp__exa__company_research_exa,mcp__exa__deep_researcher_start,mcp__exa__deep_researcher_check'
])
const output = await cmd.execute()
```

---

### Layer 4 — Reports

#### 5. Reports (`/reports`)

Displays intelligence products from `~/vault/intelligence/` as rendered Markdown. Organized by output type and audience, not just file tree.

**Sidebar organization:**
- Investigations (by case ID and phase)
- Sweep summaries (by Watch domain)
- Client assessments
- Public briefs

Uses Tauri v2 `fs` plugin to read vault directory. Vault path configured in `app/.env.local` as `VITE_VAULT_PATH`.

Markdown rendered via `react-markdown` + `remark-gfm`.

**Trigger Analysis panel** (inline, not a separate view): displays `intel_signals` where `status = 'saved'`. User selects signals, selects report type, hits **Run Analysis**. Spawns `claude -p` with report type context. New vault files appear in the sidebar on completion.

---

## Environment Variables Summary

### `app/.env.local`
```
VITE_SUPABASE_URL=
VITE_SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VITE_EXA_API_KEY=
VITE_VAULT_PATH=/Users/adamking/vault/intelligence
```

### `webhook/.env` (also set in Vercel dashboard)
```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
EXA_WEBHOOK_SECRET=
```

---

## Build Sequence

1. **Webhook first** — deploy `webhook/api/exa-webhook.ts` to Vercel, set env vars, get public URL
2. **Supabase migrations** — run `intel_signals` and `exa_monitors` table SQL above
3. **Create first Exa Monitor** — use Exa API directly (curl or Postman) with the webhook URL + secret, targeting an existing Watch query. Confirm signals land in `intel_signals`.
4. **Tauri scaffold** — `pnpm create tauri-app` inside `app/`, configure Vite + React + TypeScript

**Layer 1 — Monitoring:**

5. **Inbox** — read from Supabase, validates the full data path works
6. **Watch Manager** — Exa Monitors API CRUD

**Layer 2 — Search:**

7. **OSINT Search** — direct Exa API integration, all category modes

**Layer 3 — Investigation:**

8. **Investigation scaffold** — case list sidebar, case creation, phase stepper UI (static, no claude -p yet)
9. **Phase 1 (Plan)** — scoping form → vault file write via claude -p
10. **Phases 2–5** — collect, collate, timeline, ACH — each as a claude -p invocation with phase context
11. **Phase 6 (Report)** — report type selector, final assembly trigger

**Layer 4 — Reports:**

12. **Reports view** — Tauri fs plugin, vault directory read, Markdown render, organized by output type
13. **Trigger Analysis panel** — inline signal selection + report type + claude -p spawn

---

## Tauri v2 Plugins Required

Add to `Cargo.toml` / install via `tauri add`:
- `tauri-plugin-shell` — for `claude -p` invocation
- `tauri-plugin-fs` — for vault file reading

---

## Notes for Engineer

- The Exa API key lives only in the frontend `.env.local` and is never committed. This is a personal-use app with no auth layer.
- The `claude` CLI must be installed and in PATH on the user's machine for Trigger Analysis to work.
- Vault path is hardcoded in env initially — can add a Settings view later to configure it.
- The webhook URL must be set in Exa Monitor config (done via Exa API when creating a Monitor). Exa sends `x-exa-webhook-secret` header with each delivery — validate it in the function.
- `intel_signals.raw_payload` preserves the full Exa result as JSONB for future use without schema migrations.
