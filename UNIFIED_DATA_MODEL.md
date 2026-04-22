# Unified Data Model

This is the canonical business-data schema for IntelliZen if we unify Ops and Databases into one system.

The rule is simple:

- `workspace_databases` become the only source of truth for client, operation, project, and investigation records.
- Ops, Reports, and Dashboards become different interfaces over those same records.

## Current Platform Constraints

This spec only uses field types the app supports today in [src/lib/types.ts](/Users/adamking/projects/intelizen-app/src/lib/types.ts:244).

- Supported field types: `text`, `number`, `select`, `multiselect`, `relation`, `rollup`, `formula`, `date`, `checkbox`, `url`, `email`, `phone`, `status`, `createdAt`, `lastEditedAt`
- There is no `rich_text` field type today.
- Long-form notes should live in the record `body`, not in schema fields, because records already support `body` in [src/lib/types.ts](/Users/adamking/projects/intelizen-app/src/lib/types.ts:354).
- Relation fields are stored as string arrays, so they are many-value at the engine level. For parent links like `client`, `operation`, and `project`, we enforce `max 1 selected record` by application convention until a dedicated single-relation field exists.
- Rollups support `count`, `count_not_empty`, `sum`, `avg`, `min`, `max` only. There is no filtered rollup today, so fields like `active_project_count` should not be part of phase 1.

## Non-Negotiable Rules

These are invariants, not suggestions.

- Every `Operation` must link to exactly one `Client`.
- Every `Project` must link to exactly one `Client`.
- Every `Investigation` must link to exactly one `Client`.
- `Project.operation` is optional, but if present it must belong to the same client as `Project.client`.
- `Investigation.project` is optional.
- `Investigation.operation` is optional.
- If `Investigation.project` is set, `Investigation.client` must equal the linked project's client.
- If `Investigation.operation` is set, `Investigation.client` must equal the linked operation's client.
- If both `Investigation.project` and `Investigation.operation` are set, the linked project must belong to the linked operation.
- Parent links are stored in the child record. Backlinks exist for navigation, but child-to-parent links are the authoritative relationship fields.

## Database 1: Clients

Database name: `Clients`

Primary purpose:
- account-level relationship management
- top-level parent for operations, projects, and investigations

Exact schema:

| Field ID | Label | Type | Required | Options / Notes |
| --- | --- | --- | --- | --- |
| `name` | Name | `text` | yes | Primary display field |
| `status` | Status | `status` | yes | `prospect`, `active`, `archived` |
| `account_owner` | Account owner | `text` | no | Free-text owner for now |
| `primary_contact` | Primary contact | `text` | no | Human-readable contact name |
| `contact_email` | Contact email | `email` | no |  |
| `contact_phone` | Contact phone | `phone` | no |  |
| `website` | Website | `url` | no |  |
| `sector` | Sector | `select` | no | Start empty; team-defined options later |
| `region` | Region | `select` | no | Start empty; team-defined options later |
| `operations` | Operations | `relation` | no | Target database `Operations`, backlink pair with `Operations.client` |
| `projects` | Projects | `relation` | no | Target database `Projects`, backlink pair with `Projects.client` |
| `investigations` | Investigations | `relation` | no | Target database `Investigations`, backlink pair with `Investigations.client` |
| `operation_count` | Operation count | `rollup` | no | Relation `operations`, aggregation `count` |
| `project_count` | Project count | `rollup` | no | Relation `projects`, aggregation `count` |
| `investigation_count` | Investigation count | `rollup` | no | Relation `investigations`, aggregation `count` |
| `created_at` | Created | `createdAt` | yes | System field |
| `updated_at` | Updated | `lastEditedAt` | yes | System field |

Record body usage:
- account notes
- relationship context
- engagement history

## Database 2: Operations

Database name: `Operations`

Primary purpose:
- operational container for workstreams tied to a client

Exact schema:

