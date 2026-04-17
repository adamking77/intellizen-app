import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Loader2,
  Lock,
  Plus,
  Play,
  Save,
  Trash2,
} from "lucide-react";

import { InvestigationCreateModal } from "@/components/investigations/investigation-create-modal";
import { Button } from "@/components/ui/button";
import { IndicatorStrip, type IndicatorItem } from "@/components/ui/indicator-strip";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import {
  addSignalToInvestigation,
  createVaultFile,
  deleteInvestigation,
  getInvestigation,
  listProjects,
  listProjectSignals,
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

const PHASES = [
  {
    id: 1,
    name: "Plan",
    hint: "Define who or what you're investigating, set the scope, and confirm the ethics gates before anything runs.",
    runLabel: "Save plan & start",
  },
  {
    id: 2,
    name: "Collect",
    hint: "Attach source signals and review them. Need at least 3 reviewed before analysis can run.",
    runLabel: "Run collection",
  },
  {
    id: 3,
    name: "Collate",
    hint: "Extract the people, organisations, locations, and events that show up in the source signals.",
    runLabel: "Extract entities",
  },
  {
    id: 4,
    name: "Timeline",
    hint: "Place events in order. Resolve contradictions before you advance.",
    runLabel: "Build timeline",
  },
  {
    id: 5,
    name: "ACH",
    hint: "Score each working theory against the evidence you've collected.",
    runLabel: "Run hypothesis matrix",
  },
  {
    id: 6,
    name: "Report",
    hint: "Assemble the final intelligence product from everything above.",
    runLabel: "Generate report",
  },
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

function formatElapsed(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function isCaseComplete(inv: { current_phase: number; phase_gates: Record<string, boolean> | null | undefined }) {
  return (inv.phase_gates ?? {})[PHASE_GATE_KEYS[5]] === true;
}

export function InvestigationView() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setPendingProjectSelectionId = useAppStore((state) => state.setPendingProjectSelectionId);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "in-progress" | "complete">("all");
  const [isRunningPhase, setIsRunningPhase] = useState(false);
  const [phaseOutput, setPhaseOutput] = useState<string | null>(null);
  const [outputOpen, setOutputOpen] = useState(false);

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

  const [selectedReportType, setSelectedReportType] = useState<typeof REPORT_TYPES[number]["id"]>("internal");

  const [railWidth, setRailWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 320;
    const saved = window.localStorage.getItem("investigate-rail-width");
    const parsed = saved ? parseInt(saved, 10) : NaN;
    return Number.isFinite(parsed) ? Math.max(260, Math.min(480, parsed)) : 320;
  });

  useEffect(() => {
    window.localStorage.setItem("investigate-rail-width", String(railWidth));
  }, [railWidth]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = railWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      setRailWidth(Math.max(260, Math.min(480, startWidth + delta)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

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

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const parentProject = useMemo(
    () =>
      selectedInvestigation?.project_id
        ? (projects ?? []).find((p) => p.id === selectedInvestigation.project_id) ?? null
        : null,
    [projects, selectedInvestigation?.project_id],
  );

  const { data: parentProjectSignals } = useQuery({
    queryKey: ["project-signals", selectedInvestigation?.project_id],
    queryFn: () => listProjectSignals(selectedInvestigation!.project_id as number),
    enabled: !!selectedInvestigation?.project_id,
  });

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

  const deleteInvestigationMutation = useMutation({
    mutationFn: async (input: { caseId: string; name: string }) => {
      const result = await deleteInvestigation(input.caseId);
      return { ...input, ...result };
    },
    onSuccess: async ({ caseId, vaultCleanupError }) => {
      if (selectedCaseId === caseId) {
        setSelectedCaseId(null);
      }
      await queryClient.invalidateQueries({ queryKey: ["investigations"] });
      await queryClient.invalidateQueries({ queryKey: ["investigation"], exact: false });
      await queryClient.invalidateQueries({ queryKey: ["investigation-signals"], exact: false });
      await queryClient.invalidateQueries({ queryKey: ["reports"], exact: false });
      if (vaultCleanupError) {
        toast.success("Investigation deleted", {
          description: `Case removed from the database. Vault cleanup failed: ${vaultCleanupError}`,
        });
      } else {
        toast.success("Investigation deleted");
      }
    },
    onError: (error) => {
      toastError("Couldn't delete investigation", error);
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
  const importableProjectSignals = useMemo(
    () =>
      (parentProjectSignals ?? [])
        .filter((ps) => ps.intel_signals && !attachedSignalIdSet.has(ps.signal_id))
        .map((ps) => ps.intel_signals!),
    [parentProjectSignals, attachedSignalIdSet],
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
      setPhaseOutput("Complete earlier phases before running this one.");
      setOutputOpen(true);
      return;
    }

    if (phase === 1 && !planGateComplete) {
      setPhaseOutput("Fill out the plan fields and confirm the ethics gates before starting.");
      setOutputOpen(true);
      return;
    }
    if (phase === 2 && !collectGateComplete) {
      setPhaseOutput(
        `Attach and mark at least ${COLLECT_MIN_SIGNALS} signals as reviewed before running collection.`,
      );
      setOutputOpen(true);
      return;
    }
    if (phase === 4 && !collateGateComplete) {
      setPhaseOutput("Timeline needs a confirmed entity register with at least 3 entities.");
      setOutputOpen(true);
      return;
    }
    if (phase === 5 && !timelineGateComplete) {
      setPhaseOutput(
        "Hypothesis matrix needs at least 3 timeline events and zero unresolved contradictions.",
      );
      setOutputOpen(true);
      return;
    }
    if (phase === 6 && !achGateComplete) {
      setPhaseOutput(
        "Report needs at least 3 assessed hypotheses from the ACH matrix.",
      );
      setOutputOpen(true);
      return;
    }

    setIsRunningPhase(true);
    setPhaseOutput(null);
    setOutputOpen(true);

    try {
      await ensureInvestigationDirectory(selectedInvestigation.case_id);

      const planPayload = buildPlanPayload();
      if (phase === 1) {
        await savePlanMutation.mutateAsync(planPayload);
      }

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
      setPhaseOutput("Plan saved. Phase 1 gate confirmed.");
      setOutputOpen(true);
    } catch (error) {
      setPhaseOutput(`Error: ${error instanceof Error ? error.message : "Failed to save plan."}`);
      setOutputOpen(true);
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

  const caseStats = useMemo(() => {
    const list = investigations ?? [];
    const inProgress = list.filter((i) => !isCaseComplete(i)).length;
    const complete = list.filter((i) => isCaseComplete(i)).length;
    const latest = list.reduce<string | null>((acc, i) => {
      const t = i.updated_at ?? i.created_at ?? null;
      if (!t) return acc;
      if (!acc) return t;
      return new Date(t).getTime() > new Date(acc).getTime() ? t : acc;
    }, null);
    return { total: list.length, inProgress, complete, latest };
  }, [investigations]);

  const filteredCases = useMemo(() => {
    const list = investigations ?? [];
    if (statusFilter === "all") return list;
    if (statusFilter === "complete") return list.filter(isCaseComplete);
    return list.filter((i) => !isCaseComplete(i));
  }, [investigations, statusFilter]);

  useEffect(() => {
    if (selectedCaseId == null && filteredCases.length > 0) {
      setSelectedCaseId(filteredCases[0].case_id);
      return;
    }
    if (
      selectedCaseId != null &&
      filteredCases.length > 0 &&
      !filteredCases.some((c) => c.case_id === selectedCaseId)
    ) {
      setSelectedCaseId(filteredCases[0].case_id);
    }
  }, [filteredCases, selectedCaseId]);

  const indicators: IndicatorItem[] = [
    {
      label: "Total",
      value: caseStats.total,
      onClick: () => setStatusFilter("all"),
      active: statusFilter === "all",
    },
    {
      label: "In progress",
      value: caseStats.inProgress,
      status: caseStats.inProgress > 0 ? "accent" : "neutral",
      onClick: () => setStatusFilter("in-progress"),
      active: statusFilter === "in-progress",
    },
    {
      label: "Complete",
      value: caseStats.complete,
      status: caseStats.complete > 0 ? "active" : "neutral",
      onClick: () => setStatusFilter("complete"),
      active: statusFilter === "complete",
    },
    { label: "Last touch", value: formatElapsed(caseStats.latest) },
  ];

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

  const currentPhaseMeta = PHASES[selectedPhase - 1];
  const isPhaseLocked =
    !!selectedInvestigation && !hasRequiredPhaseGates(selectedPhase, selectedPhaseGates);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Topbar */}
      <div className="flex shrink-0 items-start justify-between gap-6 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
        <div className="flex flex-col gap-3">
          <span className="text-label">Investigate</span>
          <IndicatorStrip items={indicators} />
        </div>

        <div className="flex items-center pt-1">
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-3 w-3" />
            New investigation
          </Button>
        </div>
      </div>

      {/* Content: case rail + workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Case rail */}
        <aside
          style={{ width: railWidth }}
          className="relative flex shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--base)]"
        >
          <div className="flex-1 overflow-y-auto">
            {filteredCases.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center">
                <p className="text-label">
                  {statusFilter === "complete"
                    ? "No completed cases"
                    : statusFilter === "in-progress"
                      ? "No cases in progress"
                      : "No investigations yet"}
                </p>
                <p className="text-meta">
                  {statusFilter !== "all"
                    ? "Switch the filter to see the other cases."
                    : "Start a case to plan, collect, and analyse evidence."}
                </p>
                {statusFilter === "all" ? (
                  <Button size="sm" onClick={() => setCreateOpen(true)} className="mt-2 gap-1.5">
                    <Plus className="h-3 w-3" />
                    New investigation
                  </Button>
                ) : null}
              </div>
            ) : (
              filteredCases.map((inv) => {
                const isSelected = selectedCaseId === inv.case_id;
                const gates = inv.phase_gates ?? {};
                const phase = inv.current_phase;
                const phaseName = PHASES[phase - 1]?.name ?? "";
                const complete = isCaseComplete(inv);
                const dotColor = complete
                  ? "var(--success)"
                  : phase === 1
                    ? "var(--overlay-1)"
                    : "var(--accent)";
                const stepStatuses = PHASES.map((p) => {
                  if (gates[getPhaseGateKey(p.id)]) return "done";
                  if (p.id === phase) return "current";
                  if (p.id < phase) return "done";
                  return "pending";
                });
                return (
                  <button
                    key={inv.case_id}
                    type="button"
                    data-selected={isSelected ? "true" : undefined}
                    onClick={() => setSelectedCaseId(inv.case_id)}
                    className={cn(
                      "group/row relative flex w-full cursor-pointer items-start gap-3 border-b border-[var(--border-subtle)] py-3 pr-3 text-left",
                      "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                      isSelected
                        ? "bg-[var(--accent-soft)] pl-[13px]"
                        : "pl-4 hover:bg-[var(--surface-wash)]",
                    )}
                  >
                    {isSelected ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-[var(--accent)]"
                      />
                    ) : null}

                    <span
                      aria-hidden
                      className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
                      style={{ background: dotColor }}
                    />

                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            "min-w-0 flex-1 truncate font-ui text-[13px] font-medium",
                            isSelected ? "text-[var(--accent)]" : "text-[var(--text)]",
                          )}
                        >
                          {inv.name}
                        </p>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--overlay-1)]">
                          {complete ? "done" : `${phase}/6`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--subtext-0)]">
                          {complete ? "Report delivered" : phaseName}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {stepStatuses.map((s, idx) => (
                          <span
                            key={idx}
                            aria-hidden
                            className={cn(
                              "h-0.5 flex-1 rounded-full",
                              s === "done"
                                ? "bg-[var(--success)]"
                                : s === "current"
                                  ? "bg-[var(--accent)]"
                                  : "bg-[var(--overlay-0)]",
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize case list"
            onMouseDown={startResize}
            onDoubleClick={() => setRailWidth(320)}
            className="group/resize absolute inset-y-0 right-0 z-20 w-1 cursor-col-resize"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 right-0 w-[2px] bg-transparent transition-colors duration-150 group-hover/resize:bg-[var(--accent)]/60 group-active/resize:bg-[var(--accent)]"
            />
          </div>
        </aside>

        {/* Workspace */}
        <section className="flex flex-1 flex-col overflow-hidden bg-[var(--base)]">
          {selectedInvestigation ? (
            <>
              {/* Sub-topbar: case chrome */}
              <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--base)] px-5">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-heading">
                    {selectedInvestigation.name}
                  </h2>
                  <span className="shrink-0 font-mono text-[10px] text-[var(--overlay-1)]">
                    {selectedInvestigation.case_id}
                  </span>
                  {parentProject ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPendingProjectSelectionId(parentProject.id);
                        navigate("/projects");
                      }}
                      title={`Open ${parentProject.name} in Projects`}
                      className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-0.5 font-ui text-[10.5px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)]/70"
                    >
                      <FolderOpen className="h-2.5 w-2.5" />
                      <span className="max-w-[160px] truncate">From {parentProject.name}</span>
                    </button>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-meta text-[var(--subtext-0)]">
                    Phase <span className="font-mono text-[var(--text)]">{selectedPhase}</span> of 6
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={deleteInvestigationMutation.isPending}
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="gap-1.5 text-[var(--overlay-1)] hover:text-[var(--danger)]"
                    title="Delete investigation"
                  >
                    <Trash2 className="h-3 w-3" />
                    {deleteInvestigationMutation.isPending ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </div>

              {/* Phase spine */}
              <div className="shrink-0 border-b border-[var(--border)] bg-[var(--mantle)] px-5 py-3">
                <div className="flex items-stretch gap-1">
                  {PHASES.map((phase) => {
                    const isActive = phase.id === selectedPhase;
                    const isLocked = !hasRequiredPhaseGates(phase.id, selectedPhaseGates);
                    const isDone = selectedPhaseGates[getPhaseGateKey(phase.id)] === true;
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
                        title={phase.hint}
                        className={cn(
                          "group/phase relative flex flex-1 flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-all",
                          isActive
                            ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
                            : isLocked
                              ? "cursor-not-allowed border-[var(--border-subtle)] bg-transparent opacity-60"
                              : "border-[var(--border-subtle)] bg-[var(--base)] hover:border-[var(--border)]",
                        )}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "font-mono text-[10px]",
                                isActive ? "text-[var(--accent)]" : "text-[var(--overlay-1)]",
                              )}
                            >
                              0{phase.id}
                            </span>
                            <span
                              className={cn(
                                "font-ui text-[11.5px] font-medium",
                                isActive
                                  ? "text-[var(--accent)]"
                                  : isDone
                                    ? "text-[var(--text)]"
                                    : "text-[var(--subtext-0)]",
                              )}
                            >
                              {phase.name}
                            </span>
                          </div>
                          {isDone ? (
                            <CheckCircle2 className="h-3 w-3 text-[var(--success)]" />
                          ) : isLocked ? (
                            <Lock className="h-3 w-3 text-[var(--overlay-1)]" />
                          ) : isActive ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-[880px] px-6 py-6">
                  <div className="mb-5">
                    <p className="text-label">
                      Phase {selectedPhase} — {currentPhaseMeta?.name}
                    </p>
                    <p className="mt-1.5 text-ui text-[var(--subtext-0)]">
                      {currentPhaseMeta?.hint}
                    </p>
                  </div>

                  {isPhaseLocked && (
                    <div className="mb-4 flex items-center gap-2 rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 text-meta text-[var(--warning)]">
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                      Locked — finish the earlier phases first.
                    </div>
                  )}

                  {/* Phase 1: Plan */}
                  {selectedPhase === 1 && (
                    <div className="space-y-5">
                      <div className="space-y-1.5">
                        <label className="text-label">
                          Who or what are you investigating?
                        </label>
                        <Textarea
                          value={planForm.subjectDefinition}
                          onChange={(e) =>
                            setPlanForm({ ...planForm, subjectDefinition: e.target.value })
                          }
                          placeholder="The person, organisation, situation, or pattern at the centre of the case."
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-label">
                          What's in scope (and what isn't)?
                        </label>
                        <Textarea
                          value={planForm.investigationScope}
                          onChange={(e) =>
                            setPlanForm({ ...planForm, investigationScope: e.target.value })
                          }
                          placeholder="Boundaries, time window, jurisdictions, and anything deliberately excluded."
                        />
                      </div>

                      <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] p-4">
                        <p className="text-label">
                          Ethics gates — all four required
                        </p>
                        <p className="mt-1 text-meta text-[var(--subtext-0)]">
                          Confirm before any intelligence gathering begins.
                        </p>
                        <div className="mt-3 grid gap-2">
                          {[
                            {
                              key: "proportionality",
                              label: "Proportionality",
                              body: "The response fits the concern.",
                            },
                            {
                              key: "legality",
                              label: "Legality",
                              body: "Stays within legal and ethical lines.",
                            },
                            {
                              key: "accountability",
                              label: "Accountability",
                              body: "Clear ownership and oversight.",
                            },
                            {
                              key: "necessity",
                              label: "Necessity",
                              body: "Required and justified, not speculative.",
                            },
                          ].map((item) => (
                            <label
                              key={item.key}
                              className="flex cursor-pointer items-start gap-2.5 rounded border border-transparent px-2 py-1.5 text-meta text-[var(--subtext-1)] hover:bg-[var(--surface-wash)]"
                            >
                              <input
                                type="checkbox"
                                checked={planForm[item.key as keyof typeof planForm] as boolean}
                                onChange={(e) =>
                                  setPlanForm({ ...planForm, [item.key]: e.target.checked })
                                }
                                className="mt-0.5 rounded border-[var(--border)]"
                              />
                              <span className="min-w-0">
                                <span className="font-medium text-[var(--text)]">{item.label}</span>
                                <span className="text-[var(--overlay-1)]"> — {item.body}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-label">
                            Starting points
                          </label>
                          <Textarea
                            rows={4}
                            value={planForm.seedEntities}
                            onChange={(e) => setPlanForm({ ...planForm, seedEntities: e.target.value })}
                            placeholder="One per line — people, organisations, locations, or events to begin with."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-label">
                            Working theories
                          </label>
                          <Textarea
                            rows={4}
                            value={planForm.knownHypotheses}
                            onChange={(e) =>
                              setPlanForm({ ...planForm, knownHypotheses: e.target.value })
                            }
                            placeholder="One per line — what you already suspect and want to test."
                          />
                        </div>
                      </div>

                      <PhaseActionFoot
                        runLabel={currentPhaseMeta?.runLabel ?? "Run phase"}
                        running={isRunningPhase || savePlanMutation.isPending || advancePhaseMutation.isPending}
                        disabled={!planGateComplete || runDisabled}
                        hint={
                          !planGateComplete
                            ? "Fill every field and tick all four ethics gates to continue."
                            : "Ready to save and move to Collect."
                        }
                        onRun={() => void handleSavePlan()}
                        runIcon={<Save className="h-3.5 w-3.5" />}
                      />
                    </div>
                  )}

                  {/* Phase 2: Collect */}
                  {selectedPhase === 2 && (
                    <div className="space-y-5">
                      <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] px-4 py-3 text-ui">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="font-medium text-[var(--text)]">
                            Review progress: {reviewedSignalCount}/{COLLECT_MIN_SIGNALS} minimum
                          </p>
                          {collectGateComplete ? (
                            <span className="font-mono text-[11px] text-[var(--success)]">Gate ready</span>
                          ) : (
                            <span className="font-mono text-[11px] text-[var(--warning)]">Gate open</span>
                          )}
                        </div>
                        <p className="mt-1 text-meta">
                          Attach at least {COLLECT_MIN_SIGNALS} source signals and mark each reviewed before collection runs.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <p className="text-label">
                          Attached signals ({investigationSignals?.length ?? 0})
                        </p>
                        {(investigationSignals ?? []).length === 0 ? (
                          <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-wash)] px-4 py-8 text-center text-meta">
                            No signals attached yet. Import from your saved signals below.
                          </div>
                        ) : (
                          (investigationSignals ?? []).map((sig) => {
                            const reviewed = isSignalReviewed(sig.notes);
                            return (
                              <div
                                key={sig.id}
                                className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-ui font-medium">
                                      {sig.intel_signals?.title}
                                    </p>
                                    <p className="truncate font-mono text-[11px] text-[var(--overlay-1)]">
                                      {sig.intel_signals?.source}
                                    </p>
                                  </div>
                                  {reviewed ? (
                                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--success)]">
                                      Reviewed
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant={reviewed ? "secondary" : "ghost"}
                                    onClick={() =>
                                      reviewSignalMutation.mutate({
                                        investigationSignalId: sig.id,
                                        reviewed: !reviewed,
                                        notes: sig.notes ?? null,
                                      })
                                    }
                                    disabled={reviewSignalMutation.isPending}
                                  >
                                    {reviewed ? "Unmark reviewed" : "Mark reviewed"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => removeSignalMutation.mutate(sig.id)}
                                    disabled={removeSignalMutation.isPending}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Remove
                                  </Button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {parentProject ? (
                        <div className="space-y-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-label text-[var(--accent)]">
                              From parent project · {parentProject.name} ({importableProjectSignals.length})
                            </p>
                            {importableProjectSignals.length > 0 ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  for (const sig of importableProjectSignals) {
                                    addSignalMutation.mutate(sig.id);
                                  }
                                }}
                                disabled={addSignalMutation.isPending}
                              >
                                Add all
                              </Button>
                            ) : null}
                          </div>
                          {importableProjectSignals.length === 0 ? (
                            <div className="rounded-md border border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)]/40 px-4 py-6 text-center text-meta text-[var(--subtext-0)]">
                              {(parentProjectSignals?.length ?? 0) > 0
                                ? "All project signals are already attached."
                                : "No signals on the parent project yet. Attach some from Inbox or Search."}
                            </div>
                          ) : (
                            importableProjectSignals.map((signal) => (
                              <div
                                key={signal.id}
                                className="flex items-start justify-between gap-3 rounded-md border border-[var(--accent-border)] bg-[var(--accent-soft)]/30 p-3"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-ui font-medium">
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
                      ) : null}

                      <div className="space-y-2">
                        <p className="text-label">
                          {parentProject ? "Import from other saved signals" : "Import from saved signals"} ({importableSavedSignals.length})
                        </p>
                        {importableSavedSignals.length === 0 ? (
                          <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-wash)] px-4 py-6 text-center text-meta">
                            Nothing available. Save signals from Inbox or Search first.
                          </div>
                        ) : (
                          importableSavedSignals.map((signal) => (
                            <div
                              key={signal.id}
                              className="flex items-start justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-ui font-medium">
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

                      <PhaseActionFoot
                        runLabel={currentPhaseMeta?.runLabel ?? "Run phase"}
                        running={isRunningPhase}
                        disabled={runDisabled}
                        hint={
                          !collectGateComplete
                            ? `Mark ${Math.max(0, COLLECT_MIN_SIGNALS - reviewedSignalCount)} more signal${reviewedSignalCount === COLLECT_MIN_SIGNALS - 1 ? "" : "s"} reviewed to unlock.`
                            : "Ready — collection will run on the reviewed signals."
                        }
                        onRun={() => void handleRunPhase(selectedPhase)}
                        runIcon={<Play className="h-3.5 w-3.5" />}
                      />
                    </div>
                  )}

                  {/* Phase 3-5: Artifact viewer */}
                  {selectedPhase >= 3 && selectedPhase <= 5 && (
                    <div className="space-y-5">
                      {selectedPhase === 3 && (
                        <PhaseGateCard
                          title={`Entity register — ${collateMetrics.total} extracted`}
                          subtitle={`Persons ${collateMetrics.person} · Orgs ${collateMetrics.organisation} · Locations ${collateMetrics.location} · Events ${collateMetrics.event}`}
                          gateReady={collateGateComplete}
                          gateText="Gate needs at least 3 entities."
                        />
                      )}
                      {selectedPhase === 4 && (
                        <PhaseGateCard
                          title={`Timeline — ${timelineMetrics.eventCount} dated events`}
                          subtitle={`Unresolved contradictions: ${timelineMetrics.unresolvedContradictions}`}
                          gateReady={timelineGateComplete}
                          gateText="Gate needs at least 3 events and zero unresolved contradictions."
                        />
                      )}
                      {selectedPhase === 5 && (
                        <PhaseGateCard
                          title={`Hypothesis matrix — ${achMetrics.hypothesisCount} theories`}
                          subtitle={`Evidence assessments: ${achMetrics.assessmentCells}`}
                          gateReady={achGateComplete}
                          gateText="Gate needs at least 3 hypotheses and assessed evidence cells."
                        />
                      )}

                      <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] p-4">
                        <p className="text-label">
                          Current artifact
                        </p>
                        {isLoadingCurrentArtifact ? (
                          <div className="mt-2 flex items-center gap-2 text-meta">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading artifact…
                          </div>
                        ) : currentArtifactContent ? (
                          <pre className="mt-2 max-h-[60vh] overflow-auto whitespace-pre-wrap font-mono text-[11.5px] text-[var(--subtext-1)]">
                            {currentArtifactContent}
                          </pre>
                        ) : (
                          <p className="mt-2 text-meta">
                            Nothing saved yet. Run this phase to generate the artifact.
                          </p>
                        )}
                      </div>

                      <PhaseActionFoot
                        runLabel={currentPhaseMeta?.runLabel ?? "Run phase"}
                        running={isRunningPhase}
                        disabled={runDisabled}
                        hint={
                          selectedPhase === 4 && !collateGateComplete
                            ? "Entity register gate not ready."
                            : selectedPhase === 5 && !timelineGateComplete
                              ? "Timeline gate not ready."
                              : "Ready — this phase will overwrite the current artifact."
                        }
                        onRun={() => void handleRunPhase(selectedPhase)}
                        runIcon={<Play className="h-3.5 w-3.5" />}
                      />
                    </div>
                  )}

                  {/* Phase 6: Report */}
                  {selectedPhase === 6 && (
                    <div className="space-y-5">
                      <div className="space-y-1.5">
                        <label className="text-label">
                          Report type
                        </label>
                        <select
                          className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 text-ui focus:border-[var(--accent)] focus:outline-none"
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

                      <PhaseActionFoot
                        runLabel={currentPhaseMeta?.runLabel ?? "Run phase"}
                        running={isRunningPhase}
                        disabled={runDisabled}
                        hint={
                          !achGateComplete
                            ? "Hypothesis matrix gate not ready."
                            : "Ready — final report will pull from every phase artifact."
                        }
                        onRun={() => void handleRunPhase(selectedPhase)}
                        runIcon={<Play className="h-3.5 w-3.5" />}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Collapsible run output */}
              <div className="shrink-0 border-t border-[var(--border)] bg-[var(--mantle)]">
                <button
                  type="button"
                  onClick={() => setOutputOpen((o) => !o)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-2 text-label transition-colors hover:text-[var(--text)]"
                >
                  <span className="flex items-center gap-2">
                    <span>Last run output</span>
                    {isRunningPhase && <Loader2 className="h-3 w-3 animate-spin text-[var(--accent)]" />}
                    {phaseOutput && !isRunningPhase && (
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                    )}
                  </span>
                  {outputOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronUp className="h-3.5 w-3.5" />
                  )}
                </button>
                {outputOpen && (
                  <div className="max-h-[260px] overflow-y-auto border-t border-[var(--border)] px-5 py-3">
                    {phaseOutput ? (
                      <pre className="whitespace-pre-wrap font-mono text-[11px] text-[var(--subtext-1)]">
                        {phaseOutput}
                      </pre>
                    ) : (
                      <p className="text-meta">
                        Run a phase to see the response here.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
              <p className="text-label">What the Investigate page is for</p>
              <p className="max-w-[460px] text-ui text-[var(--subtext-0)]">
                This is the analyst workbench. Each case walks through six phases — plan, collect, collate, timeline, hypothesise, report — with ethics gates between them. Pick a case from the left, or start a new one.
              </p>
              <Button size="sm" onClick={() => setCreateOpen(true)} className="mt-2 gap-1.5">
                <Plus className="h-3 w-3" />
                New investigation
              </Button>
            </div>
          )}
        </section>
      </div>

      <InvestigationCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(caseId) => setSelectedCaseId(caseId)}
      />

      <DeleteInvestigationModal
        open={deleteConfirmOpen && !!selectedInvestigation}
        investigationName={selectedInvestigation?.name ?? ""}
        caseId={selectedInvestigation?.case_id ?? ""}
        isPending={deleteInvestigationMutation.isPending}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          if (!selectedInvestigation) return;
          deleteInvestigationMutation.mutate({
            caseId: selectedInvestigation.case_id,
            name: selectedInvestigation.name,
          });
          setDeleteConfirmOpen(false);
        }}
      />
    </div>
  );
}

function DeleteInvestigationModal({
  open,
  investigationName,
  caseId,
  isPending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  investigationName: string;
  caseId: string;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,7,8,0.72)] p-6 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete investigation"
        className="flex w-full max-w-[460px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="border-b border-[var(--border)] px-5 py-4">
          <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--danger)]">
            Delete investigation
          </p>
          <h3 className="mt-1 truncate font-ui text-[15px] font-medium text-[var(--text)]">
            {investigationName}
          </h3>
          <p className="mt-2 font-mono text-[11px] text-[var(--overlay-1)]">{caseId}</p>
        </div>

        <div className="grid gap-3 px-5 py-4">
          <p className="font-ui text-[13px] text-[var(--subtext-0)]">
            This will remove the investigation record, attached phase records, and attempt to
            delete its vault folder.
          </p>
          <p className="font-ui text-[12px] text-[var(--overlay-1)]">
            Project signals and source signals are not deleted.
          </p>

          <div className="mt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirm}
              disabled={isPending}
              className="gap-1.5"
            >
              <Trash2 className="h-3 w-3" />
              {isPending ? "Deleting…" : "Delete investigation"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhaseGateCard({
  title,
  subtitle,
  gateReady,
  gateText,
}: {
  title: string;
  subtitle: string;
  gateReady: boolean;
  gateText: string;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] px-4 py-3 text-ui">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium text-[var(--text)]">{title}</p>
        <span
          className={cn(
            "shrink-0 font-mono text-[11px]",
            gateReady ? "text-[var(--success)]" : "text-[var(--warning)]",
          )}
        >
          {gateReady ? "Gate ready" : "Gate open"}
        </span>
      </div>
      <p className="mt-1 text-meta">{subtitle}</p>
      {!gateReady && (
        <p className="mt-2 text-meta text-[var(--warning)]">{gateText}</p>
      )}
    </div>
  );
}

function PhaseActionFoot({
  runLabel,
  running,
  disabled,
  hint,
  onRun,
  runIcon,
}: {
  runLabel: string;
  running: boolean;
  disabled: boolean;
  hint: string;
  onRun: () => void;
  runIcon: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
      <span
        className={cn(
          "flex items-center gap-1.5 text-meta",
          disabled ? "text-[var(--warning)]" : "text-[var(--subtext-0)]",
        )}
      >
        {disabled && <AlertCircle className="h-3.5 w-3.5" />}
        {hint}
      </span>
      <Button onClick={onRun} disabled={disabled} className="gap-1.5">
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : runIcon}
        {running ? "Running…" : runLabel}
      </Button>
    </div>
  );
}
