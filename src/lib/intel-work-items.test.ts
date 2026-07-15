import { describe, expect, it } from "vitest";

import {
  getClientCaseStage,
  getIntelWorkType,
  withClientCaseStage,
  withIntelWorkType,
} from "@/lib/intel-work-items";

describe("intel work-item metadata", () => {
  it("does not invent a work type for legacy operations", () => {
    expect(getIntelWorkType({ object_type: "operation" })).toBeNull();
    expect(getClientCaseStage({ object_type: "operation" })).toBeNull();
  });

  it("defaults a classified client case to Scoping", () => {
    expect(getClientCaseStage({ work_type: "client_case" })).toBe("scoping");
  });

  it("removes client stages from research work types", () => {
    expect(withIntelWorkType(
      { work_type: "client_case", case_stage: "report", folder: "Acme" },
      "venture_research",
    )).toEqual({ work_type: "venture_research", folder: "Acme" });
  });

  it("preserves taxonomy while setting a client stage", () => {
    expect(withClientCaseStage({ entity: "genzen_solutions" }, "discovery")).toEqual({
      entity: "genzen_solutions",
      work_type: "client_case",
      case_stage: "discovery",
    });
  });
});
