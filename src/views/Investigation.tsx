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
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createInvestigation,
  getInvestigation,
  listInvestigations,
  listInvestigationSignals,
  saveInvestigationPlan,
  updateInvestigationPhase,
} from "@/lib/data";
import { spawnClaude, buildPhasePrompt } from "@/lib/shell";
import { ensureInvestigationDirectory } from "@/lib/vault";
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
    mutationFn: (phase: number) => updateInvestigationPhase(selectedCaseId!, phase),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["investigation", selectedCaseId] });
    },
  });

  const selectedPhase = selectedInvestigation?.current_phase ?? 1;

  async function handleRunPhase(phase: number) {
    if (!selectedInvestigation) return;
    
    setIsRunningPhase(true);
    setPhaseOutput(null);

    try {
      // Ensure directory exists
      await ensureInvestigationDirectory(selectedInvestigation.case_id);

      // Build prompt for this phase
      const prompt = buildPhasePrompt(selectedInvestigation.case_id, phase, {
        subjectDefinition: selectedInvestigation.subject_definition ?? undefined,
        investigationScope: selectedInvestigation.investigation_scope ?? undefined,
        seedEntities: selectedInvestigation.seed_entities ?? undefined,
      });

      const result = await spawnClaude({ prompt });

      if (result.success) {
        setPhaseOutput(result.output ?? "Phase completed successfully.");
        // Auto-advance to next phase if not on final phase
        if (phase < 6) {
          advancePhaseMutation.mutate(phase + 1);
        }
      } else {
        setPhaseOutput(`Error: ${result.error}`);
      }
    } catch (error) {
      setPhaseOutput(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsRunningPhase(false);
    }
  }

  function handleSavePlan() {
    savePlanMutation.mutate({
      subjectDefinition: planForm.subjectDefinition,
      investigationScope: planForm.investigationScope,
      proportionality: planForm.proportionality,
      legality: planForm.legality,
      accountability: planForm.accountability,
      necessity: planForm.necessity,
      seedEntities: planForm.seedEntities.split("\n").filter(Boolean),
      knownHypotheses: planForm.knownHypotheses.split("\n").filter(Boolean),
    });
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
            {(investigations ?? []).map((inv) => (
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
                    <p className="text-xs text-[var(--muted-foreground)]">{inv.case_id}</p>
                  </div>
                  <Badge variant={inv.status === "active" ? "success" : "neutral"}>
                    {inv.status}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Clock className="h-3 w-3 text-[var(--muted-foreground)]" />
                  <span className="text-xs text-[var(--muted-foreground)]">
                    Phase {inv.current_phase}: {PHASES[inv.current_phase - 1]?.name}
                  </span>
                </div>
              </button>
            ))}
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
                                : "border-[var(--border)] text-[var(--muted-foreground)]"
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
                                isActive ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"
                              }`}
                            >
                              {phase.name}
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
                    <p className="text-sm text-[var(--muted-foreground)] mt-1">
                      {PHASES[selectedPhase - 1]?.description}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {selectedPhase < 6 && (
                      <Button
                        variant="secondary"
                        onClick={() => advancePhaseMutation.mutate(selectedPhase + 1)}
                        disabled={advancePhaseMutation.isPending}
                      >
                        Skip Phase
                      </Button>
                    )}
                    <Button
                      onClick={() => handleRunPhase(selectedPhase)}
                      disabled={isRunningPhase || (selectedPhase === 1 && !planGateComplete)}
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

                    <Button onClick={handleSavePlan} disabled={!planGateComplete || savePlanMutation.isPending}>
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
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Signals attached to this investigation. Run collection to gather intelligence on seed entities.
                    </p>
                    <div className="space-y-2">
                      {(investigationSignals ?? []).length === 0 ? (
                        <div className="text-center py-8 text-[var(--muted-foreground)]">
                          No signals yet. Run collection or import from Inbox.
                        </div>
                      ) : (
                        (investigationSignals ?? []).map((sig) => (
                          <div
                            key={sig.id}
                            className="rounded-xl border border-[var(--border)] p-3"
                          >
                            <p className="font-medium text-sm">{sig.intel_signals?.title}</p>
                            <p className="text-xs text-[var(--muted-foreground)]">
                              {sig.intel_signals?.source}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Phase 3-5: Placeholder content */}
                {selectedPhase >= 3 && selectedPhase <= 5 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--surface)]/50">
                      <Target className="h-5 w-5 text-[var(--accent)]" />
                      <p className="text-sm">
                        This phase requires running the Claude analysis. Click "Run Phase" to execute.
                      </p>
                    </div>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {selectedPhase === 3 && "Entity extraction from collected intelligence."}
                      {selectedPhase === 4 && "Chronological reconstruction of events."}
                      {selectedPhase === 5 && "Analysis of Competing Hypotheses (ACH)."}
                    </p>
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
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Generate the final intelligence report based on all previous phases.
                    </p>
                  </div>
                )}

                {/* Phase Output */}
                {phaseOutput && (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/50 p-4">
                    <p className="text-sm font-medium mb-2">Phase Output</p>
                    <pre className="text-xs text-[var(--muted-foreground)] whitespace-pre-wrap overflow-auto max-h-64">
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
              <FolderOpen className="h-12 w-12 mx-auto text-[var(--muted-foreground)] mb-4" />
              <p className="text-lg font-medium text-[var(--foreground)]">Select an investigation</p>
              <p className="text-sm text-[var(--muted-foreground)]">
                Choose a case from the sidebar or create a new one to begin.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
