import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  FolderOpen,
  Loader2,
  Plus,
  Play,
  Save,
  Target,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addSignalToInvestigation,
  createInvestigation,
  createVaultFile,
  getInvestigation,
  listSignals,
  listInvestigations,
  listInvestigationSignals,
  removeSignalFromInvestigation,
  saveInvestigationPlan,
  updateInvestigationSignal,
  updateInvestigationPhase,
} from "@/lib/data";
import { spawnClaude, buildPhasePrompt } from "@/lib/shell";
import { ensureInvestigationDirectory, readVaultFile, writeVaultFile } from "@/lib/vault";
import type { VaultFileType } from "@/lib/types";
// Note: Investigation type imported from @/lib/types in data.ts

const PHASES = [
  { id: 1, name: "Plan", description: "Scope and PLAN validation" },
  { id: 2, name: "Collect", description: "Intelligence gathering" },
  { id: 3, name: "Collate", description: "Entity extraction" },
  { id: 4, name: "Timeline", description: "Chronological reconstruction" },
  { id: 5, name: "ACH", description: "Hypothesis evaluation" },
  { id: 6, name: "Report", description: "Final assembly" },
] as const;

const REPORT_TYPES = [
  { id: "internal", label: "Internal Sweep Summary" },
  { id: "client", label: "Initial Client Assessment" },
  { id: "deep", label: "Deep Case Report" },
  { id: "public", label: "Public Brief" },
] as const;

const PHASE_GATE_KEYS = [
  "phase_1_plan_complete",
  "phase_2_collect_complete",
  "phase_3_collate_complete",
  "phase_4_timeline_complete",
  "phase_5_ach_complete",
  "phase_6_report_complete",
] as const;

const PHASE_FILE_TYPES: Record<number, VaultFileType> = {
  1: "plan",
  2: "collect",
  3: "collate",
  4: "timeline",
  5: "ach",
  6: "report",
};

const PHASE_FILE_NAMES: Record<number, string> = {
  1: "plan.md",
  2: "collection.md",
  3: "entities.md",
  4: "timeline.md",
  5: "ach.md",
  6: "report.md",
};

const COLLECT_MIN_SIGNALS = 3;
const COLLECT_REVIEWED_MARKER = "[reviewed]";

function getPhaseGateKey(phase: number) {
  return PHASE_GATE_KEYS[Math.max(0, Math.min(PHASE_GATE_KEYS.length - 1, phase - 1))];
}

function hasRequiredPhaseGates(phase: number, phaseGates: Record<string, boolean>) {
  if (phase <= 1) return true;

  for (let step = 1; step < phase; step += 1) {
    if (!phaseGates[getPhaseGateKey(step)]) {
      return false;
    }
  }

  return true;
}

function getPhaseGateStatus(
  phase: number,
  phaseGates: Record<string, boolean>,
): "green" | "amber" | "red" {
  if (!hasRequiredPhaseGates(phase, phaseGates)) return "red";
  return phaseGates[getPhaseGateKey(phase)] ? "green" : "amber";
}

function buildPhaseArtifactContent(phase: number, rawOutput: string) {
  const phaseName = PHASES[phase - 1]?.name ?? `Phase ${phase}`;
  const generatedAt = new Date().toISOString();
  return `# ${phaseName}\n\nGenerated at: ${generatedAt}\n\n---\n\n${rawOutput.trim()}\n`;
}

function isSignalReviewed(notes: string | null | undefined) {
  return (notes ?? "").includes(COLLECT_REVIEWED_MARKER);
}

function withReviewedMarker(notes: string | null | undefined, reviewed: boolean) {
  const raw = (notes ?? "").replace(COLLECT_REVIEWED_MARKER, "").trim();
  if (!reviewed) return raw.length > 0 ? raw : null;
  return raw.length > 0 ? `${COLLECT_REVIEWED_MARKER} ${raw}` : COLLECT_REVIEWED_MARKER;
}

