# Intake Workflow — Plan

Reference doc for the structured case intake flow in InteliZen. The entry point before a Brief is created. Not yet scheduled.

## Goal

Accept a web form payload and an initial conversation transcript, process both through an intake skill, and produce a structured investigation record pre-populated with entities, domain assessment, and urgency signals — before the analyst commits to a full case. Includes the commitment decision gate (Accept / Decline / Defer).

## Core principle

**Intake is a filtering step, not just data entry.** The intake processor's job is to surface red lines, identify capture-stage, assess domain scope, and give the analyst everything they need to make a clean accept/decline decision before any significant time investment. A case that fails at intake costs 10 minutes. A case that fails at Scoping costs a day.

## The intake flow

```
Web form payload (structured fields)
  +
Conversation transcript (uploaded file or pasted text)
        │
        ▼
[Intake Processor — claude -p]
  - Entity extraction (people, orgs, locations, assets)
  - Domain assessment (Personal / Business / Generational)
  - Red line check (is the principal the coercive actor? goal is to punish/control? → flag hard)
  - Capture-stage estimate (early / mid / late / unknown)
  - Safety / legal / urgency flags
  - Information-control point identification (which advisors, which gatekeepers)
        │
        ▼
Intake Summary displayed in UI
        │
        ▼
Decision gate: [Accept case] [Decline] [Defer]
        │
        ▼ (if accepted)
Investigation record created (pre-populated)
Entities added to graph
Case folder created in vault
Brief phase opened with context pre-loaded
```

## Input: web form schema

The intake form collects the minimum needed for a meaningful intake processor run. Fields map to GenZen's triage protocol.

```typescript
type IntakeForm = {
  // Referral context
  referred_by?: string               // introducer name or 'direct'
  referral_channel?: string          // how they reached out

  // Principal context
  principal_name: string             // who the situation is about
  principal_relationship: string     // client's relationship to the principal
  principal_location?: string        // country / region

  // Situation framing
  situation_summary: string          // free text, 200-500 chars
  domains_impacted: DomainFlag[]     // Personal | Business | Generational (multi-select)
  domain_examples: string            // 1-2 concrete examples per domain (free text)

  // Actor context
  suspected_bad_actor?: string       // name or description
  bad_actor_relationship?: string    // relationship to principal
  capture_stage_estimate?: 'early' | 'mid' | 'late' | 'unknown'

  // Current support structure
  advisors_involved: string          // free text: lawyers, therapists, family, etc.
  advisor_access_concerns?: string   // any known information-control points

  // Urgency
  safety_concern: boolean            // physical / legal / medical urgency?
  safety_detail?: string             // if yes, describe
  active_proceedings: boolean        // litigation, investigation, regulatory
  proceedings_detail?: string

  // Goals
  desired_outcome: string            // what does the client want?
  timeline_pressure?: string         // any hard deadlines
}

type DomainFlag = 'Personal' | 'Business' | 'Generational'
```

## Input: conversation transcript

The initial intake conversation (phone call, Telegram, Signal, in-person notes) as an uploaded document or pasted text. Accepted formats: `.txt`, `.md`, `.docx`, `.pdf`. The app extracts text; Claude reads the full transcript as additional context alongside the form data.

Transcripts are stored in `vault/intelligence/intakes/<intake-id>/transcript.<ext>` and referenced by path in the intake record. Not uploaded to Supabase — local vault only.

## Intake processor

A `claude -p` run using the InteliZen MCP connection and a structured prompt built from the form + transcript.

**What it produces:**

```typescript
type IntakeSummary = {
  // Extracted entities
  entities: {
    name: string
    type: 'person' | 'organization' | 'location' | 'asset'
    role: string                    // e.g. "principal", "suspected controller", "advisor"
    confidence: 'high' | 'medium' | 'low'
  }[]

  // Domain assessment
  domains: {
    domain: DomainFlag
    severity: 'primary' | 'secondary'
    evidence: string                // what from the intake supports this
  }[]

  // Red line check
  red_lines: {
    triggered: boolean
    flags: string[]                 // which hard exclusions, if any
    analyst_note: string
  }

  // Capture stage
  capture_stage: {
    estimate: 'early' | 'mid' | 'late' | 'unknown'
    reasoning: string
    confidence: 'high' | 'medium' | 'low'
  }

  // Risk signals
  safety_flags: string[]            // urgent items requiring immediate attention
  legal_flags: string[]             // active proceedings, exposure points
  information_control_points: string[]  // who may be filtering the principal's information

  // Intake assessment
  recommended_action: 'accept' | 'decline' | 'defer' | 'refer'
  recommended_action_reasoning: string
  suggested_entry_product: 'scoping-only' | 'lea' | 'sit-rep' | 'briefing'

  // Open questions
  clarifying_questions: string[]    // what to ask before committing
}
```

The intake summary is displayed in the UI before the analyst makes a decision. It is not automatically accepted — the analyst reviews, can edit the recommended action, and explicitly clicks Accept / Decline / Defer.

## Decision gate

After the intake summary renders, the analyst sees:

- Entity list (editable — add/remove/correct)
- Domain flags with evidence
- Red line status (prominent: green "No hard exclusions" or red "FLAG: [reason]")
- Capture-stage estimate with reasoning
- Safety + legal flags (if any)
- Recommended action with reasoning
- Clarifying questions list (copy to clipboard for follow-up)

Three actions:
- **Accept** — creates the investigation, transfers entities to graph, opens Brief
- **Decline** — records intake with decline reason; case is closed; no investigation created
- **Defer** — saves intake for later; no investigation created yet; appears in a "Pending intakes" list

