# Client Deliverables Architecture — PDF + Web from a Single Source

Reference doc for transforming InteliZen Investigation outputs into finished GenZen client assets. Two media, one source of truth. Not yet scheduled.

## Goal

Take the markdown output of an Investigation (Brief → Collect → Analyse) and produce two finished, on-brand artifacts:

1. A **PDF report** — print-quality, secure, deliverable as an attachment or in-person handover
2. A **web report** — screen-optimized, interactive, deliverable via private URL

Both must contain identical content, render to GenZen brand standards, and survive UHNW client scrutiny without reading as AI-generated.

## Core principle

**Single structured content source, two presentation renderers.** Both PDF and web are functions of the same JSON document. Never write content twice. Never let the two media drift in substance — only in presentation.

```
Investigation output (markdown)
        │
        ▼
┌──────────────────────────┐
│  Report JSON (schema)    │   ← single source of truth
└────────────┬─────────────┘
             │
       ┌─────┴─────┐
       ▼           ▼
┌──────────┐  ┌──────────┐
│ PDF      │  │ Web      │
│ template │  │ template │
└────┬─────┘  └────┬─────┘
     │             │
     ▼             ▼
  Puppeteer    Vercel/static
   → .pdf       → URL
```

## Layer 1 — Source

Investigation produces markdown in `$HOME/vault/intelligence/investigations/<case-id>/`. Currently unstructured prose plus evidence files. This stays as-is — it's the working artifact, not the deliverable.

## Layer 2 — Content normalization (Report JSON)

The bridge between unstructured analysis and structured rendering. An LLM step (Claude for analytical fidelity, optionally Kimi K2 for bulk fill on long reports) transforms markdown into a schema-conformant JSON document.

### Base schema (every report type extends this)

```typescript
type ReportDocument = {
  meta: {
    id: string                    // case_id
    type: ReportType              // 'threat-analysis' | 'lea' | 'sit-rep' | 'briefing' | 'article' | 'spec-proposal'
    title: string
    subtitle?: string
    client: { display_name: string; reference_code?: string }
    classification: 'confidential' | 'restricted' | 'internal'
    version: string               // semver: 1.0.0
    issued_date: string           // ISO date
    issued_by: string             // 'GenZen Solutions'
    distribution: string[]        // intended recipients
  }
  cover: {
    headline: string              // single line, sets the frame
    summary_line: string          // 1 sentence — what this is
  }
  executive_summary: {
    paragraphs: string[]          // 2-4 short paragraphs
    bottom_line: string           // single sentence — the verdict
  }
  findings: Finding[]
  recommendations: Recommendation[]
  evidence: EvidenceItem[]        // referenced by ID from findings
  sources: Source[]               // referenced by ID throughout
  appendices?: Appendix[]
}

type Finding = {
  id: string
  heading: string
  hypothesis: string              // what we believe
  supporting_evidence: string[]   // evidence IDs
  contradicting_evidence: string[] // evidence IDs (per Intelligence Protocol)
  confidence: 'high' | 'medium' | 'low'
  next_evidence_needed?: string   // what would update this
  body: RichBlock[]               // the analytical narrative
}

type Recommendation = {
  id: string
  action: string
  rationale: string
  reversibility: 'low' | 'medium' | 'high'
  confidence: 'high' | 'medium' | 'low'
  decision_threshold?: string     // "If X, then Y; otherwise Z"
}

type EvidenceItem = {
  id: string
  type: 'document' | 'communication' | 'observation' | 'public-record' | 'source-statement'
  description: string
  acquired_date?: string
  reliability: 'high' | 'medium' | 'low'
  preserved_at?: string           // path to preserved evidence in vault
}

type Source = {
  id: string
  citation: string
  url?: string
  reliability: 'high' | 'medium' | 'low'
  accessed_date: string
}

type RichBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'callout'; tone: 'critical' | 'note' | 'caveat'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'evidence_ref'; ids: string[] }
```