function parseEntityMetrics(content: string | null) {
  if (!content) {
    return {
      person: 0,
      organisation: 0,
      location: 0,
      event: 0,
      total: 0,
    };
  }

  const lines = content.split("\n");
  let currentType: "person" | "organisation" | "location" | "event" | null = null;
  const counts = {
    person: 0,
    organisation: 0,
    location: 0,
    event: 0,
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^#+\s+person/i.test(line)) currentType = "person";
    else if (/^#+\s+(organization|organisation)/i.test(line)) currentType = "organisation";
    else if (/^#+\s+location/i.test(line)) currentType = "location";
    else if (/^#+\s+event/i.test(line)) currentType = "event";
    else if (/^#+\s+/.test(line)) currentType = null;

    if (currentType && /^(-|\*|\d+\.)\s+/.test(line)) {
      counts[currentType] += 1;
    }
  }

  return {
    ...counts,
    total: counts.person + counts.organisation + counts.location + counts.event,
  };
}

function parseTimelineMetrics(content: string | null) {
  if (!content) return { eventCount: 0, unresolvedContradictions: 0 };

  const eventCount =
    content.match(
      /^(-|\*|\d+\.)\s+.*(\d{4}-\d{2}-\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/gim,
    )?.length ?? 0;
  const unresolvedContradictions =
    content.match(/(unresolved|open|pending).{0,40}contradiction|contradiction.{0,40}(unresolved|open|pending)/gim)?.length ?? 0;

  return { eventCount, unresolvedContradictions };
}

function parseAchMetrics(content: string | null) {
  if (!content) return { hypothesisCount: 0, assessmentCells: 0 };

  const hypothesisCount =
    content.match(/^(-|\*|\d+\.)\s*(hypothesis|h\d+\b)|^#+\s*(hypothesis|h\d+\b)/gim)?.length ?? 0;
  const assessmentCells = content.match(/\b(consistent|inconsistent|neutral)\b/gim)?.length ?? 0;

  return { hypothesisCount, assessmentCells };
}

export function InvestigationView() {
  const queryClient = useQueryClient();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [newCaseName, setNewCaseName] = useState("");
  const [isRunningPhase, setIsRunningPhase] = useState(false);
  const [phaseOutput, setPhaseOutput] = useState<string | null>(null);

  // Plan form state
  const [planForm, setPlanForm] = useState({
    subjectDefinition: "",
    investigationScope: "",
    proportionality: false,
    legality: false,
    accountability: false,
    necessity: false,
    seedEntities: "",
    knownHypotheses: "",
  });

  // Report type selection
  const [selectedReportType, setSelectedReportType] = useState<typeof REPORT_TYPES[number]["id"]>("internal");

  const { data: investigations, isLoading } = useQuery({
    queryKey: ["investigations"],
    queryFn: listInvestigations,
  });

  const { data: selectedInvestigation } = useQuery({
    queryKey: ["investigation", selectedCaseId],
    queryFn: () => getInvestigation(selectedCaseId!),
    enabled: !!selectedCaseId,
  });

  const { data: investigationSignals } = useQuery({
    queryKey: ["investigation-signals", selectedInvestigation?.id],
    queryFn: () => listInvestigationSignals(selectedInvestigation!.id),
    enabled: !!selectedInvestigation?.id,
  });

  const { data: savedSignals } = useQuery({
    queryKey: ["signals", "saved-for-investigation"],
    queryFn: async () => {
      const allSignals = await listSignals();
      return allSignals.filter((signal) => signal.status === "saved");
    },
  });

  // Sync plan form with selected investigation
  useEffect(() => {
    if (selectedInvestigation) {
      setPlanForm({
        subjectDefinition: selectedInvestigation.subject_definition ?? "",
        investigationScope: selectedInvestigation.investigation_scope ?? "",
        proportionality: selectedInvestigation.plan_proportionality ?? false,
        legality: selectedInvestigation.plan_legality ?? false,
        accountability: selectedInvestigation.plan_accountability ?? false,
        necessity: selectedInvestigation.plan_necessity ?? false,
        seedEntities: selectedInvestigation.seed_entities?.join("\n") ?? "",
        knownHypotheses: selectedInvestigation.known_hypotheses?.join("\n") ?? "",
      });
    }
  }, [selectedInvestigation]);

  const createMutation = useMutation({
    mutationFn: createInvestigation,
    onSuccess: (data) => {
      setNewCaseName("");
      setSelectedCaseId(data.case_id);
      void queryClient.invalidateQueries({ queryKey: ["investigations"] });
    },
  });

  const savePlanMutation = useMutation({
    mutationFn: (input: Parameters<typeof saveInvestigationPlan>[1]) =>
      saveInvestigationPlan(selectedCaseId!, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["investigation", selectedCaseId] });
    },
  });

  const advancePhaseMutation = useMutation({
    mutationFn: (input: { phase: number; gateData?: Record<string, boolean> }) =>
      updateInvestigationPhase(selectedCaseId!, input.phase, input.gateData),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["investigation", selectedCaseId] });
    },
  });

  const addSignalMutation = useMutation({
    mutationFn: (signalId: number) =>
      addSignalToInvestigation({
        investigationId: selectedInvestigation!.id,
        signalId,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["investigation-signals", selectedInvestigation?.id],
      });
    },
  });

  const removeSignalMutation = useMutation({
    mutationFn: (investigationSignalId: number) => removeSignalFromInvestigation(investigationSignalId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["investigation-signals", selectedInvestigation?.id],
      });
    },
  });

  const reviewSignalMutation = useMutation({
    mutationFn: (input: { investigationSignalId: number; reviewed: boolean; notes: string | null }) =>
      updateInvestigationSignal(input.investigationSignalId, {
        notes: withReviewedMarker(input.notes, input.reviewed),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["investigation-signals", selectedInvestigation?.id],
      });
    },
  });

  const selectedPhase = selectedInvestigation?.current_phase ?? 1;
  const selectedPhaseGates = selectedInvestigation?.phase_gates ?? {};
  const collateArtifactPath = useMemo(
    () =>
      selectedInvestigation
        ? `investigations/${selectedInvestigation.case_id}/${PHASE_FILE_NAMES[3]}`
        : null,
    [selectedInvestigation],
  );
  const timelineArtifactPath = useMemo(
    () =>
      selectedInvestigation
        ? `investigations/${selectedInvestigation.case_id}/${PHASE_FILE_NAMES[4]}`
        : null,
    [selectedInvestigation],
  );
  const achArtifactPath = useMemo(
    () =>
      selectedInvestigation
        ? `investigations/${selectedInvestigation.case_id}/${PHASE_FILE_NAMES[5]}`
        : null,
    [selectedInvestigation],
  );
  const { data: collateArtifactContent, isLoading: isLoadingCollateArtifact } = useQuery({
    queryKey: ["investigation-phase-artifact", selectedInvestigation?.case_id, 3],
    queryFn: () => readVaultFile(collateArtifactPath!),
    enabled: !!collateArtifactPath,
  });
  const { data: timelineArtifactContent, isLoading: isLoadingTimelineArtifact } = useQuery({
    queryKey: ["investigation-phase-artifact", selectedInvestigation?.case_id, 4],
    queryFn: () => readVaultFile(timelineArtifactPath!),
    enabled: !!timelineArtifactPath,
  });
  const { data: achArtifactContent, isLoading: isLoadingAchArtifact } = useQuery({
    queryKey: ["investigation-phase-artifact", selectedInvestigation?.case_id, 5],
    queryFn: () => readVaultFile(achArtifactPath!),
    enabled: !!achArtifactPath,
  });
  const attachedSignalIdSet = useMemo(
    () => new Set((investigationSignals ?? []).map((signal) => signal.signal_id)),
    [investigationSignals],
  );
  const importableSavedSignals = useMemo(
    () => (savedSignals ?? []).filter((signal) => !attachedSignalIdSet.has(signal.id)),
    [attachedSignalIdSet, savedSignals],
  );
  const reviewedSignalCount = useMemo(
    () => (investigationSignals ?? []).filter((signal) => isSignalReviewed(signal.notes)).length,
    [investigationSignals],
  );
  const collateMetrics = useMemo(
    () => parseEntityMetrics(collateArtifactContent ?? null),
    [collateArtifactContent],
  );
  const timelineMetrics = useMemo(
    () => parseTimelineMetrics(timelineArtifactContent ?? null),
    [timelineArtifactContent],
  );
  const achMetrics = useMemo(() => parseAchMetrics(achArtifactContent ?? null), [achArtifactContent]);
  const collateGateComplete = collateMetrics.total >= 3;
  const timelineGateComplete =
    timelineMetrics.eventCount >= 3 && timelineMetrics.unresolvedContradictions === 0;
  const achGateComplete = achMetrics.hypothesisCount >= 3 && achMetrics.assessmentCells >= 3;
  const collectGateComplete =
    (investigationSignals?.length ?? 0) >= COLLECT_MIN_SIGNALS &&
    reviewedSignalCount >= COLLECT_MIN_SIGNALS;
  const currentArtifactContent = useMemo(() => {
    if (selectedPhase === 3) return collateArtifactContent ?? null;
    if (selectedPhase === 4) return timelineArtifactContent ?? null;
    if (selectedPhase === 5) return achArtifactContent ?? null;
    return null;
  }, [achArtifactContent, collateArtifactContent, selectedPhase, timelineArtifactContent]);
  const isLoadingCurrentArtifact =
    (selectedPhase === 3 && isLoadingCollateArtifact) ||
    (selectedPhase === 4 && isLoadingTimelineArtifact) ||
    (selectedPhase === 5 && isLoadingAchArtifact);

  function buildPlanPayload() {
    return {
      subjectDefinition: planForm.subjectDefinition.trim(),
      investigationScope: planForm.investigationScope.trim(),
      proportionality: planForm.proportionality,
      legality: planForm.legality,
      accountability: planForm.accountability,
      necessity: planForm.necessity,
      seedEntities: planForm.seedEntities
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      knownHypotheses: planForm.knownHypotheses
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    };
  }

  async function handleRunPhase(phase: number) {
    if (!selectedInvestigation) return;

    if (!hasRequiredPhaseGates(phase, selectedPhaseGates)) {
      setPhaseOutput("Complete prior phases before running this phase.");
      return;
    }

    if (phase === 1 && !planGateComplete) {
      setPhaseOutput("Complete PLAN fields and validations before running Phase 1.");
      return;
    }
    if (phase === 2 && !collectGateComplete) {
      setPhaseOutput(
        `Attach and review at least ${COLLECT_MIN_SIGNALS} signals before running Phase 2.`,
      );
      return;
    }
    if (phase === 4 && !collateGateComplete) {
      setPhaseOutput("Phase 4 requires a confirmed Collate artifact with at least 3 entities.");
      return;
    }
    if (phase === 5 && !timelineGateComplete) {
      setPhaseOutput(
        "Phase 5 requires Timeline quality gate: at least 3 events and zero unresolved contradictions.",
      );
      return;
    }
    if (phase === 6 && !achGateComplete) {
      setPhaseOutput(
        "Phase 6 requires ACH quality gate: at least 3 hypotheses and assessed evidence cells.",
      );
      return;
    }

    setIsRunningPhase(true);
    setPhaseOutput(null);

    try {
      // Ensure directory exists
      await ensureInvestigationDirectory(selectedInvestigation.case_id);

      const planPayload = buildPlanPayload();
      if (phase === 1) {
        await savePlanMutation.mutateAsync(planPayload);
      }

      // Build prompt for this phase
      const prompt = buildPhasePrompt(selectedInvestigation.case_id, phase, {
        subjectDefinition:
          phase === 1 ? planPayload.subjectDefinition : selectedInvestigation.subject_definition ?? undefined,
        investigationScope:
          phase === 1 ? planPayload.investigationScope : selectedInvestigation.investigation_scope ?? undefined,
        seedEntities:
          phase === 1 ? planPayload.seedEntities : selectedInvestigation.seed_entities ?? undefined,
        reportType: selectedReportType,
      });

      const result = await spawnClaude({ prompt });

      if (result.success) {
        const output = result.output?.trim() || "Phase completed successfully.";
        const artifactPath = `investigations/${selectedInvestigation.case_id}/${PHASE_FILE_NAMES[phase]}`;
        const artifactContent = buildPhaseArtifactContent(phase, output);

        await writeVaultFile(artifactPath, artifactContent);
        await createVaultFile({
          caseId: selectedInvestigation.case_id,
          phase,
          fileType: PHASE_FILE_TYPES[phase],
          filePath: artifactPath,
          fileName: PHASE_FILE_NAMES[phase],
          reportType: phase === 6 ? selectedReportType : undefined,
        });
        await queryClient.invalidateQueries({
          queryKey: ["investigation-phase-artifact", selectedInvestigation.case_id],
          exact: false,
        });

        const nextGates = {
          ...selectedPhaseGates,
          [getPhaseGateKey(phase)]: true,
        };
        await advancePhaseMutation.mutateAsync({
          phase: Math.min(6, phase + 1),
          gateData: nextGates,
        });
        setPhaseOutput(output);
      } else {
        setPhaseOutput(`Error: ${result.error}`);
      }
    } catch (error) {
      setPhaseOutput(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsRunningPhase(false);
    }
  }

  async function handleSavePlan() {
    if (!selectedInvestigation || !planGateComplete) return;

    try {
      const nextGates = {
        ...selectedPhaseGates,
        [getPhaseGateKey(1)]: true,
      };
      await savePlanMutation.mutateAsync(buildPlanPayload());
      await advancePhaseMutation.mutateAsync({
        phase: Math.max(2, selectedPhase),
        gateData: nextGates,
      });
      setPhaseOutput("Plan saved and Phase 1 gate marked complete.");
    } catch (error) {
      setPhaseOutput(`Error: ${error instanceof Error ? error.message : "Failed to save plan."}`);
    }
  }

  const planGateComplete = useMemo(() => {
    return (
      planForm.subjectDefinition.length > 0 &&
      planForm.investigationScope.length > 0 &&
      planForm.proportionality &&
      planForm.legality &&
      planForm.accountability &&
      planForm.necessity
    );
  }, [planForm]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      {/* Sidebar - Case List */}
      <Card>
        <CardHeader>
          <CardTitle>Investigations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              placeholder="New case name..."
              value={newCaseName}
              onChange={(e) => setNewCaseName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newCaseName.trim()) {
                  createMutation.mutate({ name: newCaseName.trim() });
                }
              }}
            />
            <Button
              className="w-full"
              onClick={() => createMutation.mutate({ name: newCaseName })}
              disabled={!newCaseName.trim() || createMutation.isPending}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Case
            </Button>
          </div>

          <div className="space-y-2">
            {(investigations ?? []).map((inv) => {
              const gateStatus = getPhaseGateStatus(inv.current_phase, inv.phase_gates ?? {});

              return (
                <button
                  key={inv.case_id}
                  onClick={() => setSelectedCaseId(inv.case_id)}
                  className={`w-full text-left rounded-2xl border p-4 transition ${
                    selectedCaseId === inv.case_id
                      ? "border-[var(--accent)] bg-[var(--surface)]"
                      : "border-[var(--border)] hover:bg-[var(--surface)]/50"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-[var(--foreground)]">{inv.name}</p>
                      <p className="text-xs text-[var(--foreground-muted)]">{inv.case_id}</p>
                    </div>
                    <Badge variant={inv.status === "active" ? "success" : "neutral"}>
                      {inv.status}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Clock className="h-3 w-3 text-[var(--foreground-muted)]" />
                    <span className="text-xs text-[var(--foreground-muted)]">
                      Phase {inv.current_phase}: {PHASES[inv.current_phase - 1]?.name}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em]">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        gateStatus === "green"
                          ? "bg-green-500"
                          : gateStatus === "amber"
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                    />
                    <span className="text-[var(--foreground-dim)]">Gate {gateStatus}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="space-y-6">
        {selectedInvestigation ? (
          <>
            {/* Phase Stepper */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  {PHASES.map((phase, idx) => {
                    const isActive = phase.id === selectedPhase;
                    const isCompleted = phase.id < selectedPhase;
                    const isLocked = phase.id > selectedPhase;
                    const gateStatus = getPhaseGateStatus(phase.id, selectedPhaseGates);

                    return (
                      <div key={phase.id} className="flex items-center">
                        <button
                          onClick={() => {
                            if (!isLocked) {
                              // Allow viewing previous phases
                            }
                          }}
                          className={`flex flex-col items-center gap-2 transition ${
                            isLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                          }`}
                          disabled={isLocked}
                        >
                          <div
                            className={`h-10 w-10 rounded-full flex items-center justify-center border-2 ${
                              isActive
                                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                                : isCompleted
                                ? "border-green-500 bg-green-500/10 text-green-500"
                                : "border-[var(--border)] text-[var(--foreground-muted)]"
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : (
                              <span className="text-sm font-semibold">{phase.id}</span>
                            )}
                          </div>
                          <div className="text-center">
                            <p
                              className={`text-xs font-medium ${
                                isActive ? "text-[var(--foreground)]" : "text-[var(--foreground-muted)]"
                              }`}
                            >
                              {phase.name}
                            </p>
                            <p
                              className={`text-[10px] uppercase tracking-[0.12em] ${
                                gateStatus === "green"
                                  ? "text-green-500"
                                  : gateStatus === "amber"
                                  ? "text-amber-500"
                                  : "text-red-500"
                              }`}
                            >
                              {gateStatus}
                            </p>
                          </div>
                        </button>
                        {idx < PHASES.length - 1 && (
                          <ChevronRight className="h-4 w-4 text-[var(--border)] mx-2" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Phase Content */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      Phase {selectedPhase}: {PHASES[selectedPhase - 1]?.name}
                    </CardTitle>
                    <p className="text-sm text-[var(--foreground-muted)] mt-1">
                      {PHASES[selectedPhase - 1]?.description}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleRunPhase(selectedPhase)}
                      disabled={
                        isRunningPhase ||
                        !hasRequiredPhaseGates(selectedPhase, selectedPhaseGates) ||
                        (selectedPhase === 1 && !planGateComplete) ||
                        (selectedPhase === 2 && !collectGateComplete) ||
                        (selectedPhase === 4 && !collateGateComplete) ||
                        (selectedPhase === 5 && !timelineGateComplete) ||
                        (selectedPhase === 6 && !achGateComplete)
                      }
                    >
                      {isRunningPhase ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Run Phase
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {!hasRequiredPhaseGates(selectedPhase, selectedPhaseGates) && (
                  <div className="flex items-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-200">
                    <AlertCircle className="h-4 w-4" />
                    This phase is locked until all earlier phase gates are completed.
                  </div>
                )}

                {/* Phase 1: Plan Form */}
                {selectedPhase === 1 && (
                  <div className="space-y-4">
                    <div className="grid gap-4">
                      <div>
                        <label className="text-sm font-medium">Subject Definition</label>
                        <Textarea
                          value={planForm.subjectDefinition}
                          onChange={(e) => setPlanForm({ ...planForm, subjectDefinition: e.target.value })}
                          placeholder="Who or what is the target of this investigation?"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Investigation Scope</label>
                        <Textarea
                          value={planForm.investigationScope}
                          onChange={(e) => setPlanForm({ ...planForm, investigationScope: e.target.value })}
                          placeholder="What are the boundaries of this investigation?"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--border)] p-4">
                      <p className="text-sm font-medium mb-3">PLAN Validation</p>
                      <div className="grid gap-2">
                        {[
                          { key: "proportionality", label: "Proportionality — Response matches the issue" },
                          { key: "legality", label: "Legality — Within legal and ethical boundaries" },
                          { key: "accountability", label: "Accountability — Clear ownership and oversight" },
                          { key: "necessity", label: "Necessity — Required and justified" },
                        ].map((item) => (
                          <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={planForm[item.key as keyof typeof planForm] as boolean}
                              onChange={(e) =>
                                setPlanForm({ ...planForm, [item.key]: e.target.checked })
                              }
                              className="rounded border-[var(--border)]"
                            />
                            <span className="text-sm">{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-4">
                      <div>
                        <label className="text-sm font-medium">Seed Entities (one per line)</label>
                        <Textarea
                          value={planForm.seedEntities}
                          onChange={(e) => setPlanForm({ ...planForm, seedEntities: e.target.value })}
                          placeholder="People, organizations, or entities to investigate..."
                          rows={3}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Known Hypotheses (one per line)</label>
                        <Textarea
                          value={planForm.knownHypotheses}
                          onChange={(e) => setPlanForm({ ...planForm, knownHypotheses: e.target.value })}
                          placeholder="Initial theories or questions to test..."
                          rows={3}
                        />
                      </div>
                    </div>

                    <Button
                      onClick={() => {
                        void handleSavePlan();
                      }}
                      disabled={
                        !planGateComplete || savePlanMutation.isPending || advancePhaseMutation.isPending
                      }
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Plan & Advance
                    </Button>

                    {!planGateComplete && (
                      <div className="flex items-center gap-2 text-sm text-amber-500">
                        <AlertCircle className="h-4 w-4" />
                        Complete all PLAN validations and required fields to proceed
                      </div>
                    )}
                  </div>
                )}

                {/* Phase 2: Collect */}
                {selectedPhase === 2 && (
                  <div className="space-y-4">
                    <p className="text-sm text-[var(--foreground-muted)]">
                      Attach saved signals and review them before running collection.
                    </p>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-3 text-sm">
                      <p className="font-medium text-[var(--foreground)]">
                        Collection gate: {reviewedSignalCount}/{COLLECT_MIN_SIGNALS} reviewed
                      </p>
                      <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                        Require at least {COLLECT_MIN_SIGNALS} attached and reviewed signals.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--foreground-muted)]">
                        Attached Signals
                      </p>
                      {(investigationSignals ?? []).length === 0 ? (
                        <div className="text-center py-8 text-[var(--foreground-muted)]">
                          No signals attached yet.
                        </div>
                      ) : (
                        (investigationSignals ?? []).map((sig) => (
                          <div
                            key={sig.id}
                            className="rounded-xl border border-[var(--border)] p-3 space-y-2"
                          >
                            <p className="font-medium text-sm text-[var(--foreground)]">
                              {sig.intel_signals?.title}
                            </p>
                            <p className="text-xs text-[var(--foreground-muted)]">
                              {sig.intel_signals?.source}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                variant={isSignalReviewed(sig.notes) ? "secondary" : "ghost"}
                                onClick={() =>
                                  reviewSignalMutation.mutate({
                                    investigationSignalId: sig.id,
                                    reviewed: !isSignalReviewed(sig.notes),
                                    notes: sig.notes ?? null,
                                  })
                                }
                                disabled={reviewSignalMutation.isPending}
                              >
                                {isSignalReviewed(sig.notes) ? "Reviewed" : "Mark reviewed"}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => removeSignalMutation.mutate(sig.id)}
                                disabled={removeSignalMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--foreground-muted)]">
                        Import Saved Signals
                      </p>
                      {importableSavedSignals.length === 0 ? (
                        <div className="text-center py-6 text-[var(--foreground-muted)]">
                          No additional saved signals available.
                        </div>
                      ) : (
                        importableSavedSignals.map((signal) => (
                          <div
                            key={signal.id}
                            className="rounded-xl border border-[var(--border)] p-3 flex items-start justify-between gap-3"
                          >
                            <div>
                              <p className="font-medium text-sm text-[var(--foreground)]">{signal.title}</p>
                              <p className="text-xs text-[var(--foreground-muted)]">{signal.source}</p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => addSignalMutation.mutate(signal.id)}
                              disabled={addSignalMutation.isPending}
                            >
                              Add
                            </Button>
                          </div>
                        ))
                      )}
                    </div>

                    {!collectGateComplete && (
                      <div className="flex items-center gap-2 text-sm text-amber-500">
                        <AlertCircle className="h-4 w-4" />
                        Attach and review at least {COLLECT_MIN_SIGNALS} signals to unlock Phase 2 run.
                      </div>
                    )}
                  </div>
                )}

                {/* Phase 3-5: Artifact-aware views */}
                {selectedPhase >= 3 && selectedPhase <= 5 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--surface)]/50">
                      <Target className="h-5 w-5 text-[var(--accent)]" />
                      <p className="text-sm">
                        Review the current artifact quality before running the next analytical phase.
                      </p>
                    </div>

                    {selectedPhase === 3 ? (
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-3 text-sm">
                        <p className="font-medium text-[var(--foreground)]">
                          Entity register: {collateMetrics.total} extracted
                        </p>
                        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                          Persons {collateMetrics.person} · Organisations {collateMetrics.organisation} · Locations {collateMetrics.location} · Events {collateMetrics.event}
                        </p>
                        {!collateGateComplete ? (
                          <p className="mt-2 text-xs text-amber-500">
                            Gate requires at least 3 extracted entities.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {selectedPhase === 4 ? (
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-3 text-sm">
                        <p className="font-medium text-[var(--foreground)]">
                          Timeline quality: {timelineMetrics.eventCount} dated events
                        </p>
                        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                          Unresolved contradictions: {timelineMetrics.unresolvedContradictions}
                        </p>
                        {!timelineGateComplete ? (
                          <p className="mt-2 text-xs text-amber-500">
                            Gate requires at least 3 events and zero unresolved contradictions.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {selectedPhase === 5 ? (
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-3 text-sm">
                        <p className="font-medium text-[var(--foreground)]">
                          ACH matrix: {achMetrics.hypothesisCount} hypotheses
                        </p>
                        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                          Evidence assessments: {achMetrics.assessmentCells}
                        </p>
                        {!achGateComplete ? (
                          <p className="mt-2 text-xs text-amber-500">
                            Gate requires at least 3 hypotheses and assessed evidence cells.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/20 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--foreground-muted)] mb-2">
                        Current Artifact
                      </p>
                      {isLoadingCurrentArtifact ? (
                        <div className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading artifact...
                        </div>
                      ) : currentArtifactContent ? (
                        <pre className="text-xs text-[var(--foreground-muted)] whitespace-pre-wrap overflow-auto max-h-80">
                          {currentArtifactContent}
                        </pre>
                      ) : (
                        <p className="text-sm text-[var(--foreground-muted)]">
                          No artifact file found yet for this phase.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Phase 6: Report */}
                {selectedPhase === 6 && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Report Type</label>
                      <select
                        className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm"
                        value={selectedReportType}
                        onChange={(e) => setSelectedReportType(e.target.value as typeof selectedReportType)}
                      >
                        {REPORT_TYPES.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      Generate the final intelligence report based on all previous phases.
                    </p>
                  </div>
                )}

                {/* Phase Output */}
                {phaseOutput && (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/50 p-4">
                    <p className="text-sm font-medium mb-2">Phase Output</p>
                    <pre className="text-xs text-[var(--foreground-muted)] whitespace-pre-wrap overflow-auto max-h-64">
                      {phaseOutput}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <FolderOpen className="h-12 w-12 mx-auto text-[var(--foreground-muted)] mb-4" />
              <p className="text-lg font-medium text-[var(--foreground)]">Select an investigation</p>
              <p className="text-sm text-[var(--foreground-muted)]">
                Choose a case from the sidebar or create a new one to begin.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
