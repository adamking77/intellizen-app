// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/vault", () => ({ readVaultBinaryFile: vi.fn() }));
import { readVaultBinaryFile } from "@/lib/vault";
import { DocumentImage } from "./document-image";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
let client: QueryClient;
afterEach(async () => { await act(async () => root?.unmount()); client?.clear(); document.body.replaceChildren(); vi.restoreAllMocks(); });
async function render(path: string) {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(<QueryClientProvider client={client}><DocumentImage path={path} title="Cult connections" onBack={vi.fn()} /></QueryClientProvider>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  return host;
}
it("renders vault image bytes without offering text editing and releases the preview URL", async () => {
  vi.mocked(readVaultBinaryFile).mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const host = await render("projects/2/cult-connections.png");
  expect(readVaultBinaryFile).toHaveBeenCalledWith("projects/2/cult-connections.png");
  expect(create).toHaveBeenCalledWith(expect.any(Blob));
  expect(host.querySelector("img")?.getAttribute("src")).toBe("blob:preview");
  expect(host.querySelector("img")?.alt).toBe("Cult connections");
  expect(host.querySelector("textarea, input, [contenteditable] ")).toBeNull();
  expect(host.textContent).not.toMatch(/Editing|Save/);
  await act(async () => root.unmount());
  expect(revoke).toHaveBeenCalledWith("blob:preview");
});
it("offers retry when image bytes cannot be read", async () => {
  vi.mocked(readVaultBinaryFile).mockRejectedValue(new Error("File unavailable"));
  const host = await render("projects/2/missing.png");
  expect(host.textContent).toContain("Image could not be opened");
  expect(host.textContent).toContain("Retry");
  expect(host.querySelector("img")).toBeNull();
});
