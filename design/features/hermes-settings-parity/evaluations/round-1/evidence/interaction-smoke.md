# Interaction smoke

| Path/state | Action | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| `/settings?section=general` | Navigate across all six Settings sections | Matching shell and section anatomy | All six sections rendered and were captured against Hermes at the same state | Pass |
| `/agents` | Open New Agent | Editable agent sheet without redundant provider controls | Dialog opened with name, role, model, identity, context, voice, and avatar controls; no Engine or Provider dropdown | Pass |
| New Agent | Switch Sphere to Blob | Reveal Blobatar silhouettes | Auto plus ten named Blobatar silhouettes appeared; Blob became pressed | Pass |
| `/agents` with panel | Hide agent panel | Remove panel completely and leave one reopen action | Splitter and complementary panel disappeared; one `Show agent panel` button remained in the main header | Pass |
| Static source/runtime | Inspect shared Avatar consumers | Consistent identity rendering and appropriate motion | Cards use hover animation; editor/panel use continuous preview; chat/HUD receive speaking amplitude; dense stacks remain static | Pass |
| Repository verification | Check, test, build, secret scan | Green implementation gates | Product contracts/typecheck passed; 380 tests passed and 1 skipped; production frontend build passed; service-role bundle scan passed | Pass |

Browser-preview `invoke` errors were expected because that surface is outside Tauri. No external messages, writes, deploys, or destructive actions were exercised.
