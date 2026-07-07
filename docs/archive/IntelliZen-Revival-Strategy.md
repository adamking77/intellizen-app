# IntelliZen Revival Strategy

## Context

Andrej Karpathy released [autoresearch](https://github.com/karpathy/autoresearch) — a framework for autonomous AI experimentation using constraint-driven loops. Adam asked how this pattern could apply to GenZen Brain and the abandoned [IntelliZen app](https://github.com/adamking77/intelli-zen).

IntelliZen is a production-grade intelligence curation platform (React/Vite/TypeScript, Supabase, Vercel) built on Lovable. It aged out architecturally while the AI COO infrastructure was being built. The core intelligence tradecraft inside it remains highly valuable.

[Signex](https://github.com/zhiyuzi/Signex) (reviewed 2026-03-11) validated the "Claude Code IS the runtime" architecture — no app wrapper, behavior lives entirely in CLAUDE.md + skills. Its Watch → Sensor → Lens → Report → Feedback pipeline provides clean vocabulary and structural patterns worth adopting, even though its implementation targets tech monitoring (Hacker News, GitHub Trending, Product Hunt) with no analytical rigor for intelligence work. What's stolen below: the pipeline taxonomy, per-watch feedback loops, sensor/lens extensibility model, and deduplication-as-first-class-concern.

[claude-skills-journalism](https://github.com/jamditis/claude-skills-journalism) (reviewed 2026-03-12) by Joe Amditis — a library of 37 skills and 14 hooks built for investigative journalism and research. Provides the **analytical rigor and validation layers** that the other reference architectures lack. What's stolen below: source verification framework (SIFT method), evidence hierarchy for fact-checking, social media intelligence (account authenticity scoring, coordination detection, network mapping), entity extraction and knowledge graph patterns, evidence preservation protocols (chain-of-custody, legal-grade archiving), and hook-based quality enforcement that can make the Intelligence Analysis Protocol automatic rather than aspirational.

---

## What Karpathy Built (The Pattern)

AutoResearch gives an AI agent a training script, a constraint document (`program.md`), and a fixed time budget. The agent loops autonomously: modify code, run experiment, log results, keep improvements, revert failures. ~100 experiments overnight, zero human intervention.

Key design choices:

- **One modifiable file** — keeps changes reviewable
- **Fixed time budget** — makes results comparable
- **Single metric** — clear optimization target
- **Structured logging** — every run tracked in a results file
- **"Never stop" directive** — runs until killed

The product is narrow (LLM training optimization). The pattern underneath is universal: **constraint-driven autonomous agent loops with structured logging and self-correction.**

---

## What IntelliZen Actually Is

Not a prototype. A fully built intelligence platform with two major pipelines:

### Latest Intel Pipeline

- Customizable domain-specific search templates (**Currently:** family offices, SE Asia business/crime, spiritual exploitation, crypto fraud, macro political, development projects, social/cultural dynamics)
- Perplexity "sonar-pro" for web search, Claude for structured analysis *(Perplexity replaced by Exa — see migration note below)*
- Batch processing (5 articles in parallel), automatic deduplication
- Curation scoring: source quality (0-100%), information reliability (0-100%), protocol relevance (0-100%)
- Full metrics dashboard: API calls, tokens, response times, estimated costs

### Cultural Intelligence Pipeline

- 3-phase workflow: Exa research, 4-domain Claude Bayesian analysis (Identity, Norms, Values, Perception), strategic brief synthesis
- Progress tracking, markdown export, investigation history
- Bayesian rigor: probability ranges, competing hypotheses, source credibility weighting

### Three Custom Claude Skills with Deterministic Validators

1. **Intelligence JSON output validation** — enforces 6 required sections, 3 numeric scores (~200 tokens saved/article)
2. **Cultural intelligence domain analysis** — enforces probability ranges, competing hypotheses, source credibility (~2,600 tokens saved/investigation)
3. **Strategic intelligence synthesis** — enforces Bayesian aggregation, confidence levels, timeline-based recommendations

Each skill has Python validation scripts that enforce structure deterministically.

### Infrastructure

- React/Vite/TypeScript frontend
- Supabase backend (2 tables: `analysis_jobs` + `api_calls`)
- Vercel serverless API proxies for Claude and Perplexity
- Dual-layer caching (localStorage + Supabase)
- Demo mode, settings management
- Deployed at intelli-zen.vercel.app

---

## Why IntelliZen Aged Out

The app tried to be both the **research engine** and the **presentation layer**. When Adam wanted to improve research pipelines, he had to touch React components. When he wanted to improve the UI, he had to work around API integration code. Two concerns fused into one codebase, both suffering.

Meanwhile, the infrastructure that now exists didn't exist when IntelliZen was built:

- Claude Code can execute those pipelines natively (no app needed)
- The scheduler skill can trigger them autonomously (no manual "run" button)
- The vault + Supabase + Brain can store and search output (no separate database)
- WebSearch replaces Perplexity API calls (no proxy layer, no extra cost)

---

## The Recommendation: Split the Concerns

### Layer 1: Intelligence Engine (Claude Code + Vault + Brain)

This is where Karpathy's pattern lives. Skills + scheduler + autonomous loops. Runs headless. No frontend. No Vercel. No API proxies.

**Core concepts (adapted from Signex pipeline taxonomy):**

- **Watches** — persistent monitoring declarations. Each Watch defines a domain (e.g., "SE Asia spiritual exploitation"), the Sensors to use, analysis Lenses to apply, relevance criteria, and escalation thresholds. Watches replace IntelliZen's "search templates" with a richer abstraction that carries context across runs.
- **Sensors** — modular data collection skills. Each Sensor knows how to pull from one source type. Active Sensors: **Exa Search** (news + general, auto/fast mode, highlights-optimized), **Exa Category** (company, people, research paper, personal site, financial report — targeted domain searches with date windows), **Exa Company Research** (`company_research_exa` — structured org profiling: funding, headcount, industry, key people — more reliable than category search for direct org targets), **Exa People Search** (`people_search_exa` — public LinkedIn profile discovery and professional background; no auth, no profile view notifications), **Exa Async Deep Research** (`deep_researcher_start`/`deep_researcher_check` MCP pair — non-blocking fire-and-collect for parallel investigation tracks), **Exa Deep Research** (REST API, blocking, `deep` and `deep-reasoning` modes, supports structured `outputSchema` extraction), RSS, OSINT/court records, regulatory filings, web scraping (WebFetch/Playwright cascade). New Sensors can be created via the skill-creator without touching existing ones.
- **Lenses** — analytical frameworks applied to collected data. Not presentation formats (Signex's mistake) but actual intelligence methodologies: Bayesian threat analysis, competing hypotheses, control-architecture mapping, timeline reconstruction, anomaly detection. Each Lens enforces its own output structure via deterministic validators. Journalism skills repo contributes additional Lens methodologies: **source verification** (SIFT method: Stop, Investigate, Find better coverage, Trace claims), **fact-check workflow** (evidence hierarchy ranking source types, graduated confidence ratings), and **social media intelligence** (account authenticity scoring, coordinated inauthentic behavior detection, narrative propagation tracking).
- **Deduplication** — first-class concern at the storage layer, not an afterthought. Items deduplicated across Sensors and across Watches before analysis, preventing redundant processing and inflated confidence from seeing the same source through multiple paths.
- **Source Verification Gate** (from journalism skills) — structured credibility assessment applied to collected items *before* they enter Lens analysis. SIFT method (Stop, Investigate, Find better coverage, Trace claims) + verification trail template documenting each step, corroborating/contradicting sources, and confidence assessment. Prevents low-quality sources from inflating analysis confidence.
- **Evidence Preservation** (from journalism skills) — chain-of-custody documentation, SHA-256 content hashing, multi-archive redundancy (Wayback Machine, Archive.today, Perma.cc for court-admissible records). Critical for counter-exploitation work where evidence must hold up legally.
- **Entity Extraction** (from journalism skills) — structured entity identification (Person, Organization, Event, Location) with relationship mapping (Mentions, Criticizes, Cites, Controls, Funds). Outputs feed Brain's vector store, enabling knowledge graph queries across the entire intelligence corpus. Turns flat analysis into connected intelligence.

**What it does:**

- Scheduled sweeps across all 7 domains — daily or weekly, fires whether Adam is awake or not
- Iterative research loops (Karpathy's contribution) — not single-shot. Run sweep, score results, identify coverage gaps, run targeted follow-ups, re-score, repeat until diminishing returns
- A `program.md` defines constraints per Watch: domains to cover, minimum source quality thresholds, when to stop, what to escalate
- Structured output to vault — every intelligence product lands as markdown with frontmatter metadata (domain, region, confidence scores, sources, date range)
- Brain vectorizes everything — pattern recognition accumulates across hundreds of research cycles
- Validation skills port over — the three Python validators enforce output quality without a UI
- Cultural intel triggered on demand per case, output goes to case folders
- Results log builds over time — pattern recognition across runs, not just within a single session
- **Per-Watch feedback memory** (from Signex) — each Watch maintains a memory file recording what was useful, what was noise, and how scoring should adjust. Feedback from one cycle calibrates the next. Over time, each Watch learns what matters for its domain without manual tuning.
- **Cross-Watch pattern recognition** (beyond Signex) — Brain's vector search enables something Signex can't do: detecting that a signal appearing in the "crypto fraud" Watch connects to an actor surfaced in the "SE Asia spiritual exploitation" Watch. The vault is one searchable corpus, not siloed per-Watch databases.
- **Hook-based analytical rigor** (from journalism skills) — PostToolUse hooks that fire after every Write/Edit to enforce the Intelligence Analysis Protocol automatically: flag unattributed claims, prompt for competing hypotheses, verify source credibility is weighted explicitly, ensure uncertainty is marked. Makes analytical discipline structural rather than aspirational.

**What changes vs. IntelliZen:**

| IntelliZen App                                     | Claude Code + Vault                                |
| -------------------------------------------------- | -------------------------------------------------- |
| Perplexity API + Claude API via serverless proxies | Exa MCP + Claude natively, no proxy layer          |
| React UI to view results                           | Results in vault as markdown, searchable via Brain |
| Supabase tables for job/call tracking              | Vault metadata + Brain vector search               |
| Settings page for API keys                         | Already configured in environment                  |
| Manual "run" button                                | Scheduler fires autonomously                       |
| 3 custom skills with validators                    | Skills port directly to ~/.claude/skills/          |
| Cost: Vercel + Supabase + Perplexity + Claude      | Cost: Exa (true PAYG) + Claude                     |

### Layer 2: GenZen Intelligence Hub (Public-Facing)

The badass interface. But it's a **consumer** of intelligence, not the producer.

**What it does:**

- Public blog-style reports on the GenZen Solutions site — curated from vault intelligence products, run through the copywriting department before publishing
- Interactive world map — exploitation schemes by region, updated as new intelligence comes in
- Case-level dashboards (private/client-facing) — compiled reports, timeline views, threat maps, confidence trends
- Feeds from the vault via Supabase — the site reads from Brain's database, the research engine writes to it. Clean separation.

Could be a section of the GenZen Solutions site or a standalone app. Either way, it's a read layer on top of intelligence that's already been produced and validated.

**Why the split matters:**

- Improve the research? Edit a skill or tweak a `program.md`. No frontend code touched.
- Improve the presentation? Work on the site. The data's already in Supabase.
- The map and blog update themselves as the engine deposits new intelligence.

---

## The World Map

A live, explorable map of active exploitation schemes by region. Spiritual exploitation in SE Asia, investment fraud corridors, cult activity clusters, legacy hijacking patterns.

This is a category-defining content asset. It does multiple things at once:

- Demonstrates GenZen's pattern recognition capability without giving away methodology
- Gives advisors something concrete to show their principals ("look, this is a known pattern")
- Drives organic traffic from people researching specific schemes or regions
- Positions GenZen as the intelligence authority in the space
- Updates continuously from the research engine — alive, not a static report

Nobody in GenZen's space is doing this.

---

## Build Sequence

### Phase 1: Intelligence Research Skill

Port IntelliZen's pipelines + validators into `~/.claude/skills/intelligence-research/`. Wire to scheduler for automated sweeps. This replaces the IntelliZen app's engine entirely.

**What ports over:**

- 7 search templates → become **Watches** with persistent memory files
- Curation criteria (include/exclude scoring) → per-Watch relevance thresholds
- 3-axis ranking system (source quality, reliability, protocol relevance)
- Strategic analysis framework → **Lenses** with deterministic validators
- Cultural intelligence 3-phase pipeline → dedicated Lens
- 3 Python validation scripts → enforce Lens output structure
- **New: Sensor architecture** — modular, extensible data collection skills (WebSearch, RSS, OSINT feeds). Each Sensor is a standalone skill, addable via skill-creator without modifying existing code.
- **New: Deduplication layer** — content fingerprinting before storage to prevent redundant analysis across Sensors and Watches
- **New: Feedback loop** — per-Watch memory files that calibrate scoring based on what proved useful vs. noise in previous cycles
- **New: Source verification gate** (from journalism skills) — SIFT method + verification trail template applied between collection and analysis. Structured credibility assessment with graduated confidence ratings (Verified true → Likely true → Unverified → Likely false → Verified false)
- **New: Evidence preservation protocol** (from journalism skills) — SHA-256 hashing, multi-archive redundancy, chain-of-custody documentation for legal-grade evidence
- **New: Entity extraction layer** (from journalism skills) — Person/Organization/Event/Location identification with relationship mapping, feeding Brain's knowledge graph
- **New: Analytical rigor hooks** (from journalism skills) — PostToolUse hooks enforcing Intelligence Analysis Protocol (source attribution, competing hypotheses, uncertainty marking) on all intelligence output

### Phase 2: Vault Intelligence Structure

Create `vault/intelligence/` with subdirectories by domain. Standardize frontmatter schema for all intelligence products. Auto-sync to Brain via existing vault-watch.

### Phase 3: World Map Prototype

Even a static version on the GenZen Solutions site showing known exploitation patterns by region would be powerful. The live-updating version comes once the engine is feeding it data.

### Phase 4: Report Publishing Workflow

Intelligence products from vault, through copywriting department, published to site. Could be a skill that takes a vault intelligence doc and produces a public-ready version.

---

## Search Provider: Exa (Migrated 2026-04-07)

Perplexity raised their minimum deposit to $50, triggering a provider review. **Exa** selected over Tavily (Tavily acquired by Nebius for $275M in Feb 2026 — vendor independence risk). Exa offers true PAYG, independent ownership, and superior semantic search quality.

**Exa MCP configuration** (vault project):
```
https://mcp.exa.ai/mcp?exaApiKey=KEY&tools=web_search_exa,web_search_advanced_exa,get_code_context_exa,crawling_exa,company_research_exa,deep_researcher_start,deep_researcher_check
```
- `web_search_exa` — default search, auto/fast mode, highlights content extraction
- `web_search_advanced_exa` — opt-in category search (company, people, research paper, personal site, financial report); do NOT use `news` category, plain queries handle news natively
- `company_research_exa` — structured company profiling (funding stage, headcount, industry, key people); more reliable than category-filtered web search for org targets
- `web_search_advanced_exa` with `category: "people"` — public LinkedIn profile discovery and professional background search (`linkedin_search_exa` and `people_search_exa` are both deprecated; this is the correct tool)
- `deep_researcher_start` / `deep_researcher_check` — async multi-source deep research MCP pair; fire-and-collect pattern for parallel investigation tracks (start jobs first, run lighter sensors, collect results at end)
- **Exa Monitors** — scheduled recurring searches with semantic deduplication across 5-run rolling window; webhook delivery to any HTTPS endpoint; minimum 1h interval; supports `outputSchema` for structured JSON output

**Passive collection architecture** (designed 2026-04-07, not yet built):
Exa Monitors → Vercel webhook (public HTTPS endpoint, ~30 lines) → Supabase `intel_signals` table (raw signal inbox: status pending/saved/dismissed, tagged by Watch + Monitor ID) → Personal Tauri app reads the inbox, triggers Claude Code analysis pipelines on demand.

This separates the always-on collection layer (Exa Monitors + Supabase) from the analytical layer (Claude Code + skills), with the personal app as the triage interface between them.

---

## Personal Layer: IntelliZen Tauri App (Planned)

Personal desktop app for the full GenZen intelligence workflow. Claude Code is the analytical engine. The app is the interface — managing what gets collected, initiating investigations, triggering `claude -p` at each phase, and organizing outputs by type and audience.

**Four operational layers with five views:**

**Layer 1 — Monitoring**
- **Intel Inbox** — reads `intel_signals`, grouped by Watch domain. Save / Tag / Dismiss / Promote to investigation. Unread badge.
- **Watch Manager** — create/pause/delete Exa Monitors, view Watch health + last run, edit query angles.

**Layer 2 — Search**
- **OSINT Search** — all Exa modes: news, company (category filter — no date/excludeDomain filters), people (category filter — no domain or date filters, use query string), research paper, personal site, financial report, **Company Profile** (`company_research_exa` — structured org data), **People** (`web_search_advanced_exa` category:people — public LinkedIn data, no auth), deep research (async MCP pair `deep_researcher_start`/`check` with `instructions` + model tier, or blocking REST).

**Layer 3 — Investigation**
- **Investigation** — 6-phase structured OSINT workflow: Plan → Collect → Collate → Timeline → ACH → Report. Each phase maps to a vault artifact (`plan.md`, `entities.md`, `timeline.md`, `ach.md`). Gate enforcement: phase must complete before advancing. Each phase spawns `claude -p` against the intelligence-research skill's Investigate operation.

**Layer 4 — Reports**
- **Reports** — vault intelligence products rendered as Markdown, organized by output type: internal sweep summaries, client assessments, deep case reports, public briefs. Inline trigger panel for running analysis on saved signals with report type context.

**Build sequence:** Vercel webhook → Supabase schema → Tauri scaffold → Layer 1 → Layer 2 → Layer 3 → Layer 4.

---

## What Happens to IntelliZen

Archive the repo. Extract the valuable pieces:

- Skills and validation scripts → port to Claude Code skills
- Search templates → already in vault
- Supabase schema → reference for the presentation layer's data model
- Cultural intel pipeline prompts → port to skill

The React app served its purpose: it proved the pipelines work. Now those pipelines graduate into something more powerful.

---

## Reference Architectures

| Source | What We Took | What We Left Behind |
| --- | --- | --- |
| **Karpathy autoresearch** | Constraint-driven autonomous loops, program.md, structured logging, self-correction, "never stop" directive | Single-metric optimization (too narrow for intelligence work) |
| **Signex** | Watch/Sensor/Lens pipeline taxonomy, per-Watch feedback memory, Sensor extensibility via skill-creator, deduplication as first-class concern | Tech-monitoring Sensors (HN, GitHub, PH), presentation-format "Lenses" with no analytical rigor, SQLite-only storage, no cross-Watch pattern recognition |
| **IntelliZen** | 3-axis scoring, Bayesian cultural intel pipeline, deterministic Python validators, search templates, analysis frameworks | React/Vercel/Supabase app wrapper, Perplexity API dependency (replaced by Exa), manual "run" button, fused engine+presentation architecture |
| **Exa** | Semantic search API (Search, Category, Company Research, People Search, Deep Research modes), async deep research MCP pair (fire-and-collect), Monitors for passive collection, webhook delivery, `outputSchema` structured extraction, true PAYG pricing | Deep Research tiers are expensive ($12-15/1k requests) — not for routine sweeps |
| **claude-skills-journalism** | Source verification (SIFT method + verification trails), evidence hierarchy for fact-checking, SOCMINT (account authenticity scoring, coordination detection, network mapping, narrative tracking), entity extraction + knowledge graph patterns, evidence preservation (chain-of-custody, SHA-256, legal-grade archiving), hook-based quality enforcement (source attribution, competing hypotheses, uncertainty marking) | AP Style enforcement, newsletter publishing, PDF design, interview logistics, editorial workflow management, accessibility checks, development skills (Electron, mobile debugging) |

---

## Open Questions

- Does the world map live on genzen.solutions or as a standalone property?
- What's the right publishing cadence for public intelligence reports?
- Should the cultural intelligence pipeline remain on-demand only, or are there domains worth running on a schedule?
- ~~How much of the IntelliZen Supabase schema is worth preserving vs. redesigning for the new architecture?~~ **Resolved (2026-03-12):** Consolidate into GenZen Brain. Intelligence outputs must live in the same vector store as case notes, decisions, and frameworks for cross-domain pattern recognition. New tables (watches, research_runs, entities) added as Brain migrations, not a separate project. IntelliZen Supabase project decommissioned or repurposed for something genuinely separate.