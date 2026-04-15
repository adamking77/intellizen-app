import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  FolderOpen,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Play,
  Save,
  Target,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useWindowSize } from "@/lib/use-window-size";
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

  // Layout state — Graph-style rails
  const { isCramped } = useWindowSize();
  const [leftOpen, setLeftOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("intelizen:investigate-left-open") !== "0";
    } catch {
      return true;
    }
  });
  const [rightOpen, setRightOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("intelizen:investigate-right-open") !== "0";
    } catch {
      return true;
    }
  });
  const [railTab, setRailTab] = useState<"status" | "output">("status");

  useEffect(() => {
    try {
      localStorage.setItem("intelizen:investigate-left-open", leftOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [leftOpen]);
  useEffect(() => {
    try {
      localStorage.setItem("intelizen:investigate-right-open", rightOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [rightOpen]);
  useEffect(() => {
    if (isCramped) setRightOpen(false);
  }, [isCramped]);

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
      toast.success("Investigation created");
    },
    onError: (err) => toastError("Couldn't create investigation", err),
  });

  const savePlanMutation = useMutation({
    mutationFn: (input: Parameters<typeof saveInvestigationPlan>[1]) =>
      saveInvestigationPlan(selectedCaseId!, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["investigation", selectedCaseId] });
      toast.success("Plan saved");
    },
    onError: (err) => toastError("Couldn't save plan", err),
  });

  const advancePhaseMutation = useMutation({
    mutationFn: (input: { phase: number; gateData?: Record<string, boolean> }) =>
      updateInvestigationPhase(selectedCaseId!, input.phase, input.gateData),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["investigation", selectedCaseId] });
      const phaseName = PHASES[vars.phase - 1]?.name ?? `Phase ${vars.phase}`;
      toast.success(`Advanced to ${phaseName}`);
    },
    onError: (err) => toastError("Couldn't advance phase", err),
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
      toast.success("Signal added");
    },
    onError: (err) => toastError("Couldn't add signal", err),
  });

  const removeSignalMutation = useMutation({
    mutationFn: (investigationSignalId: number) => removeSignalFromInvestigation(investigationSignalId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["investigation-signals", selectedInvestigation?.id],
      });
      toast.success("Signal removed");
    },
    onError: (err) => toastError("Couldn't remove signal", err),
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

  const runDisabled =
    isRunningPhase ||
    !selectedInvestigation ||
    !hasRequiredPhaseGates(selectedPhase, selectedPhaseGates) ||
    (selectedPhase === 1 && !planGateComplete) ||
    (selectedPhase === 2 && !collectGateComplete) ||
    (selectedPhase === 4 && !collateGateComplete) ||
    (selectedPhase === 5 && !timelineGateComplete) ||
    (selectedPhase === 6 && !achGateComplete);

  return (
    <div className="relative flex h-[calc(100dvh)] w-full overflow-hidden bg-[var(--base)]">
      {/* ============================================================
          LEFT RAIL — Cases
          ============================================================ */}
      <aside
        style={{ width: leftOpen ? 260 : 0 }}
        className={cn(
          "relative flex h-full shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--mantle)]",
          "transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        )}
      >
        {leftOpen && (
          <>
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
              <span className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                Cases
              </span>
              <button
                type="button"
                onClick={() => setLeftOpen(false)}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                title="Hide cases"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--border)] p-3">
              <Input
                placeholder="New case name"
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
                size="sm"
                onClick={() => createMutation.mutate({ name: newCaseName })}
                disabled={!newCaseName.trim() || createMutation.isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {(investigations ?? []).length === 0 ? (
                <p className="px-2 py-6 text-center font-ui text-[11px] text-[var(--overlay-1)]">
                  No investigations yet.
                </p>
              ) : (
                (investigations ?? []).map((inv) => {
                  const gateStatus = getPhaseGateStatus(inv.current_phase, inv.phase_gates ?? {});
                  const isSelected = selectedCaseId === inv.case_id;
                  return (
                    <button
                      key={inv.case_id}
                      type="button"
                      onClick={() => setSelectedCaseId(inv.case_id)}
                      className={cn(
                        "group mb-1 w-full rounded-md border px-3 py-2.5 text-left font-ui transition-colors",
                        isSelected
                          ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
                          : "border-transparent hover:bg-[var(--surface-wash)]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            "truncate text-[12.5px] font-medium",
                            isSelected ? "text-[var(--text)]" : "text-[var(--subtext-1)]",
                          )}
                        >
                          {inv.name}
                        </p>
                        <span
                          aria-hidden
                          className={cn(
                            "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                            gateStatus === "green"
                              ? "bg-[var(--success)]"
                              : gateStatus === "amber"
                                ? "bg-[var(--warning)]"
                                : "bg-[var(--danger)]",
                          )}
                        />
                      </div>
                      <p className="mt-1 truncate font-mono text-[10px] text-[var(--overlay-1)]">
                        P{inv.current_phase} · {PHASES[inv.current_phase - 1]?.name ?? ""}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </aside>

      {/* ============================================================
          MAIN COLUMN — Topbar + phase workspace
          ============================================================ */}
      <div className="relative flex flex-1 min-w-0 flex-col">
        {/* Topbar */}
        <div className="relative z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--base)] px-4">
          <div className="flex min-w-0 items-center gap-3">
            {!leftOpen && (
              <button
                type="button"
                onClick={() => setLeftOpen(true)}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                title="Show cases"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            {!isCramped && (
              <div className="flex min-w-0 items-center gap-1.5 font-ui text-[12px]">
                <span className="text-[var(--overlay-1)]">Investigate</span>
                {selectedInvestigation && (
                  <>
                    <ChevronRight className="h-3 w-3 shrink-0 text-[var(--overlay-0)]" />
                    <span className="truncate text-[var(--text)]">{selectedInvestigation.name}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Phase stepper pill */}
          {selectedInvestigation ? (
            <div className="flex items-center gap-0.5 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--mantle)] p-0.5">
              {PHASES.map((phase) => {
                const isActive = phase.id === selectedPhase;
                const isLocked = !hasRequiredPhaseGates(phase.id, selectedPhaseGates);
                const gateStatus = getPhaseGateStatus(phase.id, selectedPhaseGates);
                return (
                  <button
                    key={phase.id}
                    type="button"
                    onClick={() => {
                      if (!isLocked && !isActive) {
                        void advancePhaseMutation.mutateAsync({
                          phase: phase.id,
                          gateData: selectedPhaseGates,
                        });
                      }
                    }}
                    disabled={isLocked}
                    title={`${phase.name} — ${phase.description}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-ui text-[11px] font-medium transition-colors",
                      isActive
                        ? "bg-[var(--surface-wash-strong)] text-[var(--text)]"
                        : isLocked
                          ? "text-[var(--overlay-0)] cursor-not-allowed"
                          : "text-[var(--subtext-0)] hover:text-[var(--text)]",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        gateStatus === "green"
                          ? "bg-[var(--success)]"
                          : gateStatus === "amber"
                            ? "bg-[var(--warning)]"
                            : "bg-[var(--danger)]",
                      )}
                    />
                    <span className="whitespace-nowrap">
                      <span className="font-mono text-[10px] text-[var(--overlay-1)]">{phase.id}</span>{" "}
                      {phase.name}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-1.5">
            {selectedInvestigation && (
              <button
                type="button"
                onClick={() => void handleRunPhase(selectedPhase)}
                disabled={runDisabled}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border px-3 font-ui text-[11px] font-medium transition-colors",
                  runDisabled
                    ? "border-[var(--border)] bg-[var(--mantle)] text-[var(--overlay-1)]"
                    : "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent-soft)] hover:border-[var(--accent)]",
                )}
              >
                {isRunningPhase ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                Run phase
              </button>
            )}
            <button
              type="button"
              onClick={() => setRightOpen((o) => !o)}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              title={rightOpen ? "Hide rail" : "Show rail"}
            >
              {rightOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Workspace */}
        <div className="flex-1 overflow-y-auto">
          {selectedInvestigation ? (
            <div className="mx-auto max-w-[880px] px-6 py-6">
              {/* Phase header */}
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                    Phase {selectedPhase}
                  </p>
                  <h2 className="mt-1 font-ui text-[20px] font-semibold text-[var(--text)]">
                    {PHASES[selectedPhase - 1]?.name}
                  </h2>
                  <p className="mt-1 font-ui text-[12px] text-[var(--subtext-0)]">
                    {PHASES[selectedPhase - 1]?.description}
                  </p>
                </div>
              </div>

              {!hasRequiredPhaseGates(selectedPhase, selectedPhaseGates) && (
                <div className="mb-4 flex items-center gap-2 rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 font-ui text-[12px] text-[var(--warning)]">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Locked — complete earlier phase gates first.
                </div>
              )}

              {/* Phase 1: Plan */}
              {selectedPhase === 1 && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                      Subject definition
                    </label>
                    <Textarea
                      value={planForm.subjectDefinition}
                      onChange={(e) =>
                        setPlanForm({ ...planForm, subjectDefinition: e.target.value })
                      }
                      placeholder="Who or what is the target of this investigation?"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                      Investigation scope
                    </label>
                    <Textarea
                      value={planForm.investigationScope}
                      onChange={(e) =>
                        setPlanForm({ ...planForm, investigationScope: e.target.value })
                      }
                      placeholder="What are the boundaries of this investigation?"
                    />
                  </div>

                  <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] p-4">
                    <p className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                      PLAN validation
                    </p>
                    <div className="mt-3 grid gap-2">
                      {[
                        { key: "proportionality", label: "Proportionality — Response matches the issue" },
                        { key: "legality", label: "Legality — Within legal and ethical boundaries" },
                        { key: "accountability", label: "Accountability — Clear ownership and oversight" },
                        { key: "necessity", label: "Necessity — Required and justified" },
                      ].map((item) => (
                        <label
                          key={item.key}
                          className="flex cursor-pointer items-center gap-2 font-ui text-[12.5px] text-[var(--subtext-1)]"
                        >
                          <input
                            type="checkbox"
                            checked={planForm[item.key as keyof typeof planForm] as boolean}
                            onChange={(e) =>
                              setPlanForm({ ...planForm, [item.key]: e.target.checked })
                            }
                            className="rounded border-[var(--border)]"
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                        Seed entities (one per line)
                      </label>
                      <Textarea
                        rows={4}
                        value={planForm.seedEntities}
                        onChange={(e) => setPlanForm({ ...planForm, seedEntities: e.target.value })}
                        placeholder="People, organisations, or entities to investigate..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                        Known hypotheses (one per line)
                      </label>
                      <Textarea
                        rows={4}
                        value={planForm.knownHypotheses}
                        onChange={(e) =>
                          setPlanForm({ ...planForm, knownHypotheses: e.target.value })
                        }
                        placeholder="Initial theories or questions to test..."
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => {
                        void handleSavePlan();
                      }}
                      disabled={
                        !planGateComplete ||
                        savePlanMutation.isPending ||
                        advancePhaseMutation.isPending
                      }
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save plan & advance
                    </Button>
                    {!planGateComplete && (
                      <span className="flex items-center gap-1.5 font-ui text-[12px] text-[var(--warning)]">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Complete all fields and validations
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Phase 2: Collect */}
              {selectedPhase === 2 && (
                <div className="space-y-4">
                  <p className="font-ui text-[12.5px] text-[var(--subtext-0)]">
                    Attach saved signals and review them before running collection.
                  </p>
                  <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[12.5px]">
                    <p className="font-medium text-[var(--text)]">
                      Collection gate: {reviewedSignalCount}/{COLLECT_MIN_SIGNALS} reviewed
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--overlay-1)]">
                      Require at least {COLLECT_MIN_SIGNALS} attached and reviewed signals.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                      Attached signals
                    </p>
                    {(investigationSignals ?? []).length === 0 ? (
                      <p className="py-6 text-center font-ui text-[12px] text-[var(--overlay-1)]">
                        No signals attached yet.
                      </p>
                    ) : (
                      (investigationSignals ?? []).map((sig) => (
                        <div
                          key={sig.id}
                          className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3"
                        >
                          <p className="font-ui text-[12.5px] font-medium text-[var(--text)]">
                            {sig.intel_signals?.title}
                          </p>
                          <p className="font-mono text-[11px] text-[var(--overlay-1)]">
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
                    <p className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                      Import saved signals
                    </p>
                    {importableSavedSignals.length === 0 ? (
                      <p className="py-4 text-center font-ui text-[12px] text-[var(--overlay-1)]">
                        No additional saved signals available.
                      </p>
                    ) : (
                      importableSavedSignals.map((signal) => (
                        <div
                          key={signal.id}
                          className="flex items-start justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-ui text-[12.5px] font-medium text-[var(--text)]">
                              {signal.title}
                            </p>
                            <p className="truncate font-mono text-[11px] text-[var(--overlay-1)]">
                              {signal.source}
                            </p>
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
                </div>
              )}

              {/* Phase 3-5: Artifact viewer */}
              {selectedPhase >= 3 && selectedPhase <= 5 && (
                <div className="space-y-4">
                  <div className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3">
                    <Target className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                    <p className="font-ui text-[12.5px] text-[var(--subtext-1)]">
                      Review the current artifact quality before running the next analytical phase.
                    </p>
                  </div>

                  {selectedPhase === 3 && (
                    <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[12.5px]">
                      <p className="font-medium text-[var(--text)]">
                        Entity register: {collateMetrics.total} extracted
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--overlay-1)]">
                        Persons {collateMetrics.person} · Organisations {collateMetrics.organisation} ·
                        Locations {collateMetrics.location} · Events {collateMetrics.event}
                      </p>
                      {!collateGateComplete && (
                        <p className="mt-2 text-[11px] text-[var(--warning)]">
                          Gate requires at least 3 extracted entities.
                        </p>
                      )}
                    </div>
                  )}
                  {selectedPhase === 4 && (
                    <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[12.5px]">
                      <p className="font-medium text-[var(--text)]">
                        Timeline quality: {timelineMetrics.eventCount} dated events
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--overlay-1)]">
                        Unresolved contradictions: {timelineMetrics.unresolvedContradictions}
                      </p>
                      {!timelineGateComplete && (
                        <p className="mt-2 text-[11px] text-[var(--warning)]">
                          Gate requires at least 3 events and zero unresolved contradictions.
                        </p>
                      )}
                    </div>
                  )}
                  {selectedPhase === 5 && (
                    <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[12.5px]">
                      <p className="font-medium text-[var(--text)]">
                        ACH matrix: {achMetrics.hypothesisCount} hypotheses
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--overlay-1)]">
                        Evidence assessments: {achMetrics.assessmentCells}
                      </p>
                      {!achGateComplete && (
                        <p className="mt-2 text-[11px] text-[var(--warning)]">
                          Gate requires at least 3 hypotheses and assessed evidence cells.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] p-4">
                    <p className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                      Current artifact
                    </p>
                    {isLoadingCurrentArtifact ? (
                      <div className="mt-2 flex items-center gap-2 font-ui text-[12px] text-[var(--overlay-1)]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading artifact...
                      </div>
                    ) : currentArtifactContent ? (
                      <pre className="mt-2 max-h-[60vh] overflow-auto whitespace-pre-wrap font-mono text-[11.5px] text-[var(--subtext-1)]">
                        {currentArtifactContent}
                      </pre>
                    ) : (
                      <p className="mt-2 font-ui text-[12px] text-[var(--overlay-1)]">
                        No artifact file found yet for this phase.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Phase 6: Report */}
              {selectedPhase === 6 && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                      Report type
                    </label>
                    <select
                      className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 font-ui text-[12.5px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                      value={selectedReportType}
                      onChange={(e) =>
                        setSelectedReportType(e.target.value as typeof selectedReportType)
                      }
                    >
                      {REPORT_TYPES.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="font-ui text-[12.5px] text-[var(--subtext-0)]">
                    Generate the final intelligence report based on all previous phases.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-10">
              <div className="max-w-[380px] text-center">
                <FolderOpen className="mx-auto mb-4 h-10 w-10 text-[var(--overlay-1)]" />
                <p className="font-ui text-[15px] font-medium text-[var(--text)]">
                  Select an investigation
                </p>
                <p className="mt-1 font-ui text-[12px] text-[var(--subtext-0)]">
                  Choose a case from the left or create a new one to begin.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================
          RIGHT RAIL — Status / Output
          ============================================================ */}
      <aside
        style={{ width: rightOpen ? 320 : 0 }}
        className={cn(
          "relative flex h-full shrink-0 flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--mantle)]",
          "transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        )}
      >
        {rightOpen && (
          <>
            <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-3">
              <div className="flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--base)] p-0.5">
                <InvRailTab
                  active={railTab === "status"}
                  onClick={() => setRailTab("status")}
                  icon={<Activity className="h-3 w-3" />}
                  label="Status"
                />
                <InvRailTab
                  active={railTab === "output"}
                  onClick={() => setRailTab("output")}
                  icon={<FileText className="h-3 w-3" />}
                  label="Output"
                />
              </div>
              <button
                type="button"
                onClick={() => setRightOpen(false)}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                title="Close rail"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {!selectedInvestigation ? (
                <p className="font-ui text-[12px] text-[var(--overlay-1)]">
                  Select a case to see status and output.
                </p>
              ) : railTab === "status" ? (
                <div className="space-y-4">
                  <div>
                    <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                      Phase gates
                    </p>
                    <div className="mt-2 space-y-1">
                      {PHASES.map((phase) => {
                        const status = getPhaseGateStatus(phase.id, selectedPhaseGates);
                        const complete = selectedPhaseGates[getPhaseGateKey(phase.id)] ?? false;
                        return (
                          <div
                            key={phase.id}
                            className="flex items-center justify-between rounded px-2 py-1.5 font-ui text-[12px]"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                aria-hidden
                                className={cn(
                                  "h-1.5 w-1.5 shrink-0 rounded-full",
                                  status === "green"
                                    ? "bg-[var(--success)]"
                                    : status === "amber"
                                      ? "bg-[var(--warning)]"
                                      : "bg-[var(--danger)]",
                                )}
                              />
                              <span className="font-mono text-[10px] text-[var(--overlay-1)]">
                                {phase.id}
                              </span>
                              <span className="truncate text-[var(--subtext-1)]">{phase.name}</span>
                            </div>
                            {complete && (
                              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-[var(--border)] pt-4">
                    <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                      Current phase metrics
                    </p>
                    <div className="mt-2 space-y-1.5 font-ui text-[12px]">
                      {selectedPhase === 1 && (
                        <InvMetric
                          label="Plan complete"
                          value={planGateComplete ? "Yes" : "No"}
                          tone={planGateComplete ? "good" : "warn"}
                        />
                      )}
                      {selectedPhase === 2 && (
                        <>
                          <InvMetric
                            label="Attached"
                            value={String(investigationSignals?.length ?? 0)}
                          />
                          <InvMetric
                            label="Reviewed"
                            value={`${reviewedSignalCount}/${COLLECT_MIN_SIGNALS}`}
                            tone={collectGateComplete ? "good" : "warn"}
                          />
                        </>
                      )}
                      {selectedPhase === 3 && (
                        <>
                          <InvMetric label="Persons" value={String(collateMetrics.person)} />
                          <InvMetric
                            label="Organisations"
                            value={String(collateMetrics.organisation)}
                          />
                          <InvMetric label="Locations" value={String(collateMetrics.location)} />
                          <InvMetric label="Events" value={String(collateMetrics.event)} />
                          <InvMetric
                            label="Total entities"
                            value={String(collateMetrics.total)}
                            tone={collateGateComplete ? "good" : "warn"}
                          />
                        </>
                      )}
                      {selectedPhase === 4 && (
                        <>
                          <InvMetric
                            label="Dated events"
                            value={String(timelineMetrics.eventCount)}
                          />
                          <InvMetric
                            label="Unresolved"
                            value={String(timelineMetrics.unresolvedContradictions)}
                            tone={timelineGateComplete ? "good" : "warn"}
                          />
                        </>
                      )}
                      {selectedPhase === 5 && (
                        <>
                          <InvMetric
                            label="Hypotheses"
                            value={String(achMetrics.hypothesisCount)}
                          />
                          <InvMetric
                            label="Assessments"
                            value={String(achMetrics.assessmentCells)}
                            tone={achGateComplete ? "good" : "warn"}
                          />
                        </>
                      )}
                      {selectedPhase === 6 && (
                        <InvMetric
                          label="Report type"
                          value={
                            REPORT_TYPES.find((t) => t.id === selectedReportType)?.label ?? ""
                          }
                        />
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                    Latest phase output
                  </p>
                  {phaseOutput ? (
                    <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-[var(--subtext-1)]">
                      {phaseOutput}
                    </pre>
                  ) : (
                    <p className="mt-2 font-ui text-[12px] text-[var(--overlay-1)]">
                      No output yet. Run a phase to see Claude's response here.
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function InvRailTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-1 font-ui text-[11px] font-medium transition-colors",
        active
          ? "bg-[var(--surface-wash-strong)] text-[var(--text)]"
          : "text-[var(--subtext-0)] hover:text-[var(--text)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function InvMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "neutral";
}) {
  const color =
    tone === "good"
      ? "text-[var(--success)]"
      : tone === "warn"
        ? "text-[var(--warning)]"
        : "text-[var(--text)]";
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--overlay-1)]">{label}</span>
      <span className={cn("font-mono text-[12px]", color)}>{value}</span>
    </div>
  );
}
