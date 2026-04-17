// Tauri shell plugin integration for spawning claude -p
import { Command } from "@tauri-apps/plugin-shell";
import { homeDir } from "@tauri-apps/api/path";
import type { InvestigationUseCase, ReportType } from "@/lib/types";

export interface ClaudeInvocation {
  prompt: string;
  allowedTools?: string[];
  timeout?: number;
}

export interface ClaudeResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number | null;
}

const CLAUDE_COMMAND_CANDIDATES = [
  "claude",
  "claude-home-local",
  "claude-homebrew",
  "claude-usr-local",
] as const;

const DEFAULT_TOOLS = [
  "WebSearch",
  "WebFetch",
  "Read",
  "Write",
  "mcp__exa__web_search_exa",
  "mcp__exa__web_search_advanced_exa",
  "mcp__exa__crawling_exa",
  "mcp__exa__company_research_exa",
  "mcp__exa__deep_researcher_start",
  "mcp__exa__deep_researcher_check",
];

let claudeEnvPromise: Promise<Record<string, string>> | null = null;

async function getClaudeEnv(): Promise<Record<string, string>> {
  if (!claudeEnvPromise) {
    claudeEnvPromise = (async () => {
      const home = await homeDir();
      const normalizedHome = home.replace(/\/$/, "");
      const user = normalizedHome.split("/").filter(Boolean).pop() || "user";

      return {
        HOME: normalizedHome,
        USER: user,
        LOGNAME: user,
        SHELL: "/bin/zsh",
        PATH: [
          `${normalizedHome}/.local/bin`,
          `${normalizedHome}/.npm-global/bin`,
          `${normalizedHome}/.cargo/bin`,
          "/opt/homebrew/bin",
          "/opt/homebrew/sbin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          "/usr/sbin",
          "/sbin",
        ].join(":"),
        XDG_CONFIG_HOME: `${normalizedHome}/.config`,
        XDG_DATA_HOME: `${normalizedHome}/.local/share`,
        XDG_STATE_HOME: `${normalizedHome}/.local/state`,
      };
    })();
  }

  return claudeEnvPromise;
}