Declined and deferred intakes are kept in `intakes` table for reference — never deleted.

## Output: investigation record pre-population

On Accept, the following happen automatically:

1. `investigations` row created with `status = 'intake'`, `case_id` generated
2. Vault folder created: `~/vault/intelligence/investigations/<case-id>/`
3. Intake summary written to vault: `intake-summary.md`
4. Transcript copied to vault: `transcript.<ext>`
5. Entities written to `graph_nodes` (linked to the new investigation)
6. Intake record in `intakes` table updated with `investigation_id`
7. Navigation: user lands in the Investigation view, Brief phase, with entities pre-populated

The Brief phase prompt builder reads the intake summary from vault and injects it as context. The analyst is not writing from a blank page.

## Document upload primitive

Intake introduces document upload as a general InteliZen primitive. Other phases (Collect, evidence capture, report review) benefit from the same capability.

**Implementation:**

```typescript
// src/lib/upload.ts
uploadDocument(
  file: File,
  destination: { kind: 'intake' | 'investigation' | 'evidence'; id: string }
): Promise<{ localPath: string; mimeType: string; textContent?: string }>
```

- Files are written to vault via the Tauri fs plugin — never to Supabase Storage directly from the upload path
- Text extraction happens in-app: `.txt` / `.md` → raw read; `.docx` → mammoth.js; `.pdf` → pdf.js extract
- Extracted text is passed to Claude as context; the file path is stored as a vault reference
- `vault_files` row inserted with `kind = 'intake-doc'` or appropriate type

Accepted types for all upload surfaces: `.txt`, `.md`, `.docx`, `.pdf`, `.png`, `.jpg` (images get described by Claude via vision, not text-extracted).

## Schema additions

```sql
-- Migration: add_intakes_schema

create table intakes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  form_data jsonb not null,              -- IntakeForm payload
  transcript_path text,                  -- vault path to transcript file
  summary jsonb,                         -- IntakeSummary from processor
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'accepted', 'declined', 'deferred')),
  recommended_action text,
  analyst_decision text,
  decline_reason text,
  defer_reason text,
  investigation_id uuid references investigations(id) on delete set null,
  processed_at timestamptz,
  decided_at timestamptz
);

create index intakes_status_idx on intakes(status);
create index intakes_investigation_id_idx on intakes(investigation_id)
  where investigation_id is not null;
```

The `investigations` table gets a back-reference:

```sql
alter table investigations add column intake_id uuid references intakes(id) on delete set null;
```

## Integration points

| Downstream | What intake provides |
|---|---|
| Investigation / Brief | Pre-populated entities, domain flags, intake summary as context |
| Graph | Initial entity nodes linked to investigation |
| Vault | Intake folder with transcript + summary |
| Claude Code Panel (workflow buttons) | Intake is the trigger for the Scoping Run button |
| MCP | `create_intake`, `get_intake_summary`, `list_pending_intakes` tools |

## MCP additions

Three new tools on the intelizen MCP server:

- `create_intake({ form_data, transcript_text })` — creates the intake record, triggers processor
- `get_intake_summary(intake_id)` — returns the IntakeSummary for a given intake
- `list_pending_intakes()` — returns deferred intakes awaiting decision

These let the intake processor run headlessly via Claude Code and write results back through MCP.

## Build sequence

**Block 1 — Schema + vault plumbing**
- Migration: `add_intakes_schema`
- `src/lib/upload.ts` — document upload primitive (fs plugin + text extraction)
- Vault folder creation on intake Accept
- MCP tools: `create_intake`, `get_intake_summary`, `list_pending_intakes`

**Block 2 — Intake form UI**
- New `/intake` route or modal flow from Investigations screen
- Form component with all IntakeForm fields
- File upload for transcript (upload primitive)
- "Run Intake Processor" button → triggers `claude -p` via shell.ts

**Block 3 — Intake processor + decision gate**
- `buildIntakePrompt` in `src/lib/shell.ts` — constructs the structured intake prompt
- IntakeSummary rendered in decision gate UI
- Accept / Decline / Defer actions
- On Accept: investigation creation, graph entity write, Brief pre-population

**Block 4 — Brief pre-population**
- Update `buildPhasePrompt` for Brief phase to read intake summary from vault if present
- Entity list in Brief UI pre-populated from graph nodes linked to investigation

## Open design decisions

1. **Intake entry point.** New `/intake` route, or a "New case" button in Investigations that launches the intake flow inline? Lean: inline modal flow — avoids a dangling route that isn't part of the investigation nav.
2. **Processor visibility.** Does the intake processor run silently (spinner, then summary) or does the user see Claude's streaming output? Lean: streaming output visible — shows work, builds confidence in the summary.
3. **Clarifying questions handling.** Displayed as a list to copy, or does the app let the analyst record answers and re-run the processor? V1: display + copy. Re-run on v2 if it proves useful.
4. **Red line handling.** If a hard exclusion is flagged, do we block Accept entirely or just require the analyst to override with a reason? Lean: block with override + mandatory note. The note goes into the decline record.
5. **Transcript format.** What if the transcript is a voice note (audio file)? Current scope: text only. Audio transcription deferred — the voice notes pipeline already handles that; the transcript would arrive as text via vault.
6. **Intake from email.** Gmail MCP is available. Could auto-create an intake from a qualifying inbound email. Defer — complex and high error rate. Manual form is the right v1.

## Status

New plan. Drafted 2026-04-28. Not scheduled. Resolves a gap identified in the case lifecycle that existing plans don't cover. Precondition for the Scoping Run workflow button in the Claude Code Panel plan.
