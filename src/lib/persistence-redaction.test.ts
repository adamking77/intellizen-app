import { describe, expect, it } from "vitest";
import {
  assessPersistenceSafety,
  assertPersistenceSafe,
} from "../../shared/persistence-redaction.mjs";

const rejectedFixtures = [
  "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz1234567890",
  "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz1234567890",
  "sb_secret_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890",
  "Authorization: Bearer AbCdEfGhIjKlMnOpQrStUvWxYz1234567890",
  "webhook_secret=AbCdEfGhIjKlMnOpQrStUvWxYz1234567890",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzAwMDAwMDAwfQ.KlMnOpQrStUvWxYz1234567890AbCdEfGhIj",
  "CANARY_aZ9-Km3_qP7vT2xN8sR4wY6uI1oL5eC0bHjFgDkSaZ9",
];

describe("persistence redaction gate", () => {
  it.each(rejectedFixtures)("rejects secret-shaped fixture %s", (fixture) => {
    expect(() => assertPersistenceSafe({ payload: fixture })).toThrow(
      /^Persistence rejected: secret-shaped value detected at \$\.payload \([a-z-]+\)\.$/,
    );
  });

  it("does not echo rejected input", () => {
    const secret = rejectedFixtures[0];
    try {
      assertPersistenceSafe(secret);
      throw new Error("expected rejection");
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it("allows hashes, UUIDs, key names, and ordinary prose", () => {
    const safe = {
      uuid: "91a33773-e310-4fa0-a69e-15ef6fdbecb0",
      sha256: "16b31da590a0eae5fe108becc835ebcb05d3c915089b23111ed8cc4a9f1dc62d",
      prose: "Remove SUPABASE_SERVICE_ROLE_KEY from the worker environment.",
    };
    expect(assessPersistenceSafety(safe)).toEqual({ safe: true, findings: [] });
    expect(assertPersistenceSafe(safe)).toBe(safe);
  });

  it("accepts the stable Gate 7 simulation reference while preserving hash correlation", () => {
    const artifact = {
      artifactRef: "simulation://intellizen/gate4/internal-proof",
      approvedPayloadHash:
        "755b52749ccb252a2cca630e464ee940f3427ed8e5e9fb803fa6f87b61974660",
      simulated: true,
      externalAction: false,
    };
    expect(assertPersistenceSafe({ artifact })).toEqual({ artifact });
  });
});
