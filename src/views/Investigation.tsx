import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Loader2,
  Lock,
  Play,
  Plus,
  Save,
  Trash2,
  Zap,
} from "lucide-react";

import { InvestigationCreateModal } from "@/components/investigations/investigation-create-modal";
import { VaultFileRow } from "@/components/vault/vault-file-row";
import { Button } from "@/components/ui/button";
import { IndicatorStrip, type IndicatorItem } from "@/components/ui/indicator-strip";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import {
  addSignalToInvestigation,
  bulkAddSignalsToInvestigation,
  collectSignalsForInvestigation,
  createVaultFile,
  deleteInvestigation,
  getInvestigation,
  listInvestigations,
  listInvestigationSignals,
  listProjectSignals,
  listProjects,
  listSignals,
  listVaultFiles,
  removeSignalFromInvestigation,
  saveInvestigationBrief,
  updateInvestigation,
  updateInvestigationPhase,
} from "@/lib/data";
import { anthropic } from "@/lib/anthropic";
import { buildAnalysisPrompt } from "@/lib/shell";
import type { Investigation, InvestigationUseCase } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASES = [
  {
    id: 1,
    name: "Brief",
    hint: "Define what you're investigating, set scope, and confirm ethics before anything runs.",
  },
  {
    id: 2,
    name: "Collect",
    hint: "Review signals from the parent project, run Exa collection, or import from saved signals.",
  },
  {
    id: 3,
    name: "Analyse",
    hint: "Claude analyses all collected signals and produces the intelligence output.",
  },
] as const;

const USE_CASE_LABELS: Record<InvestigationUseCase, string> = {
  scoping: "Scoping",
  post: "Post",
  sit_rep: "Sit Rep",
};

const PHASE_GATE_KEYS = [
  "brief_complete",
  "collect_complete",
  "analysis_complete",
] as const;

const ANALYSIS_FILE_NAME: Record<InvestigationUseCase, string> = {
  scoping: "scoping-brief.md",
  post: "post-draft.md",
  sit_rep: "legacy-threat-analysis.md",
};

function getPhaseGateKey(phase: number) {
  return PHASE_GATE_KEYS[Math.max(0, Math.min(PHASE_GATE_KEYS.length - 1, phase - 1))];
}

function hasRequiredPhaseGates(phase: number, phaseGates: Record<string, boolean>) {
  if (phase <= 1) return true;
  for (let step = 1; step < phase; step += 1) {
    if (!phaseGates[getPhaseGateKey(step)]) return false;
  }
  return true;
}

function isCaseComplete(inv: { current_phase: number; phase_gates: Record<string, boolean> | null | undefined }) {
  return (inv.phase_gates ?? {})[PHASE_GATE_KEYS[2]] === true;
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
  return `${Math.floor(h / 24)}d ago`;
}

// ─── View ─────────────────────────────────────────────────────────────────────

