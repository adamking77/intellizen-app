import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  FileText,
  FileClock,
  FolderOpen,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";

import { MarkdownBody } from "@/components/ui/markdown-body";
import { cn } from "@/lib/utils";
import { useWindowSize } from "@/lib/use-window-size";
import { readVaultDirectory, readVaultFile } from "@/lib/vault";
import { listInvestigations } from "@/lib/data";
import type { VaultEntry } from "@/lib/vault";
import type { Investigation } from "@/lib/types";

export function ReportsView() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);

  const { isCramped } = useWindowSize();
  const [leftOpen, setLeftOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("intelizen:reports-left-open") !== "0";
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
    if (isCramped) setLeftOpen(false);
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
              <span className="text-label">Vault</span>
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
                  <p className="text-label">Vault is empty</p>
                  <p className="mt-1 text-meta text-[var(--subtext-0)]">
                    Complete an investigation to populate the vault.
                  </p>
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
            <span className="text-label">Reports</span>
            {fileName && !isCramped && (
              <div className="flex min-w-0 items-center gap-1.5">
                <ChevronRight className="h-3 w-3 shrink-0 text-[var(--overlay-0)]" />
                <span className="truncate text-meta text-[var(--text)]">{fileName}</span>
              </div>
            )}
          </div>

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
        </div>

        <div className="flex-1 overflow-y-auto">
          {selectedPath && fileContent !== null ? (
            <div className="px-[clamp(40px,8%,120px)] py-10">
              <p className="font-mono text-[11px] text-[var(--overlay-1)]">{selectedPath}</p>
              <div className="mt-4">
                <MarkdownBody content={fileContent} />
              </div>
            </div>
          ) : selectedPath ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-2 text-meta">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-10">
              <div className="max-w-[380px] text-center">
                <FileClock className="mx-auto mb-4 h-10 w-10 text-[var(--overlay-1)]" />
                <p className="text-heading">Select a file to view</p>
                <p className="mt-1 text-meta text-[var(--subtext-0)]">
                  Browse investigation outputs in the vault on the left.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VaultGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="px-2 pb-1 text-label">{label}</p>
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
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-meta text-[var(--subtext-1)] transition-colors hover:bg-[var(--surface-wash)]"
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
        "relative flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-meta transition-colors",
        isSelected
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "text-[var(--subtext-1)] hover:bg-[var(--surface-wash)]",
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {isSelected && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-l bg-[var(--accent)]"
        />
      )}
      <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}
