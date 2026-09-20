import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWorkflowInvocationIdentity,
  workflowInvocationIdentityFromLaunchConfig,
} from "./workflow-invocation-identity.js";

test("matching operator-configured caller may start a workflow", () => {
  const identity = workflowInvocationIdentityFromLaunchConfig({
    INTELLIZEN_MCP_CALLER_PRINCIPAL: "keel",
    INTELLIZEN_MCP_START_WORKFLOW: "allow",
  });

  assert.doesNotThrow(() => assertWorkflowInvocationIdentity(identity, "keel"));
  assert.equal(identity.source, "operator-launch-config");
});

test("authenticated caller without workflow capability is rejected", () => {
  const identity = workflowInvocationIdentityFromLaunchConfig({
    INTELLIZEN_MCP_CALLER_PRINCIPAL: "claude",
    INTELLIZEN_MCP_START_WORKFLOW: "deny",
  });

  assert.throws(
    () => assertWorkflowInvocationIdentity(identity, "claude"),
    /is not allowed to start workflows/,
  );
});

test("requested_by cannot impersonate another actor", () => {
  const identity = workflowInvocationIdentityFromLaunchConfig({
    INTELLIZEN_MCP_CALLER_PRINCIPAL: "keel",
    INTELLIZEN_MCP_START_WORKFLOW: "allow",
  });

  assert.throws(
    () => assertWorkflowInvocationIdentity(identity, "Fiona"),
    /must match authenticated MCP caller keel/,
  );
  assert.throws(
    () => assertWorkflowInvocationIdentity(identity, "Keel"),
    /must match authenticated MCP caller keel/,
  );
});

test("missing or invalid launch identity fails closed", () => {
  assert.throws(
    () => workflowInvocationIdentityFromLaunchConfig({
      INTELLIZEN_MCP_START_WORKFLOW: "allow",
    }),
    /INTELLIZEN_MCP_CALLER_PRINCIPAL is missing or invalid/,
  );
  assert.throws(() => workflowInvocationIdentityFromLaunchConfig({
    INTELLIZEN_MCP_CALLER_PRINCIPAL: "keel",
    INTELLIZEN_MCP_START_WORKFLOW: "start_workflow",
  }), /must be allow or deny/);
});
