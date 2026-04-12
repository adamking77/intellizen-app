import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  FolderOpen,
  Loader2,
  Sparkles,
  FileClock,
} from "lucide-react";


import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { readVaultDirectory, readVaultFile } from "@/lib/vault";
import { listInvestigations, listSignals } from "@/lib/data";
import { spawnClaude, buildReportPrompt } from "@/lib/shell";
import type { VaultEntry } from "@/lib/vault";
import type { Investigation } from "@/lib/types";

const REPORT_TYPES = [
  { id: "internal", label: "Internal Sweep", description: "Analyst-facing summary" },
  { id: "client", label: "Client Assessment", description: "Diagnostic framing" },
  { id: "deep", label: "Deep Case Report", description: "Full methodology exposed" },
  { id: "public", label: "Public Brief", description: "Accessible language" },
] as const;

export function ReportsView() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [selectedSignals, setSelectedSignals] = useState<Set<number>>(new Set());
  const [selectedReportType, setSelectedReportType] = useState<typeof REPORT_TYPES[number]["id"]>("internal");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationOutput, setGenerationOutput] = useState<string | null>(null);

  // Query vault directory
  const { data: vaultEntries, isLoading: isLoadingVault } = useQuery({
    queryKey: ["vault-entries"],
    queryFn: () => readVaultDirectory(),
  });

  // Query investigations for context
  const { data: investigations } = useQuery({
    queryKey: ["investigations"],
    queryFn: listInvestigations,
  });

  // Query saved signals for trigger analysis
  const { data: savedSignals } = useQuery({
    queryKey: ["signals", "saved"],
    queryFn: async () => {
      const signals = await listSignals();
      return signals.filter((s) => s.status === "saved");
    },
  });

  // Read selected file
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

  // Organize vault entries
  const organizedEntries = useMemo(() => {
    if (!vaultEntries) return { investigations: [], reports: [], other: [] };

    return {
      investigations: vaultEntries.filter((e) => e.isDirectory && e.name === "investigations"),
      reports: vaultEntries.filter(
        (e) => !e.isDirectory && (e.name.endsWith(".md") || e.name.endsWith(".txt"))
      ),
      other: vaultEntries.filter(
        (e) => e.name !== "investigations" && !e.name.endsWith(".md") && !e.name.endsWith(".txt")
      ),
    };
  }, [vaultEntries]);

  async function handleGenerateReport() {
    if (selectedSignals.size === 0) return;

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
        }))
      );

      const result = await spawnClaude({ prompt });

      if (result.success) {
        setGenerationOutput(result.output ?? "Report generated successfully.");
      } else {
        setGenerationOutput(`Error: ${result.error}`);
      }
    } catch (error) {
      setGenerationOutput(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsGenerating(false);
    }
  }

  function toggleSignal(id: number) {
    setSelectedSignals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      {/* Sidebar */}
      <div className="space-y-4">
        {/* Vault Browser */}
        <Card>
          <CardHeader>
            <CardTitle>Vault</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingVault ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Investigations */}
                {organizedEntries.investigations.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
                      Investigations
                    </p>
                    <div className="space-y-1">
                      {organizedEntries.investigations.map((entry) => (
                        <VaultEntryItem
                          key={entry.path}
                          entry={entry}
                          selectedPath={selectedPath}
                          onSelect={setSelectedPath}
                          investigations={investigations}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Reports */}
                {organizedEntries.reports.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
                      Reports
                    </p>
                    <div className="space-y-1">
                      {organizedEntries.reports.map((entry) => (
                        <VaultEntryItem
                          key={entry.path}
                          entry={entry}
                          selectedPath={selectedPath}
                          onSelect={setSelectedPath}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Other Files */}
                {organizedEntries.other.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
                      Other
                    </p>
                    <div className="space-y-1">
                      {organizedEntries.other.map((entry) => (
                        <VaultEntryItem
                          key={entry.path}
                          entry={entry}
                          selectedPath={selectedPath}
                          onSelect={setSelectedPath}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {vaultEntries?.length === 0 && (
                  <div className="text-center py-4 text-[var(--muted-foreground)]">
                    <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Vault is empty</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trigger Analysis */}
        <Card>
          <CardHeader>
            <CardTitle>Trigger Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-[var(--muted-foreground)]">
              Select saved signals and generate a report.
            </p>

            <div className="space-y-2 max-h-48 overflow-auto">
              {(savedSignals ?? []).length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)] text-center py-4">
                  No saved signals
                </p>
              ) : (
                (savedSignals ?? []).map((signal) => (
                  <label
                    key={signal.id}
                    className="flex items-start gap-2 p-2 rounded-lg hover:bg-[var(--surface)] cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedSignals.has(signal.id)}
                      onCheckedChange={() => toggleSignal(signal.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{signal.title}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{signal.source}</p>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div>
              <label className="text-xs font-medium">Report Type</label>
              <select
                className="h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-2 text-sm mt-1"
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

            <Button
              className="w-full"
              onClick={handleGenerateReport}
              disabled={selectedSignals.size === 0 || isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Report ({selectedSignals.size})
                </>
              )}
            </Button>

            {generationOutput && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-3">
                <p className="text-xs font-medium mb-1">Output Preview</p>
                <pre className="text-xs text-[var(--muted-foreground)] whitespace-pre-wrap max-h-32 overflow-auto">
                  {generationOutput.slice(0, 500)}
                  {generationOutput.length > 500 && "..."}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content - File Viewer */}
      <Card className="flex flex-col">
        {selectedPath && fileContent !== null ? (
          <>
            <CardHeader className="border-b border-[var(--border)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[var(--accent)]" />
                  <CardTitle className="text-lg">{selectedPath}</CardTitle>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedPath(null)}>
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-6">
              <div className="prose prose-invert prose-sm max-w-none">
                <pre className="whitespace-pre-wrap font-mono text-sm text-[var(--foreground)]">
                  {fileContent}
                </pre>
              </div>
            </CardContent>
          </>
        ) : selectedPath ? (
          <CardContent className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)] mx-auto mb-4" />
              <p className="text-[var(--muted-foreground)]">Loading...</p>
            </div>
          </CardContent>
        ) : (
          <CardContent className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <FileClock className="h-16 w-16 text-[var(--muted-foreground)] mb-4" />
            <p className="text-lg font-medium text-[var(--foreground)]">Select a file to view</p>
            <p className="text-sm text-[var(--muted-foreground)] max-w-sm">
              Browse the vault on the left to view intelligence products, or use Trigger Analysis to generate new reports.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// Vault entry item component
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

  // Try to find investigation name for investigations folder
  const investigationName = useMemo(() => {
    if (!investigations || entry.name === "investigations") return null;
    const inv = investigations.find((i) => entry.name.includes(i.case_id));
    return inv?.name;
  }, [entry.name, investigations]);

  if (entry.isDirectory) {
    return (
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-[var(--surface)] text-left"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <FolderOpen className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-sm font-medium">{investigationName || entry.name}</span>
        </button>
        {isExpanded && entry.children && (
          <div className="mt-1">
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
      onClick={() => onSelect(entry.path)}
      className={`flex items-center gap-2 w-full p-2 rounded-lg text-left transition ${
        isSelected ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "hover:bg-[var(--surface)]"
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <FileText className="h-4 w-4 opacity-50" />
      <span className="text-sm truncate">{entry.name}</span>
    </button>
  );
}
