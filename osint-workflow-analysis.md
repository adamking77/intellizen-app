---
title: OSINT Workflow Analysis — Claude Sleuth + GenZen Implementation Plan
type: strategic-analysis
date: 2026-04-07
tags: [osint, intelligence, counter-exploitation, workflow, tooling]
---

# OSINT Workflow Analysis
## Claude Sleuth Review + GenZen Implementation Plan

---

## What Claude Sleuth Is

Claude Sleuth (github.com/elb-pr/claude-sleuth) is a structured OSINT investigation workflow packaged as a Claude skill. It consists of 6 phases, 56 discrete tasks, and a Python task runner that enforces gate progression — you cannot advance to the next phase until the current phase's checklist passes.

It is designed for single, discrete investigations terminating in a publishable report. It is not a monitoring system. Its audience is investigative journalists, private investigators, and researchers working a defined subject from initial planning to final brief.

The methodology is legitimate. It references real intelligence community frameworks: Admiralty 6×6 source grading, Analysis of Competing Hypotheses (ACH), and ICD 203 probabilistic language standards. The tooling is well-researched — 150+ verified free data sources across nine investigation domains.

The author is unknown, unaffiliated with any institution, and the codebase has no audit trail. It is an opinionated personal workflow that happens to cite good frameworks. The frameworks are solid; their implementation is unverified.

---

## What It Can Gather

### Person & Identity
- Username enumeration across 400–3,000+ sites (Sherlock, Maigret, WhatsMyName)
- Email-to-platform registration — which services an email is registered on (Holehe, 120+ platforms)
- Phone number footprinting — carrier, line type, VoIP detection
- US voter records, court records, people-search aggregators
- Password breach lookups (Have I Been Pwned)
- Face verification — local comparison only; no web face-search at zero cost

### Corporate & Organizational
- UK beneficial ownership (Companies House — directors, PSC, filing history)
- US public company filings — SEC EDGAR, 20M+ filings (10-K, 10-Q, 8-K, insider trades)
- Global legal entity identifiers — GLEIF, 2.5M+ entities with parent/child ownership chains
- Offshore entity exposure — ICIJ database, 810,000+ entities from Panama, Paradise, Pandora Papers
- Power mapping — LittleSis, 400K+ entities, 1.6M+ relationships
- Government contracts — USASpending (US), Contracts Finder (UK), TED (EU)

### Financial
- Financial anomaly detection on SEC filings — Benford's Law, YoY variance, Z-score
- UK Land Registry — 24M+ property transactions since 1995
- Blockchain — multi-chain transaction tracing (Bitcoin, 48+ chains via Blockchair)
- Sanctions screening — OFAC, UN, EU, UK consolidated lists, fuzzy name matching

### Technical Infrastructure
- Domain/subdomain enumeration (crt.sh, Subfinder, Amass)
- IP geolocation, ASN mapping, BGP routing history
- Shodan InternetDB — open ports, vulnerabilities, no auth required
- Certificate transparency monitoring — real-time stream of newly issued certs

### Geospatial
- EXIF metadata from photos — device, timestamps, GPS coordinates
- Sun/shadow position analysis for image geolocation (Bellingcat ShadowFinder)
- Historical weather verification for chronolocation
- Aircraft tracking (OpenSky Network)
- Vessel AIS tracking (aisstream.io)
- Satellite imagery — Sentinel (10m optical, free), Landsat (30m, 40 years archive)

### Social Media (Significantly Degraded Post-2023)
| Platform | Status |
|----------|--------|
| Twitter/X | $100/month minimum for reads; fragile scrapers exist |
| Reddit | Archived data only (PullPush, Arctic Shift) |
| Instagram | Login required; suspension risk |
| Telegram | Free with API credentials — most functional for OSINT |
| LinkedIn | Actively hostile; no reliable free tool |
| YouTube | Free 10K/day API; yt-dlp for downloads |
| Bluesky/Mastodon | Fully open — best current options |

### Media Authentication
- Reverse image search
- Shadow, sun position, and weather-based chronolocation for photo/video verification
- EXIF-based location extraction

---

## Their Methodology (6 Phases)

**Phase 1 — Operational Direction**
Before any collection starts: define subject, write investigation plan, justify proportionality (PLAN framework: Proportionality, Legality, Accountability, Necessity). STEEPLES environmental scan. Hard gate — must pass checklist before advancing.

**Phase 2 — Intelligence Collection**
Collect with epistemic filtering. Every claim is graded with Admiralty 6×6 (reliability A–F, credibility 1–6) before entering the record. Actions register maintained — including negative results (proving all lines of enquiry were pursued). Evidence preserved with SHA-256 hashing and chain of custody.

**Phase 3 — Collation & Entity Resolution**
Raw vetted data structured into POLE records (Person, Object, Location, Event). Central entity register with strict provenance. Optional: genealogical/family network research, cultural context mapping.

**Phase 4 — Chronological & Relational Processing**
Timeline normalized to UTC. Network architecture (edge list) built for link analysis — identifying high-connectivity hubs and bridge nodes. Visual media authenticated via geolocation/chronolocation.

