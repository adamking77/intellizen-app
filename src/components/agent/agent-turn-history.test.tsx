import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentTurn } from "./agent-turn";
import { transcriptFromHistory } from "@/engine/session-continuity";

describe("historical tool outcome presentation", () => {
  it("keeps historical output neutral while retaining tool failure text for inspection", () => {
    const transcript = transcriptFromHistory("fiona", [{ role: "assistant", text: "Inspecting" }, { role: "tool", name: "read_file", text: "Error: permission denied" }]);
    const html = renderToStaticMarkup(<AgentTurn message={transcript.messages[0]} profile={null} now={0} />);
    expect(html).toContain(">recorded<");
    expect(html).not.toContain(">verified<");
    expect(html).not.toContain(">running<");
    expect(transcript.messages[0].tools?.[0].resultText).toBe("Error: permission denied");
  });
  it("keeps a live tool without a result in the running state", () => {
    const html = renderToStaticMarkup(<AgentTurn message={{ id: "live", from: "fiona", text: "", tools: [{ id: "tool", name: "read_file", title: "read_file" }] }} profile={null} now={0} />);
    expect(html).toContain(">running<");
    expect(html).not.toContain(">recorded<");
  });
});