export async function spawnClaude(invocation: ClaudeInvocation): Promise<ClaudeResult> {
  const allowedTools = invocation.allowedTools ?? DEFAULT_TOOLS;
  const env = await getClaudeEnv();
  const args = [
    "-p",
    invocation.prompt,
    "--allowedTools",
    allowedTools.join(","),
  ];

  let lastError = "Failed to spawn Claude CLI";
  const aliasErrors: string[] = [];

  for (const commandName of CLAUDE_COMMAND_CANDIDATES) {
    try {
      const output = await Command.create(commandName, args, { env }).execute();

      if (output.code !== 0) {
        return {
          success: false,
          error:
            output.stderr ||
            output.stdout ||
            `Process exited with code ${output.code}`,
          exitCode: output.code,
        };
      }

      return {
        success: true,
        output: output.stdout,
        exitCode: output.code ?? undefined,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Failed to spawn Claude CLI";
      aliasErrors.push(`${commandName}: ${lastError}`);
    }
  }

  return {
    success: false,
    error:
      aliasErrors.length > 0
        ? aliasErrors.join(" | ")
        : `${lastError}. Checked command aliases: ${CLAUDE_COMMAND_CANDIDATES.join(", ")}.`,
  };
}

function formatSignals(signals: { title: string; url: string; source: string | null; published_at: string | null; snippet: string | null }[]): string {
  if (signals.length === 0) return "No signals collected.";
  return signals
    .map(
      (s, i) =>
        `[${i + 1}] TITLE: ${s.title}\nSOURCE: ${s.source ?? "Unknown"}\nDATE: ${s.published_at ?? "Unknown"}\nURL: ${s.url}\nSUMMARY: ${s.snippet ?? "No summary available"}`,
    )
    .join("\n\n---\n\n");
}

const WRITING_STANDARDS = `
WRITING STANDARDS:
- Active voice, direct statements
- Lead with the finding, not the setup
- No filler, no preamble, no restating the obvious
- No M-dashes
- No groups of three unless genuinely natural
- Never use: "this suggests," "it's worth noting," "importantly," "delve," "elevate," "innovative," "cutting-edge"
- Professional intelligence analyst tone`.trim();

export function buildAnalysisPrompt(input: {
  useCase: InvestigationUseCase;
  subject: string;
  scopeNotes: string;
  seedEntities: string[];
  signals: { title: string; url: string; source: string | null; published_at: string | null; snippet: string | null }[];
  humintInput?: string | null;
}): string {
  const { useCase, subject, scopeNotes, seedEntities, signals, humintInput } = input;
  const formattedSignals = formatSignals(signals);
  const entitiesLine = seedEntities.length > 0 ? seedEntities.join(", ") : "Not specified";

  const signalBlock = `COLLECTED INTELLIGENCE SIGNALS (${signals.length} sources):

${formattedSignals}`;

  const humintBlock = humintInput?.trim()
    ? `\nHUMINT INTELLIGENCE (contractor-sourced):\n---\n${humintInput.trim()}\n---\n`
    : "";

  if (useCase === "scoping") {
    return `You are a GenZen intelligence analyst. Produce a Scoping Brief from the intelligence signals below.

SUBJECT: ${subject}
SCOPE: ${scopeNotes || "Not specified"}
SEED ENTITIES: ${entitiesLine}

${signalBlock}
${humintBlock}
ANALYTICAL STANDARDS:
- Bayesian reasoning throughout — present findings as probability ranges, not certainties
- Competing hypotheses for every major finding
- Explicit confidence levels (High / Medium / Low) per key claim
- Separate observations from interpretations
- Flag information gaps explicitly

OUTPUT FORMAT — Intelligence Scoping Brief:

## Executive Assessment
2-3 sentences. The situation, who's involved, why it matters. Lead with the finding.

## Key Actors & Entities
For each identified actor or organisation: role, significance, relationship to subject, confidence level.

## Pattern Analysis
What patterns emerge across the signals? Exploitation vectors, control mechanisms, behavioural indicators. Include competing interpretations where evidence is ambiguous.

## Autonomy Impact
How does this situation affect the subject's autonomy? What is being constrained, threatened, or targeted?

## Flags & Gaps
What is missing from the picture? What specific evidence would change the assessment? What warrants immediate attention?

## Recommendations
Stage-appropriate next steps tied to confidence levels. Smallest effective interventions first.

${WRITING_STANDARDS}`;
  }

  if (useCase === "post") {
    return `You are a GenZen intelligence analyst and writer. Produce a public-facing intelligence article from the signals below.

SUBJECT/TOPIC: ${subject}
SCOPE: ${scopeNotes || "Not specified"}
SEED ENTITIES: ${entitiesLine}

${signalBlock}

First extract and structure the following from the signals:

1. WHAT'S HAPPENING — the pattern or trend, specific actors or groups involved
2. WHERE AND WHO — geographic and industry context, named entities
3. HOW IT WORKS — the mechanism of exploitation or threat, how it operates
4. EVIDENCE — specific incidents, documented cases, data points with sources
5. WHY IT MATTERS — stakes, who is affected, trajectory and direction

Then write the complete article in GenZen voice using that structure.

GENZEN VOICE STANDARDS:
- Intelligent, succinct, approachable — write like someone who operates in high-stakes environments daily
- Expert authority without academic or consulting jargon
- Lead with the finding, not the setup
- Use contractions and direct address where natural
- Frame evidence as discoveries: "The pattern is clear" not "The data suggests"
- Connect all analysis to real-world impact
- No M-dashes
- No groups of three unless genuinely natural
- No AI-favored phrases: "innovative," "elevate," "delve," "cutting-edge," "it's worth noting," "importantly"
- No empty praise or corporate flattery

OUTPUT: Suggested headline followed by the complete article draft, ready for review.

${WRITING_STANDARDS}`;
  }

  // sit_rep — Legacy Threat Analysis format
  const today = new Date();
  const monthYear = today.toLocaleString("en-GB", { month: "long", year: "numeric" });

  return `You are a GenZen intelligence analyst. Produce a Legacy Threat Analysis from the intelligence below.

SUBJECT: ${subject}
SCOPE: ${scopeNotes || "Not specified"}
SEED ENTITIES: ${entitiesLine}

${signalBlock}
${humintBlock}
Assess threat level based on evidence: Low / Medium / High / Critical.

Every paragraph must contain at least one source citation [^N] referencing the numbered signals above. Use specific figures, documented cases, and named entities throughout. All citations must reference actual signals provided.

Produce the report in this exact structure:

---

# LEGACY THREAT ANALYSIS™

**CONFIDENTIAL INTELLIGENCE BRIEFING**

Prepared By: GenZen Solutions
Date: ${monthYear}
Threat Level: [Your assessment]
Classification: Strategic Intelligence

---

## WHAT'S REALLY HAPPENING

Open with "Here's the situation:" — 2-3 sentences on the core threat with specifics and at least 2 source citations.

---

## THE BOTTOM LINE

### The Pattern We're Seeing
The systematic threat pattern with specific evidence. Organised, not random. Documented cases and financial impacts with sources.

### Why This Matters
How this pattern specifically threatens the subject's operations or situation. Operational vulnerabilities and exposure with evidence.

### The Real Risk
What this represents beyond surface-level impact. Scale and sophistication evidence with sources.

---

## HOW THEY'RE DOING IT

### [Primary Method Title]
Detailed explanation of execution. Include quantitative evidence of escalation, specific case studies with dollar amounts, sophistication indicators.

### [Secondary Method or Case Study]
- **Loss Amount**: [Specific figure with source]
- **Method**: [How with source]
- **Exploitation Vector**: [Vulnerability used with source]

**[Regulatory or Systematic Issues]**
List of systemic problems enabling these actions, with statistics and sources.

---

## WHERE PROTECTION IS FAILING

### [Critical Failure 1]
Specific protection failures with evidence: regulatory gaps, operational vulnerabilities, systematic weaknesses.

### [Critical Failure 2]
Second major vulnerability with evidence and sources.

### [Critical Failure 3]
Third major vulnerability with evidence and sources.

### Summary

| Attack Method | How They Do It | What It Cost |
|---|---|---|
| **[Method 1]** | [Description] | [Amount with source] |
| **[Method 2]** | [Description] | [Amount with source] |
| **[Method 3]** | [Description] | [Amount with source] |

---

## WHY TRADITIONAL APPROACHES AREN'T WORKING

### [Problem 1]
Why conventional protection is failing with evidence and sources.

### [Problem 2]
Second reason with evidence and sources.

**What Needs to Change**
- **[Change 1]** with source citation
- **[Change 2]** with source citation
- **[Change 3]** with source citation

---

## WHAT TO DO RIGHT NOW

### Next 72 Hours

**1. [Action Category 1]**
- [Specific action with source justification]
- [Specific action with source justification]

**2. [Action Category 2]**
- [Specific action with source justification]
- [Specific action with source justification]

**3. [Action Category 3]**
- [Specific action with source justification]
- [Specific action with source justification]

### Next 30 Days

**Week 1-2: [Phase 1 Title]**
- [Action with source justification]
- [Action with source justification]

**Week 3-4: [Phase 2 Title]**
- [Action with source justification]
- [Action with source justification]

### How You'll Know It's Working
- **[Metric 1]** with source basis
- **[Metric 2]** with source basis
- **[Metric 3]** with source basis

---

## THE BIGGER PICTURE

### [Solution Category 1]
Available solutions and proven methods with effectiveness evidence and sources.

**Proven Defenses**
- **[Method 1]**: [Effectiveness evidence with source]
- **[Method 2]**: [Effectiveness evidence with source]

---

## THE REALITY

4-5 paragraphs:
1. Systematic nature of the threat with key evidence
2. Why traditional protection has become inadequate with sources
3. The fundamental shift in the threat landscape with evidence
4. The necessity of proactive intelligence for protection
5. Clear implication of continuing under old assumptions

Urgent without hysteria. Supported by documented evidence throughout.

---

## SOURCES

[^1]: [Full URL from signal 1]
[^2]: [Full URL from signal 2]
[Continue for all signals cited]

*Complete source list available upon request*

---

LANGUAGE STANDARDS:
- Use contractions and direct address ("you," "your operations")
- Open sections with "Here's what's happening" style language
- Frame evidence as discoveries: "The numbers tell the story"
- Connect all analysis to reader impact
- No M-dashes
- No academic or consulting jargon
- No AI-favored phrases`;
}

export function buildGraphExtractionPrompt(
  signals: { title: string; snippet: string | null; content?: string | null }[],
): string {
  const signalText = signals
    .map((s, i) => {
      const parts = [`[${i + 1}] ${s.title}`];
      if (s.snippet) {
        parts.push(`SUMMARY: ${s.snippet}`);
      }
      if (s.content) {
        parts.push(`CONTENT:\n${s.content}`);
      }
      return parts.join("\n");
    })
    .join("\n\n");

  return `You are an intelligence analyst. Extract entities and relationships from these signals.

SIGNALS:
${signalText}

RULES:
- Only include relationships EXPLICITLY stated in the signal text (e.g. "X founded Y", "X was arrested in Y", "X controls Z")
- Do NOT connect entities merely because they appear in the same article
- Prefer the CONTENT block over headlines when they conflict; headlines may be compressed or ambiguous
- Relationship labels must be short verb phrases: "controls", "founded", "arrested in", "linked to", "operates in", "leads", "targets"
- Maximum 20 entities total, 20 relationships total
- Entity types: person, organisation, location, event
- Keep entity labels concise — proper names only, no generic terms

Return ONLY valid JSON with no markdown fences and no explanation:
{"entities":[{"label":"string","type":"person|organisation|location|event"}],"relationships":[{"source":"exact entity label","target":"exact entity label","relation":"short label"}]}`;
}

/**
 * Build report prompt for the Reports view (standalone trigger analysis)
 */
export function buildReportPrompt(
  reportType: ReportType,
  signals: { title: string; snippet: string; source: string }[],
): string {
  const signalContext = signals
    .map((s, i) => `${i + 1}. ${s.title}\n   Source: ${s.source}\n   ${s.snippet}`)
    .join("\n\n");

  const reportTypeInstructions = {
    internal: "Analyst-facing summary. Include methodology, confidence levels, and gaps.",
    client: "Diagnostic framing. No methodology exposed. Focus on implications.",
    deep: "Full findings with evidence register, competing hypotheses, confidence levels.",
    public: "Accessible language. Context provided. Sourced but not academic.",
  };

  return `You are an intelligence analyst. Generate a ${reportType} intelligence report.

${reportTypeInstructions[reportType]}

Source Signals:
${signalContext}

Output: A well-structured markdown report with appropriate sections for the audience type.`;
}