| Field ID | Label | Type | Required | Options / Notes |
| --- | --- | --- | --- | --- |
| `name` | Name | `text` | yes | Primary display field |
| `status` | Status | `status` | yes | Must match current code enum: `active`, `archived` |
| `client` | Client | `relation` | yes | Target database `Clients`, backlink pair with `Clients.operations`, max 1 selected |
| `lead` | Lead | `text` | no | Free-text owner for now |
| `priority` | Priority | `select` | no | `low`, `medium`, `high`, `critical` |
| `start_date` | Start date | `date` | no |  |
| `target_date` | Target date | `date` | no |  |
| `projects` | Projects | `relation` | no | Target database `Projects`, backlink pair with `Projects.operation` |
| `investigations` | Investigations | `relation` | no | Target database `Investigations`, backlink pair with `Investigations.operation` |
| `project_count` | Project count | `rollup` | no | Relation `projects`, aggregation `count` |
| `investigation_count` | Investigation count | `rollup` | no | Relation `investigations`, aggregation `count` |
| `created_at` | Created | `createdAt` | yes | System field |
| `updated_at` | Updated | `lastEditedAt` | yes | System field |

Record body usage:
- operation description
- objectives
- operating notes

## Database 3: Projects

Database name: `Projects`

Primary purpose:
- scoped client work items, optionally attached to an operation

Exact schema:

| Field ID | Label | Type | Required | Options / Notes |
| --- | --- | --- | --- | --- |
| `name` | Name | `text` | yes | Primary display field |
| `status` | Status | `status` | yes | Must match current code enum: `active`, `archived` |
| `type` | Type | `select` | yes | Must match current code enum: `report`, `scoping`, `research`, `client_case` |
| `client` | Client | `relation` | yes | Target database `Clients`, backlink pair with `Clients.projects`, max 1 selected |
| `operation` | Operation | `relation` | no | Target database `Operations`, backlink pair with `Operations.projects`, max 1 selected |
| `watch_domain` | Watch domain | `text` | no | Matches current `projects.watch_domain` usage |
| `owner` | Owner | `text` | no | Free-text owner for now |
| `start_date` | Start date | `date` | no |  |
| `due_date` | Due date | `date` | no |  |
| `investigations` | Investigations | `relation` | no | Target database `Investigations`, backlink pair with `Investigations.project` |
| `investigation_count` | Investigation count | `rollup` | no | Relation `investigations`, aggregation `count` |
| `created_at` | Created | `createdAt` | yes | System field |
| `updated_at` | Updated | `lastEditedAt` | yes | System field |

Record body usage:
- project notes
- project summary
- planning detail

## Database 4: Investigations

Database name: `Investigations`

Primary purpose:
- operational casework tied to a client and usually to a project or operation

Exact schema:

| Field ID | Label | Type | Required | Options / Notes |
| --- | --- | --- | --- | --- |
| `name` | Name | `text` | yes | Primary display field |
| `case_id` | Case ID | `text` | yes | Preserve current `investigations.case_id` |
| `status` | Status | `status` | yes | Must match current code enum: `active`, `completed`, `archived` |
| `client` | Client | `relation` | yes | Target database `Clients`, backlink pair with `Clients.investigations`, max 1 selected |
| `operation` | Operation | `relation` | no | Target database `Operations`, backlink pair with `Operations.investigations`, max 1 selected |
| `project` | Project | `relation` | no | Target database `Projects`, backlink pair with `Projects.investigations`, max 1 selected |
| `use_case` | Use case | `select` | yes | Must match current code enum: `scoping`, `post`, `sit_rep` |
| `current_phase` | Current phase | `number` | yes | Preserve current numeric phase flow |
| `assignee` | Assignee | `text` | no | Free-text owner for now |
| `opened_at` | Opened at | `date` | no | Derived or manual |
| `closed_at` | Closed at | `date` | no | Leave unset unless workflow needs it later |
| `plan_proportionality` | Proportionality | `checkbox` | no | Preserve current boolean |
| `plan_legality` | Legality | `checkbox` | no | Preserve current boolean |
| `plan_accountability` | Accountability | `checkbox` | no | Preserve current boolean |
| `plan_necessity` | Necessity | `checkbox` | no | Preserve current boolean |
| `created_at` | Created | `createdAt` | yes | System field |
| `updated_at` | Updated | `lastEditedAt` | yes | System field |

Record body usage:
- subject definition
- investigation scope
- scope notes
- HUMINT input
- known hypotheses
- seed entities
- findings and narrative

Why these live in body instead of fields:
- there is no `rich_text` field type
- `seed_entities` and `known_hypotheses` are free-form arrays today, which do not fit a fixed-options `multiselect` cleanly

## Relation Pairing Matrix

These are the exact backlink pairs to configure in the schema editor.