This schema is the contract. Both renderers consume it. The Intelligence Analysis Protocol (hypothesis → supporting → contradicting → confidence → next-evidence) is structurally enforced — it cannot be skipped because the schema requires it.

### Type-specific extensions

Each report type adds its own optional fields.

**Article** — public-facing thought leadership derived from a case (anonymized). No client fields, no classification banner, no evidence appendix. Structured for a GenZen site deploy, not a client handover.

```typescript
type ArticleReport = ReportDocument & {
  meta: { type: 'article' }
  slug: string                          // URL slug for genzen-deliverables deploy
  publish_status: 'draft' | 'ready' | 'published'
  anonymization_review: boolean         // analyst confirms no identifiable client detail
  tags: string[]                        // topic tags for site navigation
  seo: {
    meta_description: string
    og_title?: string
    og_description?: string
  }
}
```

Key differences from client reports:
- `classification` always `'internal'` (rendered label suppressed in output)
- `client` field omitted from rendered output
- `evidence` appendix omitted — public articles cite sources, not EV-IDs
- No token-gated web URL — deploys to a public genzen-deliverables route
- `anonymization_review` gate: analyst must confirm before publish status can move to `ready`

**Spec Proposal** — pre-engagement scope document sent to a prospective client or introducer. No investigation findings (there may be no investigation yet). Structured for PDF delivery only — no web version.

```typescript
type SpecProposal = ReportDocument & {
  meta: { type: 'spec-proposal' }
  engagement_type: 'scoping-only' | 'lea' | 'sit-rep' | 'war-room' | 'legacy-ops'
  proposed_scope: string                // plain-language scope description
  proposed_timeline: string
  proposed_investment?: string          // optional; omit if not ready to quote
  next_step: string                     // single clear CTA
  intake_id?: string                    // references intake record if derived from one
}
```

