import { describe, expect, it } from "vitest";

import {
  builtinBindingRefForRoleOccupant,
  effectiveRuntimeBindings,
  HERMES_FIONA_BINDING,
  type RuntimeBinding,
} from "@/services/runtime-bindings";

describe("runtime binding policy", () => {
  it("always supplies the one reviewed built-in durable Hermes binding", () => {
    expect(effectiveRuntimeBindings([])).toEqual([HERMES_FIONA_BINDING]);
    expect(
      builtinBindingRefForRoleOccupant("operations_director", "fiona"),
    ).toBe("hermes-fiona");
  });

  it("does not infer Hermes for another role or occupant", () => {
    expect(
      builtinBindingRefForRoleOccupant("chief_engineer", "fiona"),
    ).toBeNull();
    expect(
      builtinBindingRefForRoleOccupant("operations_director", "keel"),
    ).toBeNull();
  });

  it("prevents a persisted binding from replacing the built-in contract", () => {
    const conflicting = {
      ...HERMES_FIONA_BINDING,
      adapterId: "codex-cli",
    } as RuntimeBinding;
    const effective = effectiveRuntimeBindings([conflicting]);
    expect(effective).toHaveLength(1);
    expect(effective[0]).toEqual(HERMES_FIONA_BINDING);
  });
});
