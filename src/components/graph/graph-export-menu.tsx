import { GraphOverflowItem } from "./graph-controls";

export function GraphExportMenu({
  disabled,
  onPng,
  onSvg,
  onEmbed,
}: {
  disabled: boolean;
  onPng: () => void;
  onSvg: () => void;
  onEmbed: () => void;
}) {
  return (
    <>
      <GraphOverflowItem disabled={disabled} label="Export PNG…" onClick={onPng} />
      <GraphOverflowItem disabled={disabled} label="Export SVG…" onClick={onSvg} />
      <GraphOverflowItem disabled={disabled} label="Copy Docs embed" onClick={onEmbed} />
    </>
  );
}
