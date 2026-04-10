# Sprint W16 Backlog — Desktop Stability & Polish

> **Sprint:** 2026-W16 (Apr 13 – Apr 17, 2026)
> **Theme:** Desktop app stability & polish
> **Sprint Goal:** Ship a desktop build where a new user can download, install, finish onboarding, connect a provider, and get a working first reply — without hitting a known broken path.
> **Capacity:** 33 points (1 point ≈ half a working day)

Sources: `docs/apps/desktop/user-feedback-2026-03-08.md`, `docs/apps/desktop/release-regression-checklist.md`, `docs/apps/desktop.md`, recent develop-branch commits.

---

## P0 — Must Ship (blocks "first-run → first-reply")

### Issue 1: Fix provider onboarding OAuth flow

**Priority:** P0
**Estimate:** 3 points
**Labels:** `bug`, `onboarding`, `desktop`, `P0`
**Area:** `packages/app-core/src/` / `apps/app/`

**Description:**
"Login with Anthropic" under OAuth does not clearly lead users to a place where they can complete auth or paste codes. Testers report the flow feels broken — clicking the button either leads nowhere or leaves the user in an ambiguous state with no feedback.

**Acceptance criteria:**
- [ ] OAuth login button leads to a clear, completable auth flow
- [ ] User receives visual feedback at each step (loading, success, error)
- [ ] On success, provider is saved and the user is returned to the main UI with the provider active
- [ ] On failure, user sees an actionable error message

**Reference:** `docs/apps/desktop/user-feedback-2026-03-08.md` § Provider and onboarding issues

---

### Issue 2: Fix post-Eliza-Cloud-connect response path on macOS

**Priority:** P0
**Estimate:** 5 points
**Labels:** `bug`, `desktop`, `macos`, `P0`
**Area:** `packages/app-core/src/connectors/` / `apps/app/electrobun/`

**Description:**
Multiple macOS testers report that after connecting Eliza Cloud, Milady still does not respond to messages. The cloud connection appears to succeed (no error shown) but the response path is broken — messages are sent but no replies are received.

**Acceptance criteria:**
- [ ] After connecting Eliza Cloud on macOS, sending a message produces a reply
- [ ] If the cloud connection is degraded, user sees a clear status indicator
- [ ] Cloud disconnect is surfaced to the user (not silent failure)
- [ ] Verified on both Apple Silicon and Intel macOS builds

**Reference:** `docs/apps/desktop/user-feedback-2026-03-08.md` § Runtime issues seen by testers

---

### Issue 3: Audit and fix shell button wiring

**Priority:** P0
**Estimate:** 3 points
**Labels:** `bug`, `desktop`, `ui`, `P0`
**Area:** `apps/app/`

**Description:**
Testers reported "no buttons work" in the desktop shell. Every interactive element in the main shell (sidebar buttons, settings gear, send button, action buttons in messages) must be wired to a working handler or visually disabled with a tooltip explaining why.

**Acceptance criteria:**
- [ ] Audit every button and interactive element in the desktop shell
- [ ] Each button either performs its intended action or is visually disabled
- [ ] Disabled buttons include a tooltip explaining why they are inactive
- [ ] No buttons silently do nothing on click

**Reference:** `docs/apps/desktop/user-feedback-2026-03-08.md` § Runtime issues seen by testers

---

### Issue 4: Verify plugin, settings, and config persistence

**Priority:** P0
**Estimate:** 3 points
**Labels:** `bug`, `desktop`, `config`, `P0`
**Area:** `packages/app-core/src/config/`

**Description:**
Testers raised concerns that plugin settings, configurables, and general settings may not persist across app restarts. The config file at `~/.milady/milady.json` must correctly save and reload all user-configured state.

**Acceptance criteria:**
- [ ] Provider API keys persist across app restart
- [ ] Enabled/disabled plugin state persists across app restart
- [ ] User preferences (experience mode, model selection) persist
- [ ] Config file is written atomically (no corruption on crash)
- [ ] Add a smoke test that writes config, restarts, and verifies

**Reference:** `docs/apps/desktop/user-feedback-2026-03-08.md` § Runtime issues seen by testers

---

### Issue 5: macOS signed build end-to-end smoke test

**Priority:** P0
**Estimate:** 3 points
**Labels:** `testing`, `desktop`, `macos`, `release`, `P0`
**Area:** `apps/app/electrobun/` / CI