Key differences from client reports:
- May be created before an investigation exists (intake → spec proposal path)
- PDF only — no Vercel web deployment
- No evidence, findings, or recommendations sections (those don't exist yet)
- `executive_summary` repurposed as situation framing + proposed approach
- `findings` array repurposed as capability/approach description blocks

**Example for LEA (Legacy Ecosystem Analysis):**

```typescript
type LEAReport = ReportDocument & {
  meta: { type: 'lea' }
  ecosystem_map: {
    nodes: EcosystemNode[]        // people, entities, systems
    edges: EcosystemEdge[]        // influence relationships
    capture_stages: CaptureStage[]
  }
  autonomy_dimensions: AutonomyAssessment[]  // 7 dimensions per GenZen ethos
}
```

Schemas are versioned. Old reports re-render against their pinned schema version.

## Layer 3 — Design system

Shared design tokens consumed by both PDF and web templates. No second design language.

### Tokens

- **Typography:** serif for body (e.g. Source Serif Pro), sans for UI/headings (e.g. Inter), mono for evidence citations and IDs. Print and screen scales differ — same family, different sizes.
- **Color:** restrained palette. Ink black, off-white background, single accent for confidence/classification chips, semantic reds/ambers used sparingly for critical findings only.
- **Spacing:** consistent vertical rhythm. 8pt baseline grid for both media.
- **Brand:** GenZen wordmark, the 現前 character, classification banner styling.
- **Confidence visual language:** consistent badges (high/medium/low) used identically across both media. Adam is colorblind — confidence must always pair with a label, never color alone.

### Component library

Shared React components, two stylesheets (`print.css` + `screen.css`). Components include:

- `<ReportHeader>` — title, classification, client ref, version
- `<ExecutiveSummary>`
- `<FindingCard>` — hypothesis, evidence, confidence, narrative
- `<ConfidenceBadge>` — high/medium/low with text label
- `<EvidenceReference>` — inline citation with hover/click expansion (web) or footnote (PDF)
- `<RecommendationItem>` — with reversibility chip
- `<SourceCitation>`
- `<Callout>` — critical/note/caveat tones
- `<EvidenceTable>`
- `<Appendix>`

## Layer 4 — Rendering pipelines

### Output matrix by type

| Type | PDF | Web (token-gated) | Web (public) | Notes |
|---|---|---|---|---|
| `threat-analysis` | Yes | Yes | No | Standard client report |
| `lea` | Yes | Yes | No | Standard client report |
| `sit-rep` | Yes | Yes | No | Standard client report |
| `briefing` | Yes | Yes | No | Standard client report |
| `article` | No | No | Yes | genzen-deliverables public route |
| `spec-proposal` | Yes | No | No | PDF only; no web version |

### PDF pipeline

```
Report JSON
   ↓
PDF template (React, print-styled)
   ↓
Headless Chromium (Puppeteer)
   ↓
.pdf file → vault_files row → openable from Reports screen
```

Print-specific concerns handled in this template:
- A4/Letter page geometry, margins
- Page breaks (CSS `break-before`, `break-inside: avoid` on findings)
- Running headers/footers (page numbers, classification banner, case ID)
- Table-of-contents generation (Puppeteer's `outline` or generated on first pass)
- Inline footnotes for evidence references (web uses popovers; PDF uses numbered footnotes)
- No interactive elements

**Rendering host options:**
1. **Local Node sidecar** spawned by Tauri (Puppeteer + Chromium bundled). Heavy DMG (~150MB+ added) but fully offline.
2. **Supabase Edge Function** with @sparticuz/chromium. Lighter app, requires network at render time.
3. **Vercel function.** Same tradeoff as Supabase, plus the project already has Vercel.

Recommended: **Vercel function for v1**, evaluate local sidecar if offline rendering becomes a requirement.

### Web pipeline — token-gated (client reports)

```
Report JSON
   ↓
Web template (React, screen-styled)
   ↓
Static export (Next.js or Vite SSG) OR live SSR
   ↓
Vercel deployment to private URL
   ↓
URL stored in vault_files → shareable from Reports screen
```

### Web pipeline — public (articles)

```
Report JSON (article type)
   ↓
Article template (React, editorial-styled, no classification/client fields)
   ↓
Static export → genzen-deliverables public route
   ↓
URL: genzen.solutions/intelligence/<slug> or similar
   ↓
URL stored in vault_files; publish_status updated to 'published'
```

Article deploy is gated on `anonymization_review: true` and `publish_status: 'ready'`. The Reports screen surfaces a "Publish" action that only activates when both conditions pass. A separate `draft` view lets the analyst preview the article before setting it ready.

Web-specific concerns:
- Responsive layout (desktop primary, mobile graceful)
- Interactive evidence references (click to expand inline, not navigate away)
- Sticky table of contents
- Smooth scroll between findings
- Optional: print-from-browser produces something close to the PDF (but the canonical PDF is the Puppeteer output, not browser print)

**Hosting model:** per-client Vercel project, or single Vercel project with token-gated routes. Lean toward **token-gated routes** for simpler ops — one project, signed JWT in URL, expires on configurable interval.

## Layer 5 — Generation orchestration

Three entry paths, one schema output.

**Client report path** (threat-analysis, lea, sit-rep, briefing):
```
1. Analyst marks Investigation as "ready for delivery" in Reports screen
   ↓
2. Orchestrator reads markdown + evidence index from vault
   ↓
3. LLM step: markdown → Report JSON
   - Claude for analytical content (findings, recommendations, executive summary, narrative blocks)
   - Output validated against schema; failures surface in UI
   ↓
4. Human review pass in Reports screen
   - Edit any field directly (the JSON is the source — not the rendered output)
   - Toggle classification, distribution list, version
   ↓
5. Render trigger
   - PDF: Puppeteer renders → uploads to Supabase Storage or local vault
   - Web: deploys static build to Vercel route with signed URL
   ↓
6. vault_files rows created for both artifacts
   ↓
7. Reports screen shows: download PDF, copy web URL, view inline
```

**Article path:**
```
1. Analyst triggers "Generate Public Article" workflow button in Claude Code Panel
   ↓
2. Claude reads case themes from vault; strips/anonymizes client-identifying detail
   ↓
3. intelligence-research + copywriting-department skill stack
   ↓
4. LLM step: themes → Article JSON (slug, tags, body blocks, SEO fields)
   ↓
5. Anonymization review gate — analyst confirms no identifiable client detail
   ↓
6. Render trigger: article template → genzen-deliverables public route
   ↓
7. vault_files row with publish_status = 'published'
```

**Spec proposal path:**
```
1. Analyst triggers "Generate Spec Proposal" workflow button
   (may be triggered from intake, before any investigation exists)
   ↓
2. Claude reads intake summary from vault (or active investigation brief if one exists)
   ↓
3. copywriting-department skill stack
   ↓
4. LLM step: intake/brief → SpecProposal JSON (scope, timeline, investment, next step)
   ↓
5. Human review in Reports screen — edit scope, investment, CTA
   ↓
6. PDF render only (Puppeteer) → vault_files row
   ↓
7. Reports screen shows: download PDF
```

Re-rendering is cheap and non-destructive for all three paths. Edit the JSON, re-render both. Versions are tracked.

## Layer 6 — Distribution and security

UHNW client work demands stricter confidentiality posture than typical SaaS deliverables.

### PDF
- Stored in vault locally; never auto-uploaded
- Optional: password-protected on export (qpdf or similar)
- Optional: per-recipient watermarking (recipient name in footer)
- Delivery via secure channel chosen by user (encrypted email, Signal attachment, in-person USB)

### Web
- Token-gated routes — JWT in URL, validated server-side (Vercel middleware or Edge Function)
- Token includes: report ID, recipient identifier, expiry, single-revoke key
- `noindex` headers, no public sitemap, no caching of authenticated content
- Audit log of access (timestamp, IP, recipient token) stored in Supabase
- Revocation: kill the token, all links die immediately
- Optional: per-recipient watermarking burned into the page header

### Versioning
- Every render bumps the patch version. Major/minor controlled by analyst.
- Old versions remain accessible to the analyst but tokens for old versions can be revoked while issuing new ones.

## Layer 7 — Tech stack decisions

| Concern | Choice | Reasoning |
|---|---|---|
| Component library | React + Tailwind v4 | Matches InteliZen stack |
| Print stylesheet | Tailwind print: variants + custom @page rules | Native, no separate library |
| PDF renderer | Puppeteer on Vercel function (v1) | Already have Vercel; lightest path |
| Web framework for templates | Next.js (separate project) | App Router for token-gated routes |
| Web hosting | Vercel | In stack |
| Schema validation | Zod | TS-native, runtime-safe |
| LLM (analytical) | Claude (Anthropic SDK) | Strongest at the analytical reasoning layer — findings, competing hypotheses, recommendations, executive narrative |
| LLM (UI / template / layout) | Kimi K2 | Materially better at frontend/visual code generation than Claude. Used for template authoring, design system component code, and any bespoke per-report layout work |
| Storage | Supabase Storage for PDFs, vault for local copies | Already in stack |
| Auth/tokens | JWT signed with Supabase service key | No extra infra |

**Separate project, not monorepo.** The deliverables system (templates + Vercel app + Puppeteer function) lives in its own repo, talks to InteliZen via Supabase. Keeps InteliZen's Tauri build clean and lets the deliverables web app deploy independently.

Working name for the second project: `genzen-deliverables`.

## Layer 8 — Voice and copy enforcement

Per GenZen copywriting standards (system instructions), every LLM step that produces prose must be prompted with:
- No M-dashes
- No "It's not just X, it's Y" parallel structures
- No AI-favored words (innovative, elevate, delve, practical solutions, cutting-edge)
- Lead with measurable outcomes
- UHNW vocabulary, master-specialist tone

This belongs in a shared prompt prefix consumed by every generation step. The Report JSON should include a `voice_check_passed: boolean` flag set by an automated post-generation pass that flags any forbidden patterns.

## Open design decisions

Resolve before build commit:

1. **Cover page treatment.** Minimalist editorial (1 line + GenZen mark) vs. branded report cover with imagery. The first signals seriousness; the second signals investment. Lean editorial.
2. **TOC strategy.** Auto-generated from finding headings, or analyst-curated? Auto for v1.
3. **Evidence handling in PDF.** Inline footnotes vs. dedicated evidence appendix vs. both. Both is the conservative call for legal-grade reports.
4. **Web report navigation.** Sticky sidebar TOC, top progress bar, or scroll-only. Sidebar TOC is the UHNW expectation.
5. **Schema versioning policy.** How long do old schemas remain renderable? Decision: forever, but only the latest schema gets new features.
6. **Multi-tenancy.** Is `genzen-deliverables` ever going to host non-GenZen reports? Decision now affects URL structure and token design. Default: GenZen-only, single-tenant.
7. **Localization.** Are any reports going out in non-English? If yes, schema needs locale field and templates need RTL handling. Decision: English-only v1.
8. **Branding split.** Some reports may need to be unbranded / white-labeled (when an introducer wants the work attributed to them). Decision: defer, schema can support `branding: 'genzen' | 'unbranded' | 'white-label'` later.
9. **Article anonymization enforcement.** Is the `anonymization_review` flag sufficient, or should a secondary LLM pass scan the Article JSON for identifiable details before enabling publish? Lean: LLM pass added to Phase 4 — the stakes of accidental client identification in public content are too high for a checkbox alone.
10. **Spec proposal before intake.** Can a spec proposal be generated with no intake and no investigation (just a conversation)? Lean: yes — the spec path accepts a free-text context field as fallback when no intake-id is provided. This handles the case where a prospective client contacts via email and the analyst wants to turn the conversation into a proposal without formally opening an intake.

## Phased build plan

### Phase 1 — Schema and templates
- Lock base ReportDocument schema (Zod)
- **Use Kimi K2 to generate the design system component library and the first PDF + Web templates.** This is the phase that benefits most from Kimi's frontend strength.
- Hand-curate and refine the generated output against GenZen brand standards
- Render hand-authored JSON end-to-end. No analytical LLM step yet.
- Deliverable: a fully designed PDF and Web report rendered from a JSON file, in a component library you'd be proud to maintain

### Phase 2 — Generation orchestration
- Markdown → JSON LLM pipeline (Claude only)
- Validation + error surfacing
- Reports screen UI for review/edit/render
- Vercel function for Puppeteer PDF rendering
- Token-gated Vercel route for web reports
- Deliverable: end-to-end Investigation → reviewed JSON → rendered PDF + Web URL

### Phase 3 — Production hardening
- Watermarking (PDF + web)
- Access audit log
- Token revocation UI
- Distribution checklist in Reports screen
- Voice-check automated pass
- Deliverable: client-ready system

### Phase 4 — Schema expansion (rolling)
- Add LEA, Sit Rep, Briefing schemas + templates
- Add Article schema + editorial template (public Vercel route, no client fields)
- Add Spec Proposal schema + proposal template (PDF only, may precede investigation)
- Each new report type adds a schema extension and a template variant; no infra changes

### Phase 5 (optional) — Bespoke per-report layouts
- Introduce a Kimi K2 path for reports that need custom layout work outside the standard templates
- Hybrid orchestration: Claude generates the analytical content, Kimi generates a one-off React component for that report's specific visual treatment, both compose into the same render pipeline
- Useful for flagship deliverables where the design itself is part of the message (LEA reports, major briefings)

## Leverage note

Larger investment than the Claude Code embed, but the leverage compounds: every Investigation thereafter renders to client-grade output for free.

## Status

Discussed 2026-04-26. Architecture validated. Not scheduled. Decisions locked except for the eight open items above; resolve those at the start of Phase 1 build commit.
