// Tauri shell plugin integration for spawning claude -p
import { Command } from "@tauri-apps/plugin-shell";

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

/**
 * Spawn Claude CLI with a prompt
 * Usage: spawnClaude({ prompt: "Analyze this data..." })
 */
export async function spawnClaude(invocation: ClaudeInvocation): Promise<ClaudeResult> {
  try {
    const allowedTools = invocation.allowedTools ?? DEFAULT_TOOLS;
    
    const cmd = Command.create("claude", [
      "-p",
      invocation.prompt,
      "--allowedTools",
      allowedTools.join(","),
    ]);

    const output = await cmd.execute();

    if (output.code !== 0) {
      return {
        success: false,
        error: output.stderr || `Process exited with code ${output.code}`,
        exitCode: output.code,
      };
    }

    return {
      success: true,
      output: output.stdout,
      exitCode: output.code ?? undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to spawn Claude CLI",
    };
  }
}

/**
 * Build investigation phase prompt
 */
export function buildPhasePrompt(
  caseId: string,
  phase: number,
  context: {
    subjectDefinition?: string;
    investigationScope?: string;
    seedEntities?: string[];
    signals?: { title: string; snippet: string }[];
  }
): string {
  const basePath = `~/vault/intelligence/investigations/${caseId}`;
  
  switch (phase) {
    case 1: // Plan
      return `You are an intelligence analyst. Create an investigation plan for:

Subject: ${context.subjectDefinition}
Scope: ${context.investigationScope}
Seed Entities: ${context.seedEntities?.join(", ") ?? "None"}

Output: Create ${basePath}/plan.md with:
1. Executive Summary
2. Intelligence Requirements
3. Collection Strategy
4. Source Evaluation Criteria
5. Timeline and Milestones

Use markdown format.`;

    case 2: // Collect
      return `You are an intelligence analyst. Execute collection for investigation ${caseId}.

Based on the plan at ${basePath}/plan.md, conduct comprehensive collection targeting the seed entities.

Output: Update ${basePath}/collection.md with:
1. Sources Consulted
2. Data Acquired
3. Gap Analysis
4. Next Collection Actions`;

    case 3: // Collate
      return `You are an intelligence analyst. Extract and structure entities from investigation ${caseId}.

Review all collected data and identify POLE entities (Person, Object, Location, Event).

Output: Create ${basePath}/entities.md with:
1. Person Entities (names, roles, relationships)
2. Organization Entities
3. Location Entities
4. Event Timeline References
5. Relationship Matrix`;

    case 4: // Timeline
      return `You are an intelligence analyst. Reconstruct timeline for investigation ${caseId}.

Using entities from ${basePath}/entities.md, create chronological reconstruction.

Output: Create ${basePath}/timeline.md with:
1. Chronological Event List (UTC normalized)
2. Temporal Gap Analysis
3. Contradiction Flags
4. Confidence Levels per Event`;

    case 5: // ACH (Analysis of Competing Hypotheses)
      return `You are an intelligence analyst. Conduct ACH for investigation ${caseId}.

Evaluate all hypotheses against available evidence.

Output: Create ${basePath}/ach.md with:
1. Hypothesis List (minimum 3)
2. Evidence Matrix
3. Inconsistency Principle Scoring
4. Most Likely Hypothesis Assessment`;

    case 6: // Report
      return `You are an intelligence analyst. Assemble final report for investigation ${caseId}.

Synthesize all phases into coherent intelligence product.

Output: Create ${basePath}/report.md with:
1. Executive Summary
2. Key Findings
3. Evidence Register
4. Confidence Assessments
5. Recommendations`;

    default:
      return `Investigation ${caseId} - Phase ${phase}`;
  }
}

/**
 * Build report prompt for Trigger Analysis
 */
export function buildReportPrompt(
  reportType: "internal" | "client" | "deep" | "public",
  signals: { title: string; snippet: string; source: string }[]
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
