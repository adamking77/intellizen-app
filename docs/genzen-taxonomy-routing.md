# GenZen OS Taxonomy & Agent Routing

## Canonical Structure

Route by entity first, then business area, then folder/object.

```text
00 Inbox
01 GenZen
02 GenZen Solutions
03 GoKart Studio
04 Founder Context
99 Archive
```

Standard areas:

```text
Company HQ
Revenue
Client Work
Internal Ops
Product & Systems
Research & Intelligence
```

## Entity Rules

`GenZen` is the umbrella entity. Shared operating infrastructure belongs here: GenZen OS, IntelliZen, Supabase Brain, agents, MCP servers, skills, automations, and cross-business internal ops.

`GenZen Solutions` is its own business. GZS frameworks, service processes, protocols, reusable delivery templates, and reusable service assets belong in `GenZen Solutions / Product & Systems` unless they are sales collateral, client-specific delivery, or market research.

`GoKart Studio` is its own business. Sogo artifacts, Category Scout, NeuroDiv OS, and related product/system work belong in `GoKart Studio / Product & Systems` unless explicitly assigned elsewhere.

`Founder Context` contains Adam's preferences, voice/taste, mental models, Kindle highlights, and personal operating context that agents should be able to retrieve.

## Database Routing

Named database wins.

If the user names a database, create or update a record in that database. Do not create an IntelliZen Project just because the user casually says "project".

Examples:

```text
"Add this project to Biz Ops" -> create a Biz Ops database record.
"Add this to CRM" -> create a CRM database record.
"Add a follow-up task" -> create a Tasks database record.
"Create a project under Shadow Lotus" -> create an IntelliZen Project linked to that Operation.
"Create an IntelliZen Project" -> create an IntelliZen Project.
```

## Object Language

Use `Project` only for IntelliZen's built-in project object under Operations.

Use `record` for a database row unless the database has a more specific noun:

```text
Biz Ops record
CRM record
Client
Introducer
Task
```

## Investigation Routing

Investigations live under the entity and area that explain why the investigation exists:

```text
Client-facing investigation -> GenZen Solutions / Client Work
Exploratory or evidence-gathering research -> Research & Intelligence
Agent/system/product investigation -> Product & Systems
```

Shadow Lotus currently routes to:

```text
GenZen Solutions / Research & Intelligence / Shadow Lotus
```

unless a specific client owner makes it client work.
