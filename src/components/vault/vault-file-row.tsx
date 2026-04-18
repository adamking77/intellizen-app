import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { readFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { FileImage, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/toast";
import { getVaultAbsolutePath } from "@/lib/vault";
import type { VaultFile } from "@/lib/types";

export function VaultFileRow({ file }: { file: VaultFile }) {
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const loadedRef = useRef(false);

  const label = file.file_path.split("/").pop() ?? file.file_path;
  const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(label);

  async function loadThumbnail() {
    if (loadedRef.current || !isImage) return;
    loadedRef.current = true;
    try {
      const absPath = await getVaultAbsolutePath(file.file_path);
      const data = await readFile(absPath);
      const blob = new Blob([data], { type: "image/png" });
      setThumbnailSrc(URL.createObjectURL(blob));
    } catch {
      // no thumbnail if unreadable
    }
  }

  useEffect(() => {
    const src = thumbnailSrc;
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [thumbnailSrc]);

  function handleMouseEnter(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: rect.left, y: rect.top });
    setShowTooltip(true);
    void loadThumbnail();
  }

  async function handleOpen() {
    try {
      const absPath = await getVaultAbsolutePath(file.file_path);
      await openPath(absPath);
    } catch (err) {
      toastError("Could not open file", err);
    }
  }

  const icon = isImage ? (
    <FileImage className="h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)]" />
  ) : (
    <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)]" />
  );

  return (
    <>
      <div
        className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-[var(--surface-0)]"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--subtext-0)]">
          {label}
        </span>
        <span className="shrink-0 rounded bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-[var(--overlay-1)]">
          {file.file_type}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 shrink-0 px-2 text-[11px]"
          onClick={() => void handleOpen()}
        >
          Open
        </Button>
      </div>

      {showTooltip && thumbnailSrc && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--mantle)] shadow-[0_8px_32px_rgba(0,0,0,0.55)]"
          style={{
            right: window.innerWidth - tooltipPos.x + 8,
            top: Math.max(8, tooltipPos.y - 4),
            width: 240,
          }}
        >
          <img src={thumbnailSrc} alt={label} className="block w-full" />
        </div>,
        document.body,
      )}
    </>
  );
}