**Description:**
Validate the full first-run-to-first-reply flow on signed macOS builds for both arm64 and x64. This is a manual gate backed by the checklist in `docs/apps/desktop/release-regression-checklist.md` and the strict signed smoke gate `bun run test:desktop:packaged`.

**Acceptance criteria:**
- [ ] arm64 DMG: download → install → launch → onboard → connect provider → send message → receive reply
- [ ] x64 DMG: same flow
- [ ] Tray icon appears and works
- [ ] Window vibrancy and drag regions work
- [ ] No crash or hang during the flow
- [ ] Document results in release regression checklist

**Reference:** `docs/apps/desktop/release-regression-checklist.md`, `docs/apps/desktop.md` § Download and install

---

### Issue 6: Windows NSIS installer end-to-end smoke test

**Priority:** P0
**Estimate:** 2 points
**Labels:** `testing`, `desktop`, `windows`, `release`, `P0`
**Area:** `apps/app/electrobun/` / CI

**Description:**
Validate the full first-run-to-first-reply flow on the Windows NSIS installer. At least one tester confirmed Windows installs and starts, but the experience was confusing. Verify the happy path works end to end.

**Acceptance criteria:**
- [ ] NSIS installer: download → install → launch → onboard → connect provider → send message → receive reply
- [ ] No crash or hang during the flow
- [ ] Automated Playwright gate passes (`bun run test:desktop:playwright`)
- [ ] Document results in release regression checklist

**Reference:** `docs/apps/desktop/release-regression-checklist.md`, `docs/apps/desktop/user-feedback-2026-03-08.md` § Packaging and release feedback

---

## P1 — Should Ship (quality & polish for first-run)

### Issue 7: Clarify provider setup UX — API key vs OAuth vs subscription

**Priority:** P1
**Estimate:** 3 points
**Labels:** `enhancement`, `onboarding`, `ux`, `P1`
**Area:** `apps/app/`

**Description:**
Users are confused about the difference between Claude console API keys, Claude Pro subscriptions, and the terminal-based `claude setup-token` flow. The provider setup screen needs clearer labeling, inline help text, and a single recommended path for new users.

**Acceptance criteria:**
- [ ] Provider setup screen clearly distinguishes between auth methods
- [ ] Each method has inline help text or a tooltip explaining when to use it
- [ ] A recommended "quickest path" is visually highlighted for new users
- [ ] Error messages for wrong auth method are actionable (e.g., "This looks like a Pro subscription — use OAuth instead")

**Reference:** `docs/apps/desktop/user-feedback-2026-03-08.md` § Provider and onboarding issues

---

### Issue 8: First-run experience mode selection

**Priority:** P1
**Estimate:** 3 points
**Labels:** `enhancement`, `onboarding`, `desktop`, `P1`
**Area:** `apps/app/`

**Description:**
Users want a clearer first-run choice of experience mode. Suggested modes: `dev`, `companion`, `co-work`, `streaming`, `trading`. Currently the app implicitly lands in one mode with no obvious way to switch. The first-run flow should present a mode picker and persist the choice.

Note: milady-ai/milady#8 was a scaffold for a related feature (now closed). This issue is a fresh implementation based on tester feedback.

**Acceptance criteria:**
- [ ] First-run flow presents a mode selection screen
- [ ] At least `companion` and `dev` modes are functional
- [ ] Selected mode is persisted in `~/.milady/milady.json`
- [ ] User can change mode later from settings
- [ ] Mode affects the default UI layout

**Reference:** `docs/apps/desktop/user-feedback-2026-03-08.md` § Experience modes

---

### Issue 9: Automate release regression checklist — Playwright coverage

**Priority:** P1
**Estimate:** 3 points
**Labels:** `testing`, `automation`, `desktop`, `P1`
**Area:** `test/` / CI

**Description:**
The release regression checklist (`docs/apps/desktop/release-regression-checklist.md`) has items that still require manual human judgment (tray icon, vibrancy, drag regions, permissions). Increase Playwright coverage to automate what can be automated, and clearly mark which items remain manual-only.

**Acceptance criteria:**
- [ ] Playwright tests cover: window launch, basic UI interaction, send message flow
- [ ] `test/regression-matrix.json` is updated to mark automated vs manual items
- [ ] CI runs automated regression tests on every desktop build
- [ ] Manual-only items are documented with clear instructions for human signoff

**Reference:** `docs/apps/desktop/release-regression-checklist.md`

---

### Issue 10: Fix release download page UX

**Priority:** P1
**Estimate:** 2 points
**Labels:** `enhancement`, `desktop`, `release`, `P1`
**Area:** GitHub Releases / `docs/`

