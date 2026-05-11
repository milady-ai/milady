# Mobile onboarding screenshot checklist — ios

Date: 2026-05-10
Surface: ios

Source: docs/QA-onboarding.md (Mobile section). Drive each step with the computer-use MCP from within a Claude Code session; this script only scaffolds and validates the report directory.

| Step | Status | Expected screenshot | Title | Notes |
|------|--------|---------------------|-------|-------|
| M1 | [ ] | `M1-cold-launch.png` | Cold launch — BootstrapStep renders | iOS: open apps/app/ios/App.xcworkspace, run on iPhone 15 sim. Android: `npx cap run android`. |
| M2 | [ ] | `M2-bootstrap-step.png` | BootstrapStep visible after boot | Confirm Local vs Cloud choice is rendered before any tap. |
| M3 | [ ] | `M3-pre-seed.png` | Android pre-seed (or iOS equivalent state) | See packages/ui/src/onboarding/mobile-runtime-mode.ts. Android pre-seeds a local agent before the provider step. |
| M4 | [ ] | `M4-deep-link-provider.png` | Deep link entry — milady://onboard/step/provider | Trigger the deep link from the sim/emu shell, then screenshot the provider step. |
| M5 | [ ] | `M5-permission-prompt.png` | Native permission prompt (notifications / file access) | Playwright cannot reach native dialogs — this is the reason computer-use MCP is required. |

## Capture commands (operator)

Each PNG must be saved to this directory with the filename listed above. Example MCP call:

```
mcp__computer-use__screenshot  →  save bytes to
  /Users/shawwalters/eliza-workspace/milady/reports/qa/2026-05-10/mobile/ios/M1-cold-launch.png
```

When done, run:

```
node scripts/qa/mobile-screenshot-walkthrough.mjs --finalize --surface ios
```
