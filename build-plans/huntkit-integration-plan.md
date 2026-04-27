# Huntkit Integration — Plan

Reference doc for selectively integrating components of [Huntkit](https://github.com/assafkip/huntkit) into InteliZen. Not yet scheduled.

## What Huntkit is

A Claude Code plugin that bundles three things: (1) a set of Python MCP servers exposing OSINT and threat-intel APIs, (2) a Bash-based evidence capture pipeline (Wayback + archive.today + Chrome PDF + SHA-256), and (3) Claude Code skills for structured analysis (ACH, red-team, premortem). MIT licensed; the `structured-analysis` skill is Apache 2.0 from Blevene.

## Companion doc

`osint-workflow-analysis.md` already covers ACH, Admiralty 6×6, POLE, operational planning gates, and the broader Claude Sleuth methodology. **This plan does not duplicate that work.** Where Huntkit overlaps with that doc (ACH framework, evidence preservation concept), the implementation patterns described here supersede the speculative ones there.

## Goal

Pull the four pieces of Huntkit that materially upgrade InteliZen's Collect and Analyse phases:

1. **Threat-intel + infrastructure MCP tools** — surface live data for domains, IPs, certificates, malicious infrastructure
2. **Evidence capture pipeline** — automated Wayback + archive.today snapshot + SHA-256 hashing for every URL that lands in `vault_files`
3. **EV-NNNN evidence citation system** — stable evidence IDs that reports cite by reference, with reliability grades
4. **ACH analytical scaffold** — port the Apache 2.0 structured-analysis prompts into the Analyse-phase prompt builder

Skip Huntkit's CLI workflow orchestration — InteliZen already has a better GUI-native version of that.

## Core principle

**Port, don't run alongside.** Huntkit's MCP servers are Python (`fastmcp`); InteliZen's MCP server is TypeScript ([mcp-server/src/index.ts](mcp-server/src/index.ts)). The tools themselves are thin HTTP wrappers around public APIs — porting to TypeScript is shorter than orchestrating a second runtime. Bash evidence-capture scripts get the same treatment: re-implement as a TypeScript service in `src/lib/evidence.ts` that uses Tauri's shell + fs plugins.

This keeps the InteliZen surface area single-stack and avoids a Python dependency on the user's machine.

## Reuse audit (do this before any new component work)

| Huntkit element | Reuse / port from | Build new |
|---|---|---|
| Evidence MCP tools | InteliZen MCP server pattern in [mcp-server/src/index.ts](mcp-server/src/index.ts) — same handler shape | New tool handlers, one per source |
| Wayback snapshot | Tauri fetch via `@tauri-apps/plugin-http` (already permitted to outbound) | Snapshot service wrapper, dedup logic |
| SHA-256 hashing | Web Crypto API (`crypto.subtle.digest`) — already available | Hash + persist call |
| EV-NNNN IDs | `vault_files` table — has `case_id` + `kind` + path | New `evidence_id` column + sequence generator |
| ACH prompt scaffold | `buildPhasePrompt` in `src/lib/shell.ts` (referenced from Investigation flow) | ACH section template, evidence-citation injection |
| UI surfaces | Investigation Analyse tab; vault_files row component | Evidence card with badges (snapshot status, hash) |

**Briefing rule:** before porting any Huntkit MCP tool, grep `mcp-server/src/index.ts` for the closest existing handler and match its shape exactly. Don't introduce a new tool registration pattern.

---

## Component 1 — Threat-intel + infrastructure MCP tools

### Tools to port

The Huntkit tools that are genuinely additive to InteliZen (not already covered by Exa or the existing MCP server):

| Tool | Source | API key required | What it adds |
|---|---|---|---|
| `domain_whois` | `whois` MCP | None (RDAP via `rdap.org`) | Registrant, registrar, creation/expiry dates |
| `domain_dns` | `dns` MCP | None (DoH to Cloudflare 1.1.1.1) | A/AAAA/MX/TXT/NS records |
| `cert_transparency` | `crtsh` MCP | None (`crt.sh` JSON endpoint) | All TLS certs ever issued for a domain — surfaces subdomains and historical infra |
| `wayback_snapshots` | `wayback` MCP | None (`web.archive.org` API) | List of available snapshots for a URL |
| `virustotal_lookup` | `virustotal` MCP | VT free tier (4 req/min) | Reputation on domain/IP/URL/file hash |
| `urlhaus_lookup` | `urlhaus` MCP | None (abuse.ch open API) | Known-malicious URL database |
| `threatfox_lookup` | `threatfox` MCP | None (abuse.ch open API) | IOC database — IPs, domains, hashes tied to active threats |

### What to skip

- **Reverse DNS** — InteliZen's threat model rarely benefits from PTR lookups; skip unless a use case surfaces.
- **Apify scrapers, Bright Data, Tavily, Parallel AI** — all paid/optional in Huntkit; InteliZen already has Exa for web search. Don't fragment.
- **tgspyder Telegram addon** — separate scope; revisit alongside the SOCMINT pipeline if/when it lands.

### Where they get registered

All seven tools land in [mcp-server/src/index.ts](mcp-server/src/index.ts) using the same `ListToolsRequestSchema` / `CallToolRequestSchema` pattern as existing tools. Group them under a `osint_*` or `infra_*` prefix to keep them visually segregated from the data-layer tools (`list_projects`, `create_investigation`, etc.).

### Where they get used in-app

The Search page is the highest-leverage user-facing surface for these tools — they're all single-shot, results-inline lookups, which is exactly the Search pattern. Two parallel surfaces (one primary, one backup) plus background usage in existing flows.

#### Primary surface — Search page, query-shape auto-routing

Search currently has explicit mode tabs (Web, News, Company, People, Research Papers, Financial Reports, Deep Research). Adding an eighth tab for "Infrastructure" would force the user to pre-classify their own query — wrong shape for the problem.

Better pattern: **detect query shape on input** and surface an **Infrastructure panel inline alongside the Web/News results** when the input parses as a domain, IPv4/IPv6, URL, or SHA-256 hash. No mode choice required; the user types `evilcorp.example.com` and gets WHOIS + DNS + crt.sh + Wayback + VT/URLhaus reputation as a stacked panel next to the Exa hits.

Implementation shape:
- `src/lib/queryShape.ts` — pure function returning `{ kind: 'domain' | 'ipv4' | 'ipv6' | 'url' | 'hash' | 'freetext', value: string }`. Trivial regexes; no LLM call.
- `src/components/search/InfrastructurePanel.tsx` — fires the relevant MCP tool calls in parallel via TanStack Query, renders results in a card stack (one card per source). Each card shows raw payload + a copy-to-clipboard action.
- `src/views/Search.tsx` — when query shape is non-`freetext`, mount `InfrastructurePanel` to the right of (or above) the existing Exa results column. When shape is `freetext`, panel is absent.

**Quick Recon → Investigation promotion.** The Infrastructure panel includes a single "Promote to Investigation" action that creates a new investigation pre-populated with the seed domain/IP, drafts the Phase 1 Brief from the WHOIS data, and pins the lookup results as initial vault artifacts. This is the bridge between Search (discovery) and Investigation (deep work) that InteliZen doesn't currently have an explicit pattern for — and it's the move that makes the Search-page integration meaningfully more than a lookup gadget.

#### Backup surface — global Cmd+K quick lookup

If query-shape auto-routing turns out to be flaky in real use (false positives on freetext that happens to look like a domain, layout pressure on the Search page, etc.) or if Adam wants infra lookups available from anywhere in the app — not just after navigating to Search — the alternative integration surface is a **global Cmd+K command palette** with a "Lookup" mode.

Shape:
- Cmd+K from any view opens a floating palette
- User types or pastes a domain/IP/URL/hash
- Palette runs the same parallel MCP calls and renders results in the same `InfrastructurePanel` component
- Same "Promote to Investigation" action surfaces at the bottom

Why this is the second-best rather than the first: it's a separate UI surface to maintain, requires keyboard discoverability (less obvious for new use), and doesn't visually colocate infra results with Exa results — which is the actual win of the Search-page version. But it's strictly additive, doesn't conflict with the primary surface, and is the right answer if Search-page wiring proves wrong.

Build the primary first. The component (`InfrastructurePanel`) and the parallel-fetch logic are the same in both surfaces, so retrofitting Cmd+K later is cheap.

#### Background usage (no new UI)

- **Investigation Collect phase** — Claude calls these tools directly during `claude -p` to enrich seed entities. Just expose them in `DEFAULT_TOOLS` in [src/lib/shell.ts](src/lib/shell.ts).
- **Inbox signal triage** — VirusTotal / URLhaus / ThreatFox auto-lookup on incoming signal URLs to flag malicious sources. Cached in `intel_signals.raw_payload`. Surfaces as a small badge on the signal card.

### Schema changes

None required for the tools themselves — they're transient lookups. Cached responses can land in `raw_payload` alongside Exa data.

---

## Component 2 — Evidence capture pipeline

### What it does

For every URL that gets attached to an investigation or saved to vault, automatically:

1. Submit to Wayback Machine for snapshot (POST to `web.archive.org/save/<url>`)
2. Submit to archive.today as a redundant snapshot
3. Render a Chrome PDF locally via Tauri webview screenshot (or skip if URL-only)
4. Compute SHA-256 of the rendered HTML / PDF
5. Persist all three artifact URLs + hash + capture timestamp into `vault_files`

This is the "chain of custody" piece that makes evidence legally defensible. Huntkit does this in Bash + curl; InteliZen does it in TypeScript.

### Where it lives

New file: `src/lib/evidence.ts`. Exports:

```typescript
captureEvidence(url: string, caseId: string): Promise<EvidenceArtifact>
verifyEvidence(evidenceId: string): Promise<{ valid: boolean; mismatches: string[] }>
```

`captureEvidence` is idempotent on `(url, caseId)` — calling it twice doesn't double-archive.

### Schema changes

Add columns to `vault_files`:

```sql
alter table vault_files
  add column evidence_id text,
  add column wayback_url text,
  add column archive_today_url text,
  add column content_sha256 text,
  add column captured_at timestamptz;

create unique index vault_files_evidence_id_uidx
  on vault_files(evidence_id) where evidence_id is not null;
```

Migration goes in `supabase/migrations/` as `add_evidence_capture_fields.sql` — additive only, per the project rule.

### Hooking into existing flows

- **Investigation Collect phase** — when Claude writes a new artifact via Write tool, the post-write step in [src/views/Investigation.tsx](src/views/Investigation.tsx) calls `captureEvidence` on every URL in the artifact. Already has the `vault_files` insert hook; just extend it.
- **Inbox signal pin** — when a user pins a signal to an investigation, capture its URL. New action on the signal card.
- **Manual "preserve evidence" action** — context menu item on any vault file row.

### Failure modes

- Wayback / archive.today rate-limit or 5xx — record attempt timestamp, retry with backoff. Don't block the user; surface a "snapshot pending" badge.
- URL is behind auth or returns 4xx — capture what we can (DNS / WHOIS), mark snapshot status as `unavailable`. The hash is still meaningful for the user-facing artifact.

---

## Component 3 — EV-NNNN evidence citation system

### What it does

Every preserved artifact gets a stable, human-readable ID like `EV-0042`. Reports generated by Claude cite by ID:

> The principal's London office address (EV-0017) was registered to a shell company (EV-0019) two weeks before the asset transfer (EV-0023).

The ID system makes reports auditable and lets Claude reason about evidence by reference rather than re-quoting.

### How it gets generated

Per-case sequence. New table:

```sql
create table evidence_sequences (
  case_id uuid primary key references investigations(id) on delete cascade,
  next_n integer not null default 1
);
```

`captureEvidence` allocates `EV-{padN(next_n, 4)}` atomically (Postgres `update ... returning`). Stored on `vault_files.evidence_id`.

### Reliability grades — pragmatic version

Huntkit uses A–F grades (mirroring NATO Admiralty). InteliZen already has SIFT verification in the analytical-rigor skill, which is structured differently. **Don't graft Admiralty on top of SIFT** — the result is two parallel grading systems that confuse the user.

Pragmatic compromise: a single `reliability` enum on `vault_files` with four values: `primary`, `corroborated`, `single-source`, `unverified`. These are the four states that actually matter for GenZen reports. Map Admiralty grades to this on import if/when the broader Sleuth-style methodology lands per `osint-workflow-analysis.md`.

```sql
alter table vault_files
  add column reliability text
    check (reliability in ('primary','corroborated','single-source','unverified'));
```

### Where it surfaces in UI

- Vault file row shows the EV-ID as a monospace badge
- Evidence card in Investigation Collect shows snapshot status + reliability + hash (truncated)
- Reports view: when Claude generates a report citing `EV-0042`, render that as a clickable chip linking to the vault file

### Where it surfaces in prompts

`buildPhasePrompt` for the Analyse phase and `buildReportPrompt` both get a new section listing all `vault_files` for the case with their EV-IDs and reliability. Claude is instructed to cite by ID and never invent one.

This is the single largest leverage point in the whole plan — once Claude is citing stable IDs, every downstream artifact (report, brief, debrief) becomes verifiable rather than impressionistic.

---

## Component 4 — ACH analytical scaffold

### What's there now

The Analyse phase in [src/views/Investigation.tsx](src/views/Investigation.tsx) builds a prompt via `buildPhasePrompt` and runs `claude -p`. The prompt currently asks for analysis but doesn't structure it.

### What Huntkit adds

The `structured-analysis` skill (Apache 2.0, sourced from Blevene/structured-analysis-skill) provides three concrete prompt templates:

1. **ACH matrix** — competing hypotheses scored against evidence, using the Inconsistency Principle
2. **Red-team challenge** — adversarial review of the leading hypothesis
3. **Premortem** — "assume this analysis is wrong; what was the most likely failure?"

These are prompts, not code. The port is mechanical: copy the prompt scaffolding into `buildPhasePrompt` (or a sibling builder `buildAchPrompt`) and let the user pick which lens to run from the Analyse tab.

### Use-case selector

The Investigation flow already has Scoping / Post / Sit Rep selectors. Add **ACH** / **Red Team** / **Premortem** as additional Analyse-phase selectors. Each runs its own prompt, writes its own artifact (`ach.md`, `redteam.md`, `premortem.md`) into the case folder.

### What gets cited

Every claim Claude makes in these analyses has to cite an `EV-NNNN` from Component 3. This is the integration point that makes the whole plan more than the sum of its parts — structured analysis citing stable evidence IDs is the difference between a defensible product and a creative-writing exercise.

### License attribution

The Apache 2.0 attribution from Blevene's repo gets preserved in a `LICENSES/structured-analysis.md` file. One-time bookkeeping.

---

## Build sequence

Each block is a focused unit; treat them as independent and pick up whichever the moment calls for. Build in this order so each block's output is usable on its own:

**Block 1 — MCP infrastructure tools + Search wiring (no schema changes)**
- Port WHOIS, DNS, crt.sh, Wayback into `mcp-server/src/index.ts`
- Add to `DEFAULT_TOOLS` in `src/lib/shell.ts`
- Build `src/lib/queryShape.ts` (regex-based query classifier)
- Build `src/components/search/InfrastructurePanel.tsx` (parallel TanStack Query fetches, card-stack rendering)
- Wire panel into `src/views/Search.tsx` for non-freetext queries
- Add "Promote to Investigation" action with auto-Brief from WHOIS data
- Smoke-test in both Search UI and Investigation phase invocations
- Ship.

Cmd+K backup surface deferred — primary surface is the validation point. Add only if real use exposes friction with auto-routing.

**Block 2 — Threat-intel tools (single API key)**
- Port URLhaus, ThreatFox (no key), VirusTotal (free-tier key — add to `.env.local`)
- Wire into Inbox signal triage as a background lookup on new signals
- Cache results in `intel_signals.raw_payload`

**Block 3 — Evidence capture pipeline**
- Migration: `add_evidence_capture_fields.sql`
- Build `src/lib/evidence.ts` with `captureEvidence` + `verifyEvidence`
- Hook into the post-Write step in Investigation Collect phase
- Add manual "preserve" action to vault file rows
- Surface snapshot status badges

**Block 4 — EV-NNNN system + Analyse-phase citation**
- Migration: `evidence_sequences` table + `reliability` column
- Sequence generator in `src/lib/evidence.ts`
- Update `buildPhasePrompt` and `buildReportPrompt` to inject the case's evidence registry
- Render EV-ID badges in vault file rows and report views

**Block 5 — ACH / Red Team / Premortem scaffolds**
- Add Analyse-phase selectors
- Port prompt templates from structured-analysis skill into `buildAchPrompt` etc.
- Write `LICENSES/structured-analysis.md` attribution

Blocks 1 + 2 are usable on their own. Block 3 is usable on its own. Blocks 4 + 5 should ship together — Block 5 depends on 4's evidence-registry injection to be useful.

## Out of scope (explicit non-goals)

- Apify, Bright Data, Tavily, Parallel AI integrations — Exa covers it
- Telegram (tgspyder) — separate SOCMINT scope
- Huntkit's Bash orchestration scripts — InteliZen has a GUI-native flow
- Admiralty 6×6 dual grading — collapsed to a single `reliability` enum; revisit only if the broader Sleuth methodology lands
- Full POLE entity model — covered in `osint-workflow-analysis.md`, not this plan

## Open questions

1. **VirusTotal key handling** — store in `.env.local` like the existing keys, or move to a per-user settings UI? Default: `.env.local` for now, settings UI when there are 3+ user-supplied keys.
2. **Evidence-capture latency** — Wayback submission can take 10–30s. Run in the background with a status badge, or block the Collect-phase completion? Default: background.
3. **Reliability grading UX** — auto-set on capture (heuristic from source domain reputation), or require user input? Default: auto-set with override; surface override on the evidence card.
4. **Cross-case evidence reuse** — if the same URL appears in two investigations, do we share one EV-ID or generate per-case IDs? Default: per-case (simpler, matches Huntkit's model). Revisit if cases start meaningfully overlapping.

## Files this plan will touch

- `mcp-server/src/index.ts` — add 7 tool handlers
- `src/lib/shell.ts` — extend `DEFAULT_TOOLS`, add `buildAchPrompt`
- `src/lib/queryShape.ts` — new (query classifier)
- `src/lib/evidence.ts` — new
- `src/components/search/InfrastructurePanel.tsx` — new
- `src/views/Search.tsx` — mount InfrastructurePanel + Promote action
- `src/views/Investigation.tsx` — Analyse-phase selectors, evidence card rendering
- `src/views/Inbox.tsx` — threat-intel auto-lookup on new signals
- `src/views/Reports.tsx` — EV-ID chip rendering
- `supabase/migrations/add_evidence_capture_fields.sql` — new
- `supabase/migrations/add_evidence_sequences.sql` — new
- `LICENSES/structured-analysis.md` — new (Apache 2.0 attribution)

## Decision threshold

If, after Block 1, the WHOIS / DNS / crt.sh tools aren't producing material lift in real Investigation runs, stop. The remaining blocks all depend on the assumption that infrastructure-level signals are useful for GenZen's case mix. Validate before building deeper.
