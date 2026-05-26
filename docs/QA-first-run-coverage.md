# First-Run Coverage

| Surface | Coverage |
| --- | --- |
| First-run state helpers | `eliza/packages/ui/src/first-run/first-run.test.ts` |
| Deep-link routing | `eliza/packages/ui/src/first-run/__tests__/deep-link-entry.test.ts` |
| Startup shell asset boundary | `eliza/packages/ui/src/components/shell/startup-shell-assets.test.ts` |
| XDG state directory resolution | `eliza/packages/core/src/utils/state-dir.test.ts` |
| Settings runtime switch | `eliza/packages/app/test/ui-smoke/computer-use.spec.ts` checks first-run setup appears before capability settings |

Removed coverage that asserted retired pre-chat gates. New coverage should target `FirstRunShell`, the
first-run submit payload, and startup timing around the embedded agent API.
