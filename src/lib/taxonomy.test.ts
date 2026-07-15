import { describe, expect, it } from "vitest";

import { ventureScopeLabel } from "@/lib/taxonomy";

describe("venture scope labels", () => {
  it("uses venture language for global and known entity scopes", () => {
    expect(ventureScopeLabel(null)).toBe("All ventures");
    expect(ventureScopeLabel("genzen_solutions")).toBe("GenZen Solutions");
    expect(ventureScopeLabel("future_venture")).toBe("Future Venture");
  });
});