**Phase 5 — Hypothesis & Reasoning**
ACH matrix: minimum three mutually exclusive hypotheses tested against all evidence. Operates on the Inconsistency Principle — the most viable hypothesis has the least evidence against it, not the most confirmations.

**Phase 6 — Final Report**
BLUF (Bottom Line Up Front) analytical brief following ICD 203 standards. Strict separation of facts, assumptions, and analytical judgements. Case summary record. Findings memo.

---

## What We Already Have

Our intelligence-research and analytical-rigor skills cover significant ground:

**Strengths we have that they don't:**
- Continuous domain monitoring via Watches — they only support discrete investigations
- Vault + Brain integration — all output vectorized, cross-searchable, pattern-recognizable across cases
- Scheduler wiring — autonomous headless sweeps
- GenZen domain specificity — exploitation patterns, autonomy dimensions, UHNW context
- Evidence preservation with SHA-256 + multi-archive redundancy (Wayback, Archive.today, Perma.cc)
- SOCMINT coordination detection — account authenticity scoring, narrative tracking
- Cultural intelligence pipeline — 4-domain Bayesian analysis

**Gaps compared to Claude Sleuth:**
- No hard gate enforcement — our analytical rigor is advisory, not blocking
- No formal operational planning phase — we collect before we formally scope
- No Admiralty 6×6 grading — we use SIFT + evidence hierarchy, which is different in structure
- No chronological matrix phase — timeline reconstruction isn't a discrete step in our pipeline
- No formal ACH matrix — we check for competing hypotheses but don't build the full matrix with the Inconsistency Principle
- No POLE entity model — our entity extraction exists but isn't structured as Person/Object/Location/Event
- No final report assembly — we produce vault artifacts, not a structured deliverable
- No specific tooling for username enumeration, corporate beneficial ownership, financial anomaly detection, or geolocation — these are gaps in our sensor library

---

## What to Implement

### IntelliZen Placement

This OSINT investigation workflow is **Layer 3** in the IntelliZen Tauri app architecture. The four layers are:

1. **Monitoring** — passive Exa Monitor collection, inbox triage
2. **Search** — on-demand targeted queries on people, orgs, topics
3. **Investigation** — this workflow: deep OSINT on relationships, connections, ecosystems
4. **Reports** — outputs of varying depth for different audiences

The 6-phase flow (Plan → Collect → Collate → Timeline → ACH → Report) maps directly to a phase stepper UI in the app. Each phase spawns a `claude -p` invocation against the intelligence-research skill. The analytical work stays in Claude Code; the app tracks phases, enforces gates, and manages artifact handoffs.

---

### Priority 1 — Investigation Mode (Extend Existing Skill)

Add a discrete investigation workflow to the `Investigate` operation in intelligence-research. This does not require a rebuild — it adds a structured phase flow on top of existing infrastructure.

**The phases we need:**

1. **Operational planning gate** — before any collection, produce: subject definition, investigation scope, PLAN justification (proportionality, legality, accountability, necessity), seed entities, known hypotheses. Write to `~/vault/intelligence/investigations/{case-id}/plan.md`. Hard gate: must be complete before proceeding.

2. **Admiralty 6×6 source grading** — add alongside SIFT, not replacing it. SIFT is a verification method; Admiralty grades the source relationship history (A = always reliable to F = cannot be assessed) independently of the current claim credibility (1–6). Both are needed for rigorous work.

3. **Chronological matrix phase** — after entity extraction, normalize all events to UTC timeline. Flag temporal gaps. Identify contradictions in source timestamps. Output to `{case-id}/timeline.md`.

4. **Formal ACH matrix** — three minimum hypotheses, evidence matrix, Inconsistency Principle scoring. Output to `{case-id}/ach.md`. This is the analytical heart of a rigorous investigation and we currently skip it.

5. **POLE entity model** — structure extracted entities as Person, Object, Location, Event with directed edges. Maps to network graph construction. Output feeds Brain's knowledge graph more richly.

6. **Report assembly** — synthesize vault artifacts into a BLUF brief. Route through copywriting-department for any client-facing output. Template: Executive Summary → Findings (facts) → Analysis (judgements, confidence levels) → Competing Hypotheses → Recommended Actions → Evidence Register.

### Priority 2 — New Sensors to Build

These tools exist as open-source Python libraries and can be integrated as Sensors in our pipeline:

| Sensor | What it adds | Source |
|--------|-------------|--------|
| **Corporate Intel Sensor** | Beneficial ownership chains, ICIJ offshore exposure, SEC filings | Companies House API, GLEIF, ICIJ, EDGAR |
| **Username Enum Sensor** | Social footprint across 400–3,000+ platforms | Maigret (has MCP server), Sherlock |
| **Financial Anomaly Sensor** | Benford's Law + YoY variance on SEC filings | edgartools (MIT, has MCP server) |
| **Sanctions Sensor** | OFAC, UN, EU, UK consolidated screening with fuzzy matching | Public bulk downloads, OpenSanctions |
| **Domain Intel Sensor** | Subdomains, crt.sh, Shodan, RDAP, tech stack | crt.sh, Shodan InternetDB, Subfinder |
| **Geolocation Sensor** | EXIF extraction, sun/shadow analysis, weather verification | exifread, pysuncalc, Open-Meteo |
| **Blockchain Sensor** | Multi-chain transaction tracing | Blockchair (1K/day free), Blockstream |

