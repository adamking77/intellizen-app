import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DecisionField } from "./decision-field";

describe("DecisionField", () => {
  it("renders every choice and marks the recommendation primary", () => {
    const html = renderToStaticMarkup(createElement(DecisionField, {
      question: "Ship this?",
      why: "The checks are green.",
      choices: [
        { id: "yes", label: "Ship", recommended: true },
        { id: "no", label: "Wait" },
      ],
      onChoose: () => undefined,
    }));
    expect(html).toContain("Waiting on you");
    expect(html).toContain("Ship");
    expect(html).toContain("Wait");
    expect(html).toContain("--go-bg");
  });
});
