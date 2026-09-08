export function ToolbarIcon({ name }: { name: string }) {
  switch (name) {
    case "text":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="6" width="15" height="12" rx="3" /><path d="M8 10h8" /><path d="M8 14h5.5" /></svg>;
    case "group":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="7" width="9" height="9" rx="2" /><rect x="10" y="10" width="9" height="9" rx="2" /></svg>;
    case "file":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.5h6l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 7 19V6A1.5 1.5 0 0 1 8 4.5Z" /><path d="M14 4.5V9h4" /></svg>;
    case "image":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="6" width="15" height="12" rx="2" /><circle cx="10" cy="10" r="1.5" /><path d="M7 16l3.5-3.5L13 15l2.5-2.5L17.5 15" /></svg>;
    case "background":
      return <svg viewBox="0 0 24 24" aria-hidden="true">{[7, 12, 17].flatMap((x) => [7, 12, 17].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.25" />))}</svg>;
    case "delete":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14" /><path d="M9 7V5.5h6V7" /><path d="M8 9.5v8" /><path d="M12 9.5v8" /><path d="M16 9.5v8" /><path d="M6.5 7l1 11.5a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9l1-11.5" /></svg>;
    case "color":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5a6.5 6.5 0 1 0 0 13c1.2 0 1.9-.6 1.9-1.4 0-.7-.3-1.2-.3-1.8 0-1 1-1.3 1.8-1.3h.8A3.8 3.8 0 0 0 20 10.2 4.7 4.7 0 0 0 15.3 5.5Z" /><circle cx="8.5" cy="11" r="1" /><circle cx="11.5" cy="8.5" r="1" /><circle cx="15" cy="9.5" r="1" /></svg>;
    case "shape":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10l-2 10H5l2-10Z" /></svg>;
    case "edit":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18l3.5-.5L18 9l-3-3-8.5 8.5L6 18Z" /><path d="M13.5 7.5l3 3" /></svg>;
    case "align":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12" /><path d="M8 12h8" /><path d="M6 16h12" /></svg>;
    case "border":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="6" width="14" height="12" rx="2" /><path d="M5 10h14" /></svg>;
    case "line":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h3" /><path d="M10 12h4" /><path d="M16 12h3" /></svg>;
    case "arrow":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h11" /><path d="M13.5 8.5 19 12l-5.5 3.5" /></svg>;
    default:
      return null;
  }
}
