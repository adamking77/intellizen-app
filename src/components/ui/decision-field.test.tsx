import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DecisionField } from "./decision-field";

describe("DecisionField", () => {
  it("renders every choice as an equal-weight, explicit recommendation", () => {
    const html = renderToStaticMarkup(createElement(DecisionField, {
      question: "Ship this?",
      why: "The checks are green.",
      choices: [
        { id: "yes", label: "Ship", recommended: true },
        { id: "no", label: "Wait" },
      ],
      onChoose: () => undefined,
    }));
    expect(html).toContain("A question for you");
    expect(html).toContain("Ship");
    expect(html).toContain("Wait");
    expect(html).toContain("· recommended");
    expect(html).toContain("--surface-line");
  });
});