| Child field | Target database | Backlink field |
| --- | --- | --- |
| `Operations.client` | `Clients` | `Clients.operations` |
| `Projects.client` | `Clients` | `Clients.projects` |
| `Projects.operation` | `Operations` | `Operations.projects` |
| `Investigations.client` | `Clients` | `Clients.investigations` |
| `Investigations.operation` | `Operations` | `Operations.investigations` |
| `Investigations.project` | `Projects` | `Projects.investigations` |

## Required UX Enforcement

The schema alone is not enough. The app must enforce these rules in UI and save logic.

- Relation pickers for `client`, `operation`, and `project` must behave as single-select even though the engine stores relation values as arrays.
- When choosing a `Project.operation`, the picker must be filtered to operations for the selected client.
- When choosing an `Investigation.project`, the picker must be filtered to projects for the selected client.
- When choosing an `Investigation.operation`, the picker must be filtered to operations for the selected client.
- If the user changes `client`, incompatible `operation` or `project` links must be cleared immediately.
- If the user sets `project`, and that project already links to an operation, `Investigation.operation` should auto-fill to that operation unless the user explicitly overrides it with another valid operation from the same client.

## Ops Page Mapping

Ops is no longer its own storage model. It becomes a view layer over these databases.

Ops page sections should map as follows:

- operations list: `Operations` records filtered by status and client
- project list within an operation: `Projects` records where `operation` contains that operation record
- investigation list within a project: `Investigations` records where `project` contains that project record
- standalone investigations under an operation: `Investigations` records linked to the operation and not linked to any project

This matches the hierarchy already implied in [src/views/Reports.tsx](/Users/adamking/projects/intelizen-app/src/views/Reports.tsx:741), but moves it onto one shared record model.

## Migration Mapping From Current Tables

This section is exact. Anything not listed here should not be guessed during migration.

### Current `operations` table -> `Operations` database

| Current column | New destination |
| --- | --- |
| `name` | `name` |
| `status` | `status` |
| `description` | record `body` |
| `created_at` | preserve as import metadata only if needed |
| `updated_at` | preserve as import metadata only if needed |

### Current `projects` table -> `Projects` database

| Current column | New destination |
| --- | --- |
| `name` | `name` |
| `status` | `status` |
| `type` | `type` |
| `watch_domain` | `watch_domain` |
| `notes` | record `body` |
| `operation_id` | `operation` relation |
| `created_at` | preserve as import metadata only if needed |
| `updated_at` | preserve as import metadata only if needed |

### Current `investigations` table -> `Investigations` database

| Current column | New destination |
| --- | --- |
| `name` | `name` |
| `case_id` | `case_id` |
| `status` | `status` |
| `operation_id` | `operation` relation |
| `project_id` | `project` relation |
| `use_case` | `use_case` |
| `current_phase` | `current_phase` |
| `subject_definition` | record `body` section |
| `investigation_scope` | record `body` section |
| `scope_notes` | record `body` section |
| `humint_input` | record `body` section |
| `plan_proportionality` | `plan_proportionality` |
| `plan_legality` | `plan_legality` |
| `plan_accountability` | `plan_accountability` |
| `plan_necessity` | `plan_necessity` |
| `seed_entities` | record `body` section |
| `known_hypotheses` | record `body` section |

## Migration Preconditions

These must be true before data migration starts.

- The `Clients` database must exist first.
- Every imported operation, project, and investigation must be assigned to a client.
- Because the current legacy tables do not carry `client_id`, migration needs either:
  - a manual client assignment pass, or
  - a temporary `Unassigned client` record used as a holding bucket until records are resolved

Do not start migration without solving client assignment first. That is the only part the current schema cannot infer automatically.

## Phase 1 Scope

Phase 1 means:

- unify the data model
- preserve current Ops status/type enums
- preserve current investigation booleans and phase number
- use record body for long-form content
- use native relations and backlink syncing already implemented in [src/lib/data.ts](/Users/adamking/projects/intelizen-app/src/lib/data.ts:1899)

Phase 1 does not include:

- filtered rollups
- custom single-relation field type
- person field type
- native rich-text field type
- computed health scores
- automated client inference

## Final Architectural Rule

There should be one business-data graph and many interfaces over it.

That means:

- Databases own the records
- Ops owns workflow presentation
- Reports owns document presentation
- Dashboards own analytics presentation

None of them should own a separate copy of the same operational entities.