**Description:**
The public release page shape is confusing for Windows users. Asset naming, descriptions, and the overall layout should make it obvious which file to download for each platform.

**Acceptance criteria:**
- [ ] Release assets are clearly named with platform and architecture (e.g., `Milady-1.0.0-arm64.dmg`, `Milady-1.0.0-x64-setup.exe`)
- [ ] Release notes include a "Download" section with direct links per platform
- [ ] Users on the wrong platform see guidance (e.g., "Looking for macOS? See above")

**Reference:** `docs/apps/desktop/user-feedback-2026-03-08.md` § Packaging and release feedback

---

## P2 — Stretch Goals

### Issue 11: Desktop tray icon regression hardening

**Priority:** P2
**Estimate:** 2 points
**Labels:** `testing`, `desktop`, `macos`, `P2`
**Area:** `apps/app/electrobun/`

**Description:**
Harden tray icon behavior per the regression checklist: appearance after launch, click handling, context menu, persistence after main window close, removal on quit.

**Acceptance criteria:**
- [ ] Tray icon appears after launch
- [ ] Left-click opens companion window
- [ ] Right-click shows context menu
- [ ] Tray persists when main window is closed
- [ ] Tray is removed on quit
- [ ] Automated test where feasible; manual gate for visual items

**Reference:** `docs/apps/desktop/release-regression-checklist.md` § Tray Icon And Menu

---

### Issue 12: Window effects regression — vibrancy, drag, resize

**Priority:** P2
**Estimate:** 2 points
**Labels:** `testing`, `desktop`, `macos`, `P2`
**Area:** `apps/app/electrobun/`

**Description:**
Validate and harden macOS window effects: native vibrancy (frosted glass), header drag region, and vibrancy retention on resize. These are visual regressions that can only be partially automated.

**Acceptance criteria:**
- [ ] Vibrancy effect renders on macOS (arm64 and x64)
- [ ] Window is draggable from the header region
- [ ] Vibrancy is retained after resize
- [ ] Document manual verification steps for release signoff

**Reference:** `docs/apps/desktop/release-regression-checklist.md` § Window Effects

---

### Issue 13: Context menu positioning and dismissal

**Priority:** P2
**Estimate:** 1 point
**Labels:** `bug`, `desktop`, `ui`, `P2`
**Area:** `apps/app/electrobun/`

**Description:**
Validate that context menus appear at cursor position and close when clicking elsewhere. This is a low-effort regression check.

**Acceptance criteria:**
- [ ] Context menu appears at cursor position
- [ ] Context menu closes when clicking outside
- [ ] No visual artifacts or stale menus

**Reference:** `docs/apps/desktop/release-regression-checklist.md` § Context Menu

---

### Issue 14: Permissions and hardware state validation

**Priority:** P2
**Estimate:** 1 point
**Labels:** `testing`, `desktop`, `P2`
**Area:** `apps/app/electrobun/`

**Description:**
Validate that OS permission requests and hardware state queries work correctly: photo quality at default settings, accessibility permission prompts, permission status accuracy, and battery/power state reflection.

**Acceptance criteria:**
- [ ] Photo quality is acceptable at default settings
- [ ] Requesting accessibility opens System Preferences (macOS)
- [ ] Permission status reflects actual system state
- [ ] Power state reflects actual battery status

**Reference:** `docs/apps/desktop/release-regression-checklist.md` § Permissions And Hardware

---

## Out of Scope (explicitly not this sprint)

- Connectors work (Telegram, Discord, WeChat) — next sprint theme.
- Parallax / multi-agent orchestrator features.
- New native modules (camera, swabble, screen capture enhancements).
- Game/Babylon/2004scape work.
- Linux packaging (.deb / AppImage) polish beyond "doesn't crash on launch."

## Followups (to file at retro)

- Auto-updater reliability on slow/flaky GitHub download connections.
- First-run experience mode picker full implementation + persistence (beyond scaffold).
- Energy/battery polish beyond current documentation.
- `MILADY_DESKTOP_SCREENSHOT_SERVER` opt-in-by-default rethink.

---

## Point Summary

| Priority | Issues | Points |
|----------|--------|--------|
| P0 | 6 | 19 |
| P1 | 4 | 11 |
| **Committed** | **10** | **30** |
| P2 (stretch) | 4 | 6 |

> **Capacity:** 33 points. Committed work (P0 + P1) = 30 points, leaving 3 points of buffer. P2 items are stretch goals if velocity allows.
