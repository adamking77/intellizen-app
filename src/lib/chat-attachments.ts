const CHAT_TEXT_FILE_EXTENSIONS = new Set([
  "csv",
  "json",
  "log",
  "md",
  "mdx",
  "text",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

export const MAX_CHAT_TEXT_FILE_BYTES = 64_000;
export const MAX_CHAT_TEXT_FILES = 3;

export function supportsChatTextFile(file: Pick<File, "name" | "type">) {
  if (file.type.startsWith("text/")) return true;
  if (file.type === "application/json" || file.type === "application/xml") return true;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return CHAT_TEXT_FILE_EXTENSIONS.has(extension);
}

export function formatChatTextAttachment(name: string, content: string) {
  const normalized = content.trim();
  const fence = normalized.includes("```") ? "````" : "```";
  return `Attached text file: ${name}\n\n${fence}\n${normalized}\n${fence}`;
}