### Priority 3 — Data Sources to Register

High-value free databases to add as reference sensors (no scripting needed — direct API calls):

- **JudyRecords** — 760M+ US court cases, no signup
- **CourtListener/RECAP** — US federal court records + 32K judge financial disclosures
- **UK Land Registry Price Paid** — 24M+ property transactions
- **LittleSis** — power mapping, MCP server available
- **USASpending** — federal contracts, grants, loans
- **OpenSky** — aircraft tracking (free with account as of March 2026)

---

## What Not to Implement

**Their task_runner.py gate enforcement** — clever for a standalone tool, unnecessary for us. Our Investigate operation can enforce phases conversationally without needing a Python CLI wrapper. The value of the gate is the discipline, not the mechanism.

**Social media scraping tools** (twscrape, Instaloader) — high fragility, high account risk, low signal for GenZen cases. The landscape is broken. Telegram is the exception — worth investing in.

**Face search** — the gap is real and cannot be closed at zero cost. PimEyes/FaceCheck.ID require payment. DeepFace is local-only comparison. This is a known limitation, not a solvable problem without budget.

**OpenCorporates** — the "open" branding is misleading. Meaningful commercial API access is £2,250/year minimum. Use GLEIF + ICIJ + Companies House instead, which cover 80% of the same ground for free.

---

## GenZen-Specific Design Considerations

Our OSINT workflow serves a different purpose than investigative journalism. The differences matter:

**Subject types we investigate:**
- Exploitation actors (cult leaders, financial predators, coercive partners)
- Victim profiles (understanding what the principal may be hiding, denying, or blind to)
- Organizations operating as control architectures (cults, predatory investment vehicles, family office capture schemes)
- Trust network members (advisors, attorneys, family members potentially compromised)

**What that means for collection priorities:**
1. Behavioral and relational patterns matter more than financial anomalies for most cases
2. Offshore entity exposure and beneficial ownership chains are critical for financial exploitation
3. Cultural context is essential for understanding control architecture — our existing cultural intel pipeline is a differentiator here
4. Evidence preservation needs to meet legal-grade standards because cases often progress to litigation
5. Chronological reconstruction is critical — exploitation architects carefully manage timelines

**What we need that Claude Sleuth doesn't have:**
- Exploitation pattern recognition as an analytical lens (we have this conceptually; it needs a formal Lens in the pipeline)
- Autonomy dimension mapping — tracking which of the 7 dimensions are compromised and how
- Trust network topology — who has access to whom, at what stage of capture
- Behavioral anomaly detection — changes in communication patterns, asset movements, social isolation indicators

These are GenZen-specific lenses that no open-source OSINT tool will have. They are our differentiated capability.

---

## Recommended Build Sequence

1. **Extend the Investigate operation** — add operational planning gate, Admiralty grading, chronological matrix, ACH matrix, POLE model, report assembly. One focused session. Modifies `intelligence-research/SKILL.md` and adds new reference files.

2. **Build Corporate Intel Sensor** — the highest-value new sensor for GenZen cases. Companies House + GLEIF + ICIJ + EDGAR. Adapting their `corporate_intel.py` as a starting point saves significant work.

3. **Build Sanctions Sensor** — direct lift from their `sanctions_screen.py` with adaptation for our output schema. Their fuzzy matching implementation is solid.

4. **Register high-value data sources** — JudyRecords, CourtListener, Land Registry, LittleSis. No scripting required, just add to sensors.md as reference sensors.

5. **Build exploitation-specific Lenses** — autonomy dimension mapping, trust network topology, exploitation stage assessment. These are proprietary and represent the GenZen differentiation.

The first step (extend Investigate) gives us an immediately usable discrete investigation workflow. Steps 2–4 add depth to what we can collect. Step 5 is what makes it GenZen.

---

## Summary Assessment

Claude Sleuth is a well-researched tool with legitimate methodology and useful open-source tooling. It is worth adapting from, not copying. Their corporate intelligence, sanctions screening, and geolocation scripts are directly useful. Their ACH matrix discipline and formal planning gate are process patterns we should adopt.

What it cannot do: continuous monitoring, cross-case pattern recognition, exploitation-specific analysis, or produce intelligence calibrated to the GenZen client context. Those are our capabilities and they are not replicated anywhere in open source.

The gap between where we are and a complete counter-exploitation OSINT workflow is real but not large. The core infrastructure exists. What's missing is tooling depth in the collection layer and rigor in the investigation phase flow — both of which are achievable in a focused ops week.
