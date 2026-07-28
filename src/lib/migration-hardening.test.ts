import { describe, expect, it } from "vitest";

import anonAccessMigration from "../../supabase/migrations/20260703090922_anon_personal_app_access_v2_scoped.sql?raw";
import gateOneMigration from "../../supabase/migrations/20260727092636_intellizen_v2_gate1_control_contracts.sql?raw";
import permissionMigration from "../../supabase/migrations/20260728114149_harden_append_only_receipt_permissions.sql?raw";
import transactionalMigration from "../../supabase/migrations/20260728115305_transactional_consequential_work_receipts.sql?raw";

describe("migration history and receipt hardening", () => {
  it("uses the authoritative remote versions for already-applied contracts", () => {
    expect(anonAccessMigration).toContain(
      "Remote-applied version: 20260703090922",
    );
    expect(gateOneMigration).toContain(
      "Remote-applied version: 20260727092636",
    );
  });

  it("keeps machine credential material out of schema migrations", () => {
    expect(anonAccessMigration).not.toMatch(/[a-f0-9]{64}/i);
    expect(anonAccessMigration).not.toMatch(
      /(?:insert\s+into|update)\s+system\.config/i,
    );
  });

  it("revokes broad RPC access while preserving the native anon caller", () => {
    expect(permissionMigration).toContain(
      "from public, authenticated",
    );
    expect(permissionMigration).toMatch(
      /grant execute on function workspace\.append_record_section\(uuid, text, jsonb\)\s+to anon, service_role;/,
    );
    expect(permissionMigration).toContain(
      "revoke delete on workspace.record_revisions from service_role",
    );
    expect(permissionMigration).toContain("extensions, pg_temp");
  });

  it("commits consequential record updates and work events in one RPC", () => {
    expect(transactionalMigration).toContain(
      "workspace.append_record_section_with_event",
    );
    expect(transactionalMigration).toContain(
      "insert into workspace.work_events",
    );
    expect(transactionalMigration).toContain("security invoker");
    expect(transactionalMigration).toMatch(
      /grant execute on function workspace\.append_record_section_with_event\([\s\S]*?\) to anon, service_role;/,
    );
  });
});
