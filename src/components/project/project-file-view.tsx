import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { QueryState } from "@/components/ui/query-state";
import { highlightLines, type TokenKind } from "@/lib/highlight";
import { readProjectFile, readProjectImage, type ProjectFile, type ProjectFileView as FileViewData } from "@/services/project-files";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"]);
const TOKEN_COLORS: Partial<Record<TokenKind, string>> = {
  comment: "var(--overlay-1)", string: "var(--green)", number: "var(--peach)",
  keyword: "var(--mauve)", punct: "var(--text-muted)",
};

export function ProjectFileView({ file, folders }: { file: ProjectFile; folders: string[] }) {
  const extension = fileExtension(file.path);
  const image = IMAGE_EXTENSIONS.has(extension);
  const content = useQuery<ArrayBuffer | FileViewData>({
    queryKey: ["project-file", file.path, folders],
    queryFn: async () => image ? readProjectImage(file.path, folders) : readProjectFile(file.path, folders),
  });
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!image || !(content.data instanceof ArrayBuffer)) {
      setImageUrl(null);
      return;
    }
    const mime = extension === "svg" ? "image/svg+xml" : `image/${extension === "jpg" ? "jpeg" : extension}`;
    const url = URL.createObjectURL(new Blob([content.data], { type: mime }));
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [content.data, extension, image]);

  return (
    <QueryState
      isLoading={content.isLoading}
      error={content.error}
      isEmpty={false}
      loadingLabel="Reading project file"
      errorTitle="File unavailable"
      onRetry={() => void content.refetch()}
    >
      {image ? imageUrl ? <img src={imageUrl} alt={file.title} className="max-h-[70vh] max-w-full rounded-[var(--r-plane)] object-contain" /> : null
        : content.data && !(content.data instanceof ArrayBuffer) ? <FileContent view={content.data} /> : null}
    </QueryState>
  );
}

function fileExtension(path: string) {
  const name = path.split("/").pop() ?? "";
  return name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
}

function FileContent({ view }: { view: Awaited<ReturnType<typeof readProjectFile>> }) {
  if (view.kind === "binary") {
    return <p className="text-[var(--t-meta)] text-[var(--text-muted)]">This {view.ext || "binary"} file is {formatBytes(view.bytes)} and cannot be displayed here.</p>;
  }
  const lines = highlightLines(view.text, view.ext);
  const gutter = String(lines.length).length;
  return (
    <pre className="m-0 max-h-[70vh] overflow-auto rounded-[var(--r-plane)] bg-[var(--crust)] py-3 font-mono text-[var(--t-meta)] leading-relaxed text-[var(--text)]" tabIndex={0}>
      <code>
        {lines.map((line, index) => (
          <span key={index} className="flex px-3">
            <span aria-hidden className="mr-4 shrink-0 select-none text-right text-[var(--overlay-0)]" style={{ width: `${gutter}ch` }}>{index + 1}</span>
            <span className="grow whitespace-pre">{line.map((token, tokenIndex) => <span key={tokenIndex} style={{ color: TOKEN_COLORS[token.kind] }}>{token.text}</span>)}</span>
          </span>
        ))}
      </code>
    </pre>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
