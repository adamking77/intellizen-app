import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  FileText,
  FileClock,
  FolderOpen,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useWindowSize } from "@/lib/use-window-size";
import {
  ensureInvestigationDirectory,
  readVaultDirectory,
  readVaultFile,
  writeVaultFile,
} from "@/lib/vault";
import { createVaultFile, listInvestigations, listSignals } from "@/lib/data";
import { spawnClaude, buildReportPrompt } from "@/lib/shell";
import type { VaultEntry } from "@/lib/vault";
import type { Investigation, VaultFileType } from "@/lib/types";

const REPORT_TYPES = [
  { id: "internal", label: "Internal Sweep", description: "Analyst-facing summary" },
  { id: "client", label: "Client Assessment", description: "Diagnostic framing" },
  { id: "deep", label: "Deep Case Report", description: "Full methodology exposed" },
  { id: "public", label: "Public Brief", description: "Accessible language" },
] as const;

const REPORT_FILE_TYPES: Record<(typeof REPORT_TYPES)[number]["id"], VaultFileType> = {
  internal: "sweep",
  client: "assessment",
  deep: "report",
  public: "brief",
};

export function ReportsView() {
  const queryClient = useQueryClient();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [selectedSignals, setSelectedSignals] = useState<Set<number>>(new Set());
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedReportType, setSelectedReportType] =
    useState<typeof REPORT_TYPES[number]["id"]>("internal");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationOutput, setGenerationOutput] = useState<string | null>(null);

  const { isCramped } = useWindowSize();
  const [leftOpen, setLeftOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("intelizen:reports-left-open") !== "0";
    } catch {
      return true;
    }
  });
  const [rightOpen, setRightOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("intelizen:reports-right-open") !== "0";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("intelizen:reports-left-open", leftOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [leftOpen]);
  useEffect(() => {
    try {
      localStorage.setItem("intelizen:reports-right-open", rightOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [rightOpen]);
  useEffect(() => {
    if (isCramped) setRightOpen(false);
  }, [isCramped]);

  const { data: vaultEntries, isLoading: isLoadingVault } = useQuery({
    queryKey: ["vault-entries"],
    queryFn: () => readVaultDirectory(),
  });

  const { data: investigations } = useQuery({
    queryKey: ["investigations"],
    queryFn: listInvestigations,
  });

  useEffect(() => {
    if (!investigations?.length) return;
    if (!selectedCaseId || !investigations.some((inv) => inv.case_id === selectedCaseId)) {
      setSelectedCaseId(investigations[0].case_id);
    }
  }, [investigations, selectedCaseId]);

  const { data: savedSignals } = useQuery({
    queryKey: ["signals", "saved"],
    queryFn: async () => {
      const signals = await listSignals();
      return signals.filter((s) => s.status === "saved");
    },
  });

  useEffect(() => {
    if (!selectedPath) {
      setFileContent(null);
      return;
    }
    void (async () => {
      const content = await readVaultFile(selectedPath);
      setFileContent(content);
    })();
  }, [selectedPath]);

  const organizedEntries = useMemo(() => {
    if (!vaultEntries) return { investigations: [], reports: [], other: [] };
    return {
      investigations: vaultEntries.filter(
        (e) => e.isDirectory && e.name === "investigations",
      ),
      reports: vaultEntries.filter(
        (e) => !e.isDirectory && (e.name.endsWith(".md") || e.name.endsWith(".txt")),
      ),
      other: vaultEntries.filter(
        (e) =>
          e.name !== "investigations" &&
          !e.name.endsWith(".md") &&
          !e.name.endsWith(".txt"),
      ),
    };
  }, [vaultEntries]);

  async function handleGenerateReport() {
    if (selectedSignals.size === 0) return;
    if (!selectedCaseId) {
      setGenerationOutput("Select an investigation case before generating a report.");
      return;
    }

    setIsGenerating(true);
    setGenerationOutput(null);

    try {
      const signals = (savedSignals ?? []).filter((s) => selectedSignals.has(s.id));
      const prompt = buildReportPrompt(
        selectedReportType,
        signals.map((s) => ({
          title: s.title,
          snippet: s.snippet ?? "",
          source: s.source ?? "unknown",
        })),
      );

      const result = await spawnClaude({ prompt });

      if (result.success) {
        const output = result.output?.trim() || "Report generated successfully.";
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName = `${selectedReportType}-${timestamp}.md`;
        const casePath = `investigations/${selectedCaseId}`;
        const filePath = `${casePath}/${fileName}`;
        const content = `# ${
          REPORT_TYPES.find((type) => type.id === selectedReportType)?.label ?? "Report"
        }\n\nGenerated at: ${new Date().toISOString()}\n\n---\n\n${output}\n`;

        await ensureInvestigationDirectory(selectedCaseId);
        await writeVaultFile(filePath, content);
        await createVaultFile({
          caseId: selectedCaseId,
          fileType: REPORT_FILE_TYPES[selectedReportType],
          filePath,
          fileName,
          reportType: selectedReportType,
        });

        setSelectedPath(filePath);
        setGenerationOutput(output);
        void queryClient.invalidateQueries({ queryKey: ["vault-entries"] });
      } else {
        setGenerationOutput(`Error: ${result.error}`);
      }
    } catch (error) {
      setGenerationOutput(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function toggleSignal(id: number) {
    setSelectedSignals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const fileName = selectedPath ? selectedPath.split("/").pop() ?? selectedPath : null;

  return (
    <div className="relative flex h-[calc(100dvh)] w-full overflow-hidden bg-[var(--base)]">
      {/* ============================================================
          LEFT RAIL — Vault browser
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
                Vault
              </span>
              <button
                type="button"
                onClick={() => setLeftOpen(false)}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                title="Hide vault"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {isLoadingVault ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
                </div>
              ) : vaultEntries?.length === 0 ? (
                <div className="px-2 py-6 text-center">
                  <FolderOpen className="mx-auto mb-2 h-6 w-6 text-[var(--overlay-1)]" />
                  <p className="font-ui text-[11px] text-[var(--overlay-1)]">Vault is empty</p>
                </div>
              ) : (
                <>
                  {organizedEntries.investigations.length > 0 && (
                    <VaultGroup label="Investigations">
                      {organizedEntries.investigations.map((entry) => (
                        <VaultEntryItem
                          key={entry.path}
                          entry={entry}
                          selectedPath={selectedPath}
                          onSelect={setSelectedPath}
                          investigations={investigations}
                        />
                      ))}
                    </VaultGroup>
                  )}
                  {organizedEntries.reports.length > 0 && (
                    <VaultGroup label="Reports">
                      {organizedEntries.reports.map((entry) => (
                        <VaultEntryItem
                          key={entry.path}
                          entry={entry}
                          selectedPath={selectedPath}
                          onSelect={setSelectedPath}
                        />
                      ))}
                    </VaultGroup>
                  )}
                  {organizedEntries.other.length > 0 && (
                    <VaultGroup label="Other">
                      {organizedEntries.other.map((entry) => (
                        <VaultEntryItem
                          key={entry.path}
                          entry={entry}
                          selectedPath={selectedPath}
                          onSelect={setSelectedPath}
                        />
                      ))}
                    </VaultGroup>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </aside>

      {/* ============================================================
          MAIN COLUMN — Topbar + reader
          ============================================================ */}
      <div className="relative flex flex-1 min-w-0 flex-col">
        <div className="relative z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--base)] px-4">
          <div className="flex min-w-0 items-center gap-3">
            {!leftOpen && (
              <button
                type="button"
                onClick={() => setLeftOpen(true)}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                title="Show vault"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            <div className="flex min-w-0 items-center gap-1.5 font-ui text-[12px]">
              <span className="text-[var(--overlay-1)]">Reports</span>
              {fileName && !isCramped && (
                <>
                  <ChevronRight className="h-3 w-3 shrink-0 text-[var(--overlay-0)]" />
                  <span className="truncate text-[var(--text)]">{fileName}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {selectedPath && (
              <button
                type="button"
                onClick={() => setSelectedPath(null)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2.5 font-ui text-[11px] font-medium text-[var(--subtext-0)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                title="Close file"
              >
                <X className="h-3 w-3" />
                Close
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

        <div className="flex-1 overflow-y-auto">
          {selectedPath && fileContent !== null ? (
            <div className="mx-auto max-w-[880px] px-6 py-8">
              <p className="font-mono text-[11px] text-[var(--overlay-1)]">{selectedPath}</p>
              <pre className="mt-4 whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-[var(--subtext-1)]">
                {fileContent}
              </pre>
            </div>
          ) : selectedPath ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-2 font-ui text-[12px] text-[var(--overlay-1)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-10">
              <div className="max-w-[380px] text-center">
                <FileClock className="mx-auto mb-4 h-10 w-10 text-[var(--overlay-1)]" />
                <p className="font-ui text-[15px] font-medium text-[var(--text)]">
                  Select a file to view
                </p>
                <p className="mt-1 font-ui text-[12px] text-[var(--subtext-0)]">
                  Browse the vault on the left or generate a new report from the right.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================
          RIGHT RAIL — Generate report
          ============================================================ */}
      <aside
        style={{ width: rightOpen ? 340 : 0 }}
        className={cn(
          "relative flex h-full shrink-0 flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--mantle)]",
          "transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        )}
      >
        {rightOpen && (
          <>
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
              <div className="flex items-center gap-1.5 font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
                Generate report
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
              <p className="font-ui text-[11px] text-[var(--overlay-1)]">
                Select saved signals and generate a report.
              </p>

              <div className="mt-3 space-y-1">
                <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                  Signals
                </p>
                <div className="max-h-[220px] space-y-1 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--base)] p-1">
                  {(savedSignals ?? []).length === 0 ? (
                    <p className="py-4 text-center font-ui text-[11px] text-[var(--overlay-1)]">
                      No saved signals
                    </p>
                  ) : (
                    (savedSignals ?? []).map((signal) => (
                      <label
                        key={signal.id}
                        className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 transition-colors hover:bg-[var(--surface-wash)]"
                      >
                        <Checkbox
                          checked={selectedSignals.has(signal.id)}
                          onCheckedChange={() => toggleSignal(signal.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-ui text-[12px] text-[var(--text)]">
                            {signal.title}
                          </p>
                          <p className="truncate font-mono text-[10px] text-[var(--overlay-1)]">
                            {signal.source}
                          </p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                <label className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                  Investigation case
                </label>
                <select
                  className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--base)] px-2 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                  value={selectedCaseId ?? ""}
                  onChange={(e) => setSelectedCaseId(e.target.value || null)}
                >
                  {(investigations ?? []).length === 0 ? (
                    <option value="">No investigations available</option>
                  ) : (
                    (investigations ?? []).map((investigation) => (
                      <option key={investigation.case_id} value={investigation.case_id}>
                        {investigation.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="mt-3 space-y-1.5">
                <label className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                  Report type
                </label>
                <select
                  className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--base)] px-2 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
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
                <p className="font-ui text-[10.5px] text-[var(--overlay-1)]">
                  {REPORT_TYPES.find((t) => t.id === selectedReportType)?.description}
                </p>
              </div>

              <Button
                className="mt-4 w-full"
                onClick={handleGenerateReport}
                disabled={selectedSignals.size === 0 || isGenerating || !selectedCaseId}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate ({selectedSignals.size})
                  </>
                )}
              </Button>

              {generationOutput && (
                <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--base)] p-3">
                  <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                    Output preview
                  </p>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-[var(--subtext-1)]">
                    {generationOutput.slice(0, 500)}
                    {generationOutput.length > 500 && "..."}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function VaultGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="px-2 pb-1 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function VaultEntryItem({
  entry,
  selectedPath,
  onSelect,
  investigations,
  depth = 0,
}: {
  entry: VaultEntry;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  investigations?: Investigation[];
  depth?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isSelected = selectedPath === entry.path;

  const investigationName = useMemo(() => {
    if (!investigations || entry.name === "investigations") return null;
    const inv = investigations.find((i) => entry.name.includes(i.case_id));
    return inv?.name;
  }, [entry.name, investigations]);

  if (entry.isDirectory) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-ui text-[12px] text-[var(--subtext-1)] transition-colors hover:bg-[var(--surface-wash)]"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <FolderOpen className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span className="truncate">{investigationName || entry.name}</span>
        </button>
        {isExpanded && entry.children && (
          <div>
            {entry.children.map((child) => (
              <VaultEntryItem
                key={child.path}
                entry={child}
                selectedPath={selectedPath}
                onSelect={onSelect}
                investigations={investigations}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.path)}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-ui text-[12px] transition-colors",
        isSelected
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "text-[var(--subtext-1)] hover:bg-[var(--surface-wash)]",
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}