export function InvestigationView() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setPendingProjectSelectionId = useAppStore((s) => s.setPendingProjectSelectionId);

  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "in-progress" | "complete" | "archived">("all");

  // Phase 1 — Brief form state
  const [briefForm, setBriefForm] = useState({
    subjectDefinition: "",
    scopeNotes: "",
    seedEntities: "",
    humintInput: "",
    proportionality: false,
    legality: false,
    accountability: false,
    necessity: false,
  });

  // Phase 3 — Claude run state
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  const [analysisOutput, setAnalysisOutput] = useState<string | null>(null);
  const [outputOpen, setOutputOpen] = useState(false);

  // Phase 2 — Exa collection state
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectResult, setCollectResult] = useState<{ added: number; errors: string[] } | null>(null);

  // Sidebar resize
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
    const onMove = (ev: MouseEvent) => setRailWidth(Math.max(260, Math.min(480, startWidth + ev.clientX - startX)));
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

  // ─── Queries ───────────────────────────────────────────────────────────────

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
      const all = await listSignals();
      return all.filter((s) => s.status === "saved");
    },
  });

  const { data: vaultFiles } = useQuery({
    queryKey: ["vault-files", selectedInvestigation?.case_id],
    queryFn: () => listVaultFiles(selectedInvestigation!.case_id),
    enabled: !!selectedInvestigation?.case_id,
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

  // ─── Derived state ─────────────────────────────────────────────────────────

  const selectedPhase = selectedInvestigation?.current_phase ?? 1;
  const selectedPhaseGates = selectedInvestigation?.phase_gates ?? {};
  const useCase = selectedInvestigation?.use_case ?? "scoping";
  const needsEthicsGate = useCase === "scoping" || useCase === "sit_rep";
  const needsHumint = useCase === "sit_rep";

  const attachedSignalIdSet = useMemo(
    () => new Set((investigationSignals ?? []).map((s) => s.signal_id)),
    [investigationSignals],
  );

  const importableSavedSignals = useMemo(
    () => (savedSignals ?? []).filter((s) => !attachedSignalIdSet.has(s.id)),
    [savedSignals, attachedSignalIdSet],
  );

  const importableProjectSignals = useMemo(
    () =>
      (parentProjectSignals ?? [])
        .filter((ps) => ps.intel_signals && !attachedSignalIdSet.has(ps.signal_id))
        .map((ps) => ps.intel_signals!),
    [parentProjectSignals, attachedSignalIdSet],
  );

  // Auto-import all parent project signals when entering Collect phase
  useEffect(() => {
    if (
      selectedPhase !== 2 ||
      !selectedInvestigation?.id ||
      !selectedInvestigation.project_id ||
      importableProjectSignals.length === 0
    ) return;
    const ids = importableProjectSignals.map((s) => s.id);
    bulkAddSignalsToInvestigation(selectedInvestigation.id, ids).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["investigation-signals", selectedInvestigation.id] });
    });
  }, [selectedPhase, selectedInvestigation?.id, selectedInvestigation?.project_id, importableProjectSignals.length]);

  const briefGateComplete = useMemo(() => {
    const base = briefForm.subjectDefinition.trim().length > 0;
    if (!needsEthicsGate) return base;
    return (
      base &&
      briefForm.proportionality &&
      briefForm.legality &&
      briefForm.accountability &&
      briefForm.necessity
    );
  }, [briefForm, needsEthicsGate]);

  const collectGateComplete = (investigationSignals?.length ?? 0) > 0;

  // ─── Sync form from DB ─────────────────────────────────────────────────────

  useEffect(() => {
    if (selectedInvestigation) {
      setBriefForm({
        subjectDefinition: selectedInvestigation.subject_definition ?? "",
        scopeNotes: selectedInvestigation.scope_notes ?? "",
        seedEntities: selectedInvestigation.seed_entities?.join("\n") ?? "",
        humintInput: selectedInvestigation.humint_input ?? "",
        proportionality: selectedInvestigation.plan_proportionality ?? false,
        legality: selectedInvestigation.plan_legality ?? false,
        accountability: selectedInvestigation.plan_accountability ?? false,
        necessity: selectedInvestigation.plan_necessity ?? false,
      });
    }
  }, [selectedInvestigation]);

  // ─── Auto-select first case ────────────────────────────────────────────────

  const filteredCases = useMemo(() => {
    const list = investigations ?? [];
    if (statusFilter === "archived") return list.filter((i) => i.status === "archived");
    const active = list.filter((i) => i.status !== "archived");
    if (statusFilter === "all") return active;
    if (statusFilter === "complete") return active.filter(isCaseComplete);
    return active.filter((i) => !isCaseComplete(i));
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

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const saveBriefMutation = useMutation({
    mutationFn: (gateData: Record<string, boolean>) =>
      saveInvestigationBrief(selectedCaseId!, {
        subjectDefinition: briefForm.subjectDefinition.trim(),
        scopeNotes: briefForm.scopeNotes.trim(),
        seedEntities: briefForm.seedEntities.split("\n").map((e) => e.trim()).filter(Boolean),
        humintInput: briefForm.humintInput.trim() || null,
        proportionality: briefForm.proportionality,
        legality: briefForm.legality,
        accountability: briefForm.accountability,
        necessity: briefForm.necessity,
      }).then(() =>
        updateInvestigationPhase(selectedCaseId!, Math.max(2, selectedPhase), gateData)
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["investigation", selectedCaseId] });
      toast.success("Brief saved");
    },
    onError: (err) => toastError("Couldn't save brief", err),
  });

  const advancePhaseMutation = useMutation({
    mutationFn: (input: { phase: number; gateData?: Record<string, boolean> }) =>
      updateInvestigationPhase(selectedCaseId!, input.phase, input.gateData),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["investigation", selectedCaseId] });
    },
    onError: (err) => toastError("Couldn't update phase", err),
  });

  const addSignalMutation = useMutation({
    mutationFn: (signalId: number) =>
      addSignalToInvestigation({ investigationId: selectedInvestigation!.id, signalId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["investigation-signals", selectedInvestigation?.id] });
      toast.success("Signal added");
    },
    onError: (err) => toastError("Couldn't add signal", err),
  });

  const removeSignalMutation = useMutation({
    mutationFn: (id: number) => removeSignalFromInvestigation(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["investigation-signals", selectedInvestigation?.id] });
      toast.success("Signal removed");
    },
    onError: (err) => toastError("Couldn't remove signal", err),
  });

  const deleteInvestigationMutation = useMutation({
    mutationFn: async (input: { caseId: string }) => {
      const result = await deleteInvestigation(input.caseId);
      return { ...input, ...result };
    },
    onSuccess: async ({ caseId, vaultCleanupError }) => {
      if (selectedCaseId === caseId) setSelectedCaseId(null);
      await queryClient.invalidateQueries({ queryKey: ["investigations"] });
      await queryClient.invalidateQueries({ queryKey: ["investigation"], exact: false });
      await queryClient.invalidateQueries({ queryKey: ["investigation-signals"], exact: false });
      if (vaultCleanupError) {
        toast.success("Investigation deleted", { description: `Vault cleanup failed: ${vaultCleanupError}` });
      } else {
        toast.success("Investigation deleted");
      }
    },
    onError: (err) => toastError("Couldn't delete investigation", err),
  });

  const archiveToggleMutation = useMutation({
    mutationFn: () =>
      updateInvestigation(selectedCaseId!, {
        status: selectedInvestigation?.status === "archived" ? "active" : "archived",
      }),
    onMutate: async () => {
      if (!selectedCaseId || !selectedInvestigation) return;
      await queryClient.cancelQueries({ queryKey: ["investigations"] });
      await queryClient.cancelQueries({ queryKey: ["investigation", selectedCaseId] });
      const previous = queryClient.getQueryData<Investigation[]>(["investigations"]);
      const nextStatus = selectedInvestigation.status === "archived" ? "active" as const : "archived" as const;
      queryClient.setQueryData<Investigation[]>(["investigations"], (old) =>
        (old ?? []).map((i) =>
          i.case_id === selectedCaseId ? { ...i, status: nextStatus } : i,
        ),
      );
      queryClient.setQueryData<Investigation>(["investigation", selectedCaseId], (old) =>
        old ? { ...old, status: nextStatus } : old,
      );
      return { previous, nextStatus };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["investigations"], context.previous);
      }
      void queryClient.invalidateQueries({ queryKey: ["investigation", selectedCaseId] });
      toastError("Couldn't update investigation", err);
    },
    onSuccess: (_data, _vars, context) => {
      toast.success(context?.nextStatus === "archived" ? "Investigation archived" : "Investigation reactivated");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["investigations"] });
      void queryClient.invalidateQueries({ queryKey: ["investigation", selectedCaseId] });
    },
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────

  async function handleSaveBrief() {
    if (!selectedInvestigation || !briefGateComplete) return;
    const nextGates = { ...selectedPhaseGates, [getPhaseGateKey(1)]: true };
    await saveBriefMutation.mutateAsync(nextGates);
  }

  async function handleRunCollection() {
    if (!selectedInvestigation) return;
    const entities = briefForm.seedEntities.split("\n").map((e) => e.trim()).filter(Boolean);
    if (entities.length === 0) {
      toast.error("Add seed entities in the Brief first.");
      return;
    }
    setIsCollecting(true);
    setCollectResult(null);
    try {
      const result = await collectSignalsForInvestigation(selectedInvestigation.id, entities);
      setCollectResult(result);
      await queryClient.invalidateQueries({ queryKey: ["investigation-signals", selectedInvestigation.id] });
      if (result.added > 0) {
        toast.success(`${result.added} signals collected`);
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} entity search(es) failed`);
      }
    } catch (err) {
      toastError("Collection failed", err);
    } finally {
      setIsCollecting(false);
    }
  }

  async function handleConfirmCollection() {
    if (!selectedInvestigation || !collectGateComplete) return;
    const nextGates = { ...selectedPhaseGates, [getPhaseGateKey(2)]: true };
    await advancePhaseMutation.mutateAsync({ phase: 3, gateData: nextGates });
    toast.success("Collection confirmed — ready to analyse");
  }

  async function handleRunAnalysis() {
    if (!selectedInvestigation) return;
    setIsRunningAnalysis(true);
    setAnalysisOutput(null);
    setOutputOpen(true);

    try {
      const signals = (investigationSignals ?? [])
        .filter((s) => s.intel_signals)
        .map((s) => ({
          title: s.intel_signals!.title,
          url: s.intel_signals!.url,
          source: s.intel_signals!.source,
          published_at: s.intel_signals!.published_at,
          snippet: s.intel_signals!.snippet,
        }));

      const prompt = buildAnalysisPrompt({
        useCase,
        subject: selectedInvestigation.subject_definition ?? "",
        scopeNotes: selectedInvestigation.scope_notes ?? "",
        seedEntities: selectedInvestigation.seed_entities ?? [],
        signals,
        humintInput: selectedInvestigation.humint_input,
      });

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8096,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Claude returned no text");
      }

      const output = textBlock.text.trim();
      const fileName = ANALYSIS_FILE_NAME[useCase];
      const filePath = `investigations/${selectedInvestigation.case_id}/${fileName}`;
      const content = `# ${USE_CASE_LABELS[useCase]} — ${selectedInvestigation.name}\n\nGenerated: ${new Date().toISOString()}\n\n---\n\n${output}\n`;

      await createVaultFile({
        caseId: selectedInvestigation.case_id,
        phase: 3,
        fileType: "analysis",
        filePath,
        fileName,
        content,
      });

      const nextGates = { ...selectedPhaseGates, [getPhaseGateKey(3)]: true };
      await advancePhaseMutation.mutateAsync({ phase: 3, gateData: nextGates });
      await queryClient.invalidateQueries({ queryKey: ["investigation", selectedCaseId] });
      await queryClient.invalidateQueries({ queryKey: ["vault-files-all"] });
      await queryClient.invalidateQueries({ queryKey: ["vault-files", selectedInvestigation.case_id] });

      setAnalysisOutput(output);
      toast.success("Analysis complete — saved to Reports");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setAnalysisOutput(`Error: ${msg}`);
      toastError("Analysis failed", err instanceof Error ? err : new Error(msg));
    } finally {
      setIsRunningAnalysis(false);
    }
  }

  // ─── Derived UI state ──────────────────────────────────────────────────────

  const caseStats = useMemo(() => {
    const list = investigations ?? [];
    const archived = list.filter((i) => i.status === "archived").length;
    const active = list.filter((i) => i.status !== "archived");
    const complete = active.filter(isCaseComplete).length;
    const latest = list.reduce<string | null>((acc, i) => {
      const t = i.updated_at ?? i.created_at ?? null;
      if (!t) return acc;
      if (!acc) return t;
      return new Date(t).getTime() > new Date(acc).getTime() ? t : acc;
    }, null);
    return { total: active.length, inProgress: active.length - complete, complete, archived, latest };
  }, [investigations]);

  const indicators: IndicatorItem[] = [
    { label: "Total", value: caseStats.total, onClick: () => setStatusFilter("all"), active: statusFilter === "all" },
    { label: "In progress", value: caseStats.inProgress, status: caseStats.inProgress > 0 ? "accent" : "neutral", onClick: () => setStatusFilter("in-progress"), active: statusFilter === "in-progress" },
    { label: "Complete", value: caseStats.complete, status: caseStats.complete > 0 ? "active" : "neutral", onClick: () => setStatusFilter("complete"), active: statusFilter === "complete" },
    { label: "Archived", value: caseStats.archived, status: caseStats.archived > 0 ? "warning" : "neutral", onClick: () => setStatusFilter("archived"), active: statusFilter === "archived" },
    { label: "Last touch", value: formatElapsed(caseStats.latest) },
  ];

  const isPhaseLocked = !!selectedInvestigation && !hasRequiredPhaseGates(selectedPhase, selectedPhaseGates);
  const analysisComplete = selectedPhaseGates[getPhaseGateKey(3)] === true;

  if (isLoading) {
    return (
      <div className="flex h-screen flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Topbar */}
      <div className="flex shrink-0 items-end justify-between gap-6 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
        <div className="flex flex-col gap-3">
          <span className="text-label">Investigate</span>
          <IndicatorStrip items={indicators} />
        </div>
        <div className="flex items-center">
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-3 w-3" />
            New investigation
          </Button>
        </div>
      </div>

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
                  {statusFilter === "complete" ? "No completed cases" : statusFilter === "in-progress" ? "No cases in progress" : "No investigations yet"}
                </p>
                <p className="text-meta">
                  {statusFilter !== "all" ? "Switch the filter to see other cases." : "Start a case to collect and analyse intelligence."}
                </p>
                {statusFilter === "all" && (
                  <Button size="sm" onClick={() => setCreateOpen(true)} className="mt-2 gap-1.5">
                    <Plus className="h-3 w-3" />
                    New investigation
                  </Button>
                )}
              </div>
            ) : (
              filteredCases.map((inv) => {
                const isSelected = selectedCaseId === inv.case_id;
                const gates = inv.phase_gates ?? {};
                const complete = isCaseComplete(inv);
                const dotColor = complete ? "var(--success)" : inv.current_phase === 1 ? "var(--overlay-1)" : "var(--accent)";
                const stepStatuses = PHASES.map((p) => {
                  if (gates[getPhaseGateKey(p.id)]) return "done";
                  if (p.id === inv.current_phase) return "current";
                  if (p.id < inv.current_phase) return "done";
                  return "pending";
                });
                const uc = (inv as { use_case?: InvestigationUseCase }).use_case ?? "scoping";
                return (
                  <button
                    key={inv.case_id}
                    type="button"
                    onClick={() => setSelectedCaseId(inv.case_id)}
                    className={cn(
                      "group/row relative flex w-full cursor-pointer items-start gap-3 border-b border-[var(--border-subtle)] py-3 pr-3 text-left transition-colors duration-150",
                      isSelected ? "bg-[var(--accent-soft)] pl-[13px]" : "pl-4 hover:bg-[var(--surface-wash)]",
                      inv.status === "archived" && "opacity-50",
                    )}
                  >
                    {isSelected && (
                      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-[var(--accent)]" />
                    )}
                    <span aria-hidden className="mt-[5px] h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor }} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn("min-w-0 flex-1 truncate font-ui text-[13px] font-medium", isSelected ? "text-[var(--accent)]" : "text-[var(--text)]")}>
                          {inv.name}
                        </p>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--overlay-1)]">
                          {complete ? "done" : `${inv.current_phase}/3`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--subtext-0)]">
                          {USE_CASE_LABELS[uc]}
                        </span>
                        <span className="text-[var(--overlay-0)]">·</span>
                        <span className="font-ui text-[10px] text-[var(--subtext-0)]">
                          {complete ? "Complete" : PHASES[inv.current_phase - 1]?.name ?? ""}
                        </span>
                        {inv.status === "archived" && (
                          <>
                            <span className="text-[var(--overlay-0)]">·</span>
                            <span className="font-ui text-[10px] uppercase tracking-[0.08em] text-[var(--warning)]">Archived</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {stepStatuses.map((s, idx) => (
                          <span
                            key={idx}
                            aria-hidden
                            className={cn(
                              "h-0.5 flex-1 rounded-full",
                              s === "done" ? "bg-[var(--success)]" : s === "current" ? "bg-[var(--accent)]" : "bg-[var(--overlay-0)]",
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
            onMouseDown={startResize}
            onDoubleClick={() => setRailWidth(320)}
            className="group/resize absolute inset-y-0 right-0 z-20 w-1 cursor-col-resize"
          >
            <span aria-hidden className="absolute inset-y-0 right-0 w-[2px] bg-transparent transition-colors group-hover/resize:bg-[var(--accent)]/60 group-active/resize:bg-[var(--accent)]" />
          </div>
        </aside>

        {/* Workspace */}
        <section className="flex flex-1 flex-col overflow-hidden bg-[var(--base)]">
          {selectedInvestigation ? (
            <>
              {/* Case chrome */}
              <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--base)] px-5">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-heading">{selectedInvestigation.name}</h2>
                  <span className="shrink-0 font-mono text-[10px] text-[var(--overlay-1)]">{selectedInvestigation.case_id}</span>
                  <span className="shrink-0 rounded-full border border-[var(--border-subtle)] bg-[var(--mantle)] px-2 py-0.5 font-ui text-[10px] font-medium text-[var(--subtext-0)]">
                    {USE_CASE_LABELS[useCase]}
                  </span>
                  {parentProject && (
                    <button
                      type="button"
                      onClick={() => { setPendingProjectSelectionId(parentProject.id); navigate("/projects"); }}
                      className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-0.5 font-ui text-[10.5px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)]/70"
                    >
                      <FolderOpen className="h-2.5 w-2.5" />
                      <span className="max-w-[160px] truncate">{parentProject.name}</span>
                    </button>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-meta text-[var(--subtext-0)]">
                    Phase <span className="font-mono text-[var(--text)]">{selectedPhase}</span> of 3
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={archiveToggleMutation.isPending}
                    onClick={() => archiveToggleMutation.mutate()}
                    className="gap-1.5"
                  >
                    <Archive className="h-3 w-3" />
                    {selectedInvestigation?.status === "archived" ? "Reactivate" : "Archive"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={deleteInvestigationMutation.isPending}
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="gap-1.5 text-[var(--overlay-1)] hover:text-[var(--danger)]"
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
                            void advancePhaseMutation.mutateAsync({ phase: phase.id, gateData: selectedPhaseGates });
                          }
                        }}
                        disabled={isLocked}
                        title={phase.hint}
                        className={cn(
                          "group/phase relative flex flex-1 flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-all",
                          isActive ? "border-[var(--accent-border)] bg-[var(--accent-soft)]" : isLocked ? "cursor-not-allowed border-[var(--border-subtle)] opacity-60" : "border-[var(--border-subtle)] bg-[var(--base)] hover:border-[var(--border)]",
                        )}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("font-mono text-[10px]", isActive ? "text-[var(--accent)]" : "text-[var(--overlay-1)]")}>
                              0{phase.id}
                            </span>
                            <span className={cn("font-ui text-[11.5px] font-medium", isActive ? "text-[var(--accent)]" : isDone ? "text-[var(--text)]" : "text-[var(--subtext-0)]")}>
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

              {/* Phase content */}
              <div className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-[880px] px-6 py-6">
                  <div className="mb-5">
                    <p className="text-label">Phase {selectedPhase} — {PHASES[selectedPhase - 1]?.name}</p>
                    <p className="mt-1.5 text-ui text-[var(--subtext-0)]">{PHASES[selectedPhase - 1]?.hint}</p>
                  </div>

                  {isPhaseLocked && (
                    <div className="mb-4 flex items-center gap-2 rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 text-meta text-[var(--warning)]">
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                      Locked — finish earlier phases first.
                    </div>
                  )}

                  {/* ── Phase 1: Brief ── */}
                  {selectedPhase === 1 && (
                    <div className="space-y-5">
                      <div className="space-y-1.5">
                        <label className="text-label">Who or what are you investigating?</label>
                        <Textarea
                          value={briefForm.subjectDefinition}
                          onChange={(e) => setBriefForm({ ...briefForm, subjectDefinition: e.target.value })}
                          placeholder="The person, organisation, trend, or situation at the centre of this case."
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-label">Scope notes</label>
                        <Textarea
                          value={briefForm.scopeNotes}
                          onChange={(e) => setBriefForm({ ...briefForm, scopeNotes: e.target.value })}
                          placeholder="What's in scope, what isn't. Geographic focus, time window, anything excluded."
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-label">Seed entities</label>
                        <Textarea
                          rows={4}
                          value={briefForm.seedEntities}
                          onChange={(e) => setBriefForm({ ...briefForm, seedEntities: e.target.value })}
                          placeholder="One per line — people, organisations, locations, or events to start from."
                        />
                        <p className="text-meta text-[var(--subtext-0)]">
                          {parentProject ? "Used to supplement project signals with targeted Exa searches." : "Exa will search each of these in Collect."}
                        </p>
                      </div>

                      {needsHumint && (
                        <div className="space-y-1.5">
                          <label className="text-label">
                            HUMINT input{" "}
                            <span className="font-normal text-[var(--subtext-0)]">— paste contractor intelligence here</span>
                          </label>
                          <Textarea
                            rows={6}
                            value={briefForm.humintInput}
                            onChange={(e) => setBriefForm({ ...briefForm, humintInput: e.target.value })}
                            placeholder="Paste the contractor's HUMINT report. Claude will synthesise this with the OSINT signals in the analysis."
                          />
                        </div>
                      )}

                      {needsEthicsGate && (
                        <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] p-4">
                          <p className="text-label">Ethics gates — all four required</p>
                          <p className="mt-1 text-meta text-[var(--subtext-0)]">Confirm before any intelligence gathering begins.</p>
                          <div className="mt-3 grid gap-2">
                            {[
                              { key: "proportionality", label: "Proportionality", body: "The response fits the concern." },
                              { key: "legality", label: "Legality", body: "Stays within legal and ethical lines." },
                              { key: "accountability", label: "Accountability", body: "Clear ownership and oversight." },
                              { key: "necessity", label: "Necessity", body: "Required and justified, not speculative." },
                            ].map((item) => (
                              <label
                                key={item.key}
                                className="flex cursor-pointer items-start gap-2.5 rounded border border-transparent px-2 py-1.5 text-meta hover:bg-[var(--surface-wash)]"
                              >
                                <input
                                  type="checkbox"
                                  checked={briefForm[item.key as keyof typeof briefForm] as boolean}
                                  onChange={(e) => setBriefForm({ ...briefForm, [item.key]: e.target.checked })}
                                  className="mt-0.5 rounded border-[var(--border)] accent-[var(--accent)]"
                                />
                                <span className="min-w-0">
                                  <span className="font-medium text-[var(--text)]">{item.label}</span>
                                  <span className="text-[var(--overlay-1)]"> — {item.body}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      <PhaseActionFoot
                        runLabel="Save brief"
                        running={saveBriefMutation.isPending}
                        disabled={!briefGateComplete || saveBriefMutation.isPending}
                        hint={
                          !briefGateComplete
                            ? needsEthicsGate
                              ? "Fill the subject field and confirm all four ethics gates."
                              : "Fill the subject field to continue."
                            : "Ready — saves and advances to Collect."
                        }
                        onRun={() => void handleSaveBrief()}
                        runIcon={<Save className="h-3.5 w-3.5" />}
                      />
                    </div>
                  )}

                  {/* ── Phase 2: Collect ── */}
                  {selectedPhase === 2 && (
                    <div className="space-y-5">
                      <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="font-medium text-ui text-[var(--text)]">
                            {investigationSignals?.length ?? 0} signal{investigationSignals?.length !== 1 ? "s" : ""} attached
                          </p>
                          {collectGateComplete ? (
                            <span className="font-mono text-[11px] text-[var(--success)]">Ready to confirm</span>
                          ) : (
                            <span className="font-mono text-[11px] text-[var(--warning)]">No signals yet</span>
                          )}
                        </div>
                        <p className="mt-1 text-meta text-[var(--subtext-0)]">
                          Add signals via Exa collection, parent project import, or saved signals. Confirm when you have what you need.
                        </p>
                      </div>

                      {/* Exa collection */}
                      <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-label">Exa collection</p>
                            <p className="mt-0.5 text-meta text-[var(--subtext-0)]">
                              Searches web and news for each seed entity from the brief.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => void handleRunCollection()}
                            disabled={isCollecting}
                            className="gap-1.5 shrink-0"
                          >
                            {isCollecting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Zap className="h-3 w-3" />
                            )}
                            {isCollecting ? "Collecting…" : "Run Exa collection"}
                          </Button>
                        </div>
                        {collectResult && (
                          <div className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-meta">
                            <span className="text-[var(--success)]">{collectResult.added} signals added.</span>
                            {collectResult.errors.length > 0 && (
                              <span className="ml-2 text-[var(--warning)]">{collectResult.errors.length} error(s).</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Parent project — auto-import status */}
                      {parentProject && (
                        <div className="flex items-center gap-2 rounded-md border border-[var(--accent-border)] bg-[var(--accent-soft)]/40 px-3 py-2.5">
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                          <p className="text-meta text-[var(--subtext-0)]">
                            Signals from{" "}
                            <span className="font-medium text-[var(--text)]">{parentProject.name}</span>{" "}
                            {importableProjectSignals.length > 0
                              ? "are being imported automatically."
                              : (parentProjectSignals?.length ?? 0) > 0
                                ? "are all attached."
                                : "— no signals on this project yet."}
                          </p>
                        </div>
                      )}

                      {/* Attached signals */}
                      {(investigationSignals?.length ?? 0) > 0 && (
                        <div className="space-y-2">
                          <p className="text-label">Attached ({investigationSignals!.length})</p>
                          {investigationSignals!.map((sig) => (
                            <div key={sig.id} className="flex items-start justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-ui font-medium text-[var(--text)]">{sig.intel_signals?.title}</p>
                                <div className="mt-0.5 flex items-center gap-2">
                                  <span className="truncate font-mono text-[11px] text-[var(--overlay-1)]">{sig.intel_signals?.source}</span>
                                  {sig.intel_signals?.published_at && (
                                    <>
                                      <span className="text-[var(--overlay-0)]">·</span>
                                      <span className="shrink-0 font-mono text-[10px] text-[var(--overlay-1)]">
                                        {new Date(sig.intel_signals.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                      </span>
                                    </>
                                  )}
                                </div>
                                {sig.intel_signals?.snippet && (
                                  <p className="mt-1.5 line-clamp-2 text-meta text-[var(--subtext-0)]">{sig.intel_signals.snippet}</p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeSignalMutation.mutate(sig.id)}
                                disabled={removeSignalMutation.isPending}
                                className="mt-0.5 shrink-0 rounded p-1 text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--danger)] disabled:opacity-50"
                                aria-label="Remove signal"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Saved signals import — only shown when signals are available */}
                      {importableSavedSignals.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-label">From saved signals ({importableSavedSignals.length})</p>
                          {importableSavedSignals.map((signal) => (
                            <div key={signal.id} className="flex items-start justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-ui font-medium text-[var(--text)]">{signal.title}</p>
                                <div className="mt-0.5 flex items-center gap-2">
                                  <span className="truncate font-mono text-[11px] text-[var(--overlay-1)]">{signal.source}</span>
                                  {signal.published_at && (
                                    <>
                                      <span className="text-[var(--overlay-0)]">·</span>
                                      <span className="shrink-0 font-mono text-[10px] text-[var(--overlay-1)]">
                                        {new Date(signal.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                      </span>
                                    </>
                                  )}
                                </div>
                                {signal.snippet && (
                                  <p className="mt-1.5 line-clamp-2 text-meta text-[var(--subtext-0)]">{signal.snippet}</p>
                                )}
                              </div>
                              <Button size="sm" variant="accent-outline" onClick={() => addSignalMutation.mutate(signal.id)} disabled={addSignalMutation.isPending}>Add</Button>
                            </div>
                          ))}
                        </div>
                      )}

                      <PhaseActionFoot
                        runLabel="Confirm collection"
                        running={advancePhaseMutation.isPending}
                        disabled={!collectGateComplete || advancePhaseMutation.isPending}
                        hint={!collectGateComplete ? "Attach at least one signal to continue." : "Confirms collection and unlocks Analyse."}
                        onRun={() => void handleConfirmCollection()}
                        runIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                      />
                    </div>
                  )}

                  {/* ── Phase 3: Analyse ── */}
                  {selectedPhase === 3 && (
                    <div className="space-y-5">
                      <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="font-medium text-ui text-[var(--text)]">
                            {investigationSignals?.length ?? 0} signal{investigationSignals?.length !== 1 ? "s" : ""} ready
                          </p>
                          <span className={cn("font-mono text-[11px]", analysisComplete ? "text-[var(--success)]" : "text-[var(--accent)]")}>
                            {analysisComplete ? "Analysis complete" : "Ready to run"}
                          </span>
                        </div>
                        <p className="mt-1 text-meta text-[var(--subtext-0)]">
                          Claude will analyse all attached signals and produce a{" "}
                          <span className="font-medium text-[var(--text)]">{USE_CASE_LABELS[useCase]}</span> output.
                          {needsHumint && selectedInvestigation.humint_input && (
                            <span className="text-[var(--accent)]"> HUMINT input will be included.</span>
                          )}
                          {needsHumint && !selectedInvestigation.humint_input && (
                            <span className="text-[var(--warning)]"> No HUMINT input — add it in Brief if available.</span>
                          )}
                        </p>
                      </div>

                      <PhaseActionFoot
                        runLabel={analysisComplete ? "Re-run analysis" : "Run analysis"}
                        running={isRunningAnalysis}
                        disabled={isRunningAnalysis}
                        hint={analysisComplete ? "Analysis already in vault — re-run to overwrite." : `Produces a ${USE_CASE_LABELS[useCase]} document saved to vault.`}
                        onRun={() => void handleRunAnalysis()}
                        runIcon={<Play className="h-3.5 w-3.5" />}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Output drawer — only on phase 3 or when output exists */}
              {(selectedPhase === 3 || analysisOutput !== null) && (
              <div className="shrink-0 border-t border-[var(--border)] bg-[var(--mantle)]">
                <button
                  type="button"
                  onClick={() => setOutputOpen((o) => !o)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3 text-label transition-colors hover:text-[var(--text)]"
                >
                  <span className="flex items-center gap-2">
                    <span>Analysis output</span>
                    {isRunningAnalysis && <Loader2 className="h-3 w-3 animate-spin text-[var(--accent)]" />}
                    {analysisOutput && !isRunningAnalysis && <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />}
                  </span>
                  {outputOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </button>
                {outputOpen && (
                  <div className="max-h-[260px] overflow-y-auto border-t border-[var(--border)] px-5 py-3">
                    {analysisOutput ? (
                      <pre className="whitespace-pre-wrap font-mono text-[11px] text-[var(--subtext-1)]">{analysisOutput}</pre>
                    ) : (
                      <p className="text-meta text-[var(--subtext-0)]">Run the analysis to see output here.</p>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* Vault files */}
              {(vaultFiles ?? []).length > 0 && (
                <div className="shrink-0 border-t border-[var(--border)]">
                  <div className="px-5 py-3">
                    <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                      Files
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 px-3 pb-3">
                    {(vaultFiles ?? []).map((file) => (
                      <VaultFileRow
                        key={file.id}
                        file={file}
                        onDeleted={() => void queryClient.invalidateQueries({ queryKey: ["vault-files", selectedInvestigation?.case_id] })}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
              <p className="text-label">Analyst workbench</p>
              <p className="max-w-[460px] text-ui text-[var(--subtext-0)]">
                Three phases — Brief, Collect, Analyse. Each investigation produces a Scoping Brief, Post draft, or Legacy Threat Analysis depending on the use case.
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
          deleteInvestigationMutation.mutate({ caseId: selectedInvestigation.case_id });
          setDeleteConfirmOpen(false);
        }}
      />
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function DeleteInvestigationModal({
  open, investigationName, caseId, isPending, onClose, onConfirm,
}: {
  open: boolean; investigationName: string; caseId: string; isPending: boolean;
  onClose: () => void; onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,7,8,0.72)] p-6 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !isPending) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete investigation"
        className="flex w-full max-w-[460px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="border-b border-[var(--border)] px-5 py-4">
          <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--danger)]">Delete investigation</p>
          <h3 className="mt-1 truncate font-ui text-[15px] font-medium text-[var(--text)]">{investigationName}</h3>
          <p className="mt-2 font-mono text-[11px] text-[var(--overlay-1)]">{caseId}</p>
        </div>
        <div className="grid gap-3 px-5 py-4">
          <p className="font-ui text-[13px] text-[var(--subtext-0)]">
            Removes the investigation record, attached signals, and vault folder.
          </p>
          <p className="font-ui text-[12px] text-[var(--overlay-1)]">Source signals and project signals are not deleted.</p>
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={onConfirm} disabled={isPending} className="gap-1.5">
              <Trash2 className="h-3 w-3" />
              {isPending ? "Deleting…" : "Delete investigation"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhaseActionFoot({
  runLabel, running, disabled, hint, onRun, runIcon,
}: {
  runLabel: string; running: boolean; disabled: boolean; hint: string;
  onRun: () => void; runIcon: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
      <span className={cn("flex items-center gap-1.5 text-meta", disabled && !running ? "text-[var(--warning)]" : "text-[var(--subtext-0)]")}>
        {disabled && !running && <AlertCircle className="h-3.5 w-3.5" />}
        {hint}
      </span>
      <Button onClick={onRun} disabled={disabled} className="gap-1.5">
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : runIcon}
        {running ? "Running…" : runLabel}
      </Button>
    </div>
  );
}
