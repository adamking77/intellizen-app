export async function writeTextToClipboard(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | null | undefined =
    globalThis.navigator?.clipboard,
) {
  if (clipboard?.writeText) {
    await clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  try {
    textarea.select();
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard access was denied.");
    }
  } finally {
    textarea.remove();
  }
}
