# hermes-app reference retention

Decision confirmed by Adam on 2026-09-03 for Fable 5.1 Done requirement 3.

- `hermes-app` stays at `/Users/adamking/projects/hermes-app`.
- It remains available as the visual and interaction reference donor while
  IntelliZen is finished.
- It is retired only as an active IntelliZen product/runtime path.
- It is not moved, deleted, cleaned, made read-only, or replaced by a clone.
- Its 61 local commits and five untracked donor-capture files remain intact.
- The retired `Hermes Workspace.app` donor UI is not left running. The final
  completion audit found and quit its stray local process, then verified zero
  donor UI processes and exactly one IntelliZen release process. Fiona's
  independent Hermes gateway remains active because it is IntelliZen's engine
  and scheduler, not the retired donor application.

Current IntelliZen runtime code has no dependency on the donor repository's
absolute path. Roadmap, stage, and source comments may continue to reference
it for fidelity work.
