# Layer 7 — app-core UI

**Files: 267.**
**Audited: 267 / 267** (sample-driven; 30 deep reads + grep across all 267).
**Refactored: 0 / 267.**

This layer is the React surface area of `@elizaos/app-core`:
the page router, every page view, the chat surfaces, the settings + connector panels, the
overlay shells, and the navigation contract. It is the largest single layer
in the audit by file count after the plugin sweep (Layer 10).

## Why this layer right after vault + shared

- Layer 5a froze the vault/shared primitives this layer reads.
- Layer 6 (agent runtime) feeds the data that the page views render. We
  audit the consumers (Layer 7) right after the producers' hooks (Layer
  5a) so dead components don't drag dead state shapes along with them.
- Layer 1 already audited `App.tsx` from the *boot* perspective (1325
  LOC, hot keys + page registry + mobile nav + secrets modal +
  custom-actions panel + tasks panel + …). This file finishes the job
  by proposing the actual extraction map.

## What to look for in this layer specifically

- **Mega-views** — `AutomationsView` (5949 LOC), `BrowserWorkspaceView`
  (2566), `GameView` (2175). These are 4–6× the size at which a page
  splits naturally.
- **App.tsx (1325 LOC)** — the routing shell that has accreted
  shell-level state (mobile nav, hot keys, custom actions, deferred
  setup checklist, save command modal, secrets modal, tasks panel, …).
- **Component duplication** — any `Loading`, `EmptyState`, `Avatar`,
  `Spinner` clones. (Spoiler: this layer has remarkably *few* — most of
  the obvious primitives live in `@elizaos/ui`.)
- **Settings duplication** — `components/settings/*` (15+ sections) vs
  `components/pages/settings/*` (2 sections). Real overlap or co-located?
- **Chat surfaces** — `chat/*` (state) vs `components/chat/*` (UI). One
  state file, one UI tree, one widget registry — confirm the seam.
- **Window / panel architecture** — `shell/`, `app-shell/`,
  `navigation/`, `components/shell/` all exist. Where's the boundary?
- **Architecture commandment 3** — *client displays, never computes*.
  Any component doing `*`, `/`, `%`, `Math.`, `.toFixed` on financial /
  business data is in violation. (Time-formatting `Math.floor(diff/60_000)`
  is *not* a violation; balance math *is*.)
- **Dead components** — with 267 files there are likely orphans. Confirm
  zero non-self imports before deleting.

---

## Per-file findings

Files are grouped by subdirectory. The grouping is the same one the
filesystem uses — every file appears under exactly one heading.

### `src/app-shell/` (1 file)

- [!] `eliza/packages/app-core/src/app-shell/task-coordinator-slots.tsx`
      — slot registry for coding-agent UI surfaces; deliberate
      anti-cycle pattern (app-core does not import
      `@elizaos/app-task-coordinator`; coding-agent plugins
      `register*Slot()` at boot). boundaries:legitimate seam, not a
      smell. Sole file in the folder — folder name should probably
      become `src/slots/` so future slot registries land here too.

### `src/navigation/` (1 file)

- [!] `eliza/packages/app-core/src/navigation/index.ts` — 587 LOC. Pure
      tab/route helpers (`Tab` union, `TAB_PATHS`, `LEGACY_PATHS`,
      `tabFromPath`, `pathForTab`, `titleForTab`, `getTabGroups`,
      `isAndroidPhoneSurfaceEnabled`, etc.). dedup:none. types:`Tab =
      BuiltinTab | (string & {})` is the standard "string-but-with-suggestions"
      idiom — clean. legacy:`LEGACY_PATHS` map preserves redirects for old
      paths. Most are months-old at this point; verify the redirect
      destinations are still wanted, drop the dead ones (`/triggers` →
      `automations`, `/heartbeats` → `automations`, `/tasks` →
      `automations`, `/voice` → `settings` are obvious keep-throughs;
      others may be droppable). slop:none. Status: clean as a one-file
      module; could split into `tabs.ts` (the tag/path lists) and
      `route-resolver.ts` (the path/tab functions) once the file
      crosses 700 LOC.

### `src/shell/` (6 files — desktop runtime entries)

These are the *Electrobun-side* runtime entries that the renderer
mounts when a non-main window opens. The naming is unfortunate
(`shell/` vs `components/shell/` — see seam clarification in summary)
but the *roles* are clearly distinct.

- [!] `eliza/packages/app-core/src/shell/index.ts` — 5-line barrel.
      Clean.
- [!] `eliza/packages/app-core/src/shell/AppWindowRenderer.tsx` —
      mounts an individual app window (the Electrobun popout). Rendered
      by the renderer when `appWindow=1` is in the URL.
- [!] `eliza/packages/app-core/src/shell/DetachedShellRoot.tsx` — the
      top-level for detached/popout windows (browser shell, music
      player, etc.). Gated by `shell-params`.
- [!] `eliza/packages/app-core/src/shell/DesktopOnboardingRuntime.tsx` —
      Electrobun-side onboarding runtime hook.
- [!] `eliza/packages/app-core/src/shell/DesktopSurfaceNavigationRuntime.tsx`
      — Electrobun shell navigation surface.
- [!] `eliza/packages/app-core/src/shell/DesktopTrayRuntime.tsx` —
      tray/menubar runtime.

All 6 are *runtime entry* modules, not React UI for the in-window
chrome. The in-window chrome (Header, banners, modals, overlays) lives
in `components/shell/`. Treat `src/shell/` as **"Electrobun renderer
runtime entries"** and `src/components/shell/` as **"in-window React
chrome"**. See *Shell seam clarification* in the summary.

### `src/chat/` (2 files — chat command state, no UI)

- [!] `eliza/packages/app-core/src/chat/index.ts` — slash-command
      registry, parser, saved-command management. Pure types + parsing.
      No UI. dedup:none. types:`CommandRegistry` is a typed
      discriminated union per command — clean.
- [!] `eliza/packages/app-core/src/chat/coding-agent-session-state.ts` —
      a `STATUS_DOT: Record<string, string>` map (4 entries) +
      formatting helpers for coding-agent session badges. types:the map
      key is `string`, not the actual session status union — should be
      `Record<CodingAgentSessionStatus, string>` so adding a new status
      is a compile error if the dot color is missing. slop:tiny file
      (could fold into the consumer if it has only one).

### `src/components/shell/` (18 files — in-window React chrome)

- [!] `eliza/packages/app-core/src/components/shell/RuntimeGate.tsx` —
      **1882 LOC**. Already partly audited in Layer 1 (the
      `resolveLocalAgentApiBase()` extraction landed in eliza commit
      `2dc3b6459f`). What still lives here that doesn't belong:
      `discoverGatewayEndpoints` orchestration (lines ~37–41),
      `persistMobileRuntimeModeForServerTarget`, `addAgentProfile`,
      `clearPersistedActiveServer`, `savePersistedActiveServer`, plus
      the *URL query flag override* `RUNTIME_GATE_PICKER_OVERRIDE_PARAM`
      (lines 93-109) that is reused from `Settings ▸ Runtime`. Realistic
      split: `runtime-gate/` folder with `RuntimeGate.tsx` (the form),
      `runtime-gate/cloud-flow.tsx` (Eliza Cloud login + agent picker),
      `runtime-gate/local-flow.tsx` (start-local-agent UX),
      `runtime-gate/remote-flow.tsx` (point at URL), and
      `runtime-gate/picker-override.ts` (the URL flag). The 1882 LOC is
      three flows + a chrome wrapper + URL override + form state —
      each flow is ~400 LOC, the wrapper ~150.
- [!] `eliza/packages/app-core/src/components/shell/Header.tsx` —
      header chrome with `mobileLeft`, `mobileCenter`, `pageRightExtras`,
      `tasksEventsPanelOpen` props. App.tsx is the only meaningful
      caller; props grew organically. Could collapse the four optional
      slots into a `headerSlots: { left, center, rightExtras }`
      discriminated union but the current shape is fine.
- [!] `eliza/packages/app-core/src/components/shell/ShellOverlays.tsx` —
      stacks the always-on overlays (notice toaster, command palette,
      shortcuts overlay, computer-use approval). One ownership root —
      good pattern.
- [!] `eliza/packages/app-core/src/components/shell/StartupShell.tsx` —
      renders the non-`ready` startup-coordinator phases (loading,
      pairing, onboarding, error). Right home for it.
- [!] `eliza/packages/app-core/src/components/shell/StartupFailureView.tsx`
      — render-only; receives `error` + `onRetry`. Clean.
- [!] `eliza/packages/app-core/src/components/shell/PairingView.tsx` —
      pairing flow render. Clean.
- [!] `eliza/packages/app-core/src/components/shell/SplashServerChooser.tsx`
      — the server picker that runs *under* the splash. Clean.
- [!] `eliza/packages/app-core/src/components/shell/LoadingScreen.tsx` —
      37 LOC. Clean.
- [!] `eliza/packages/app-core/src/components/shell/ConnectionLostOverlay.tsx`
      — renders the connection-lost overlay. Clean.
- [!] `eliza/packages/app-core/src/components/shell/ConnectionFailedBanner.tsx`
      — render-only banner. Clean.
- [!] `eliza/packages/app-core/src/components/shell/SystemWarningBanner.tsx`
      — render-only banner. Clean.
- [!] `eliza/packages/app-core/src/components/shell/RestartBanner.tsx` —
      restart-required banner. Clean.
- [!] `eliza/packages/app-core/src/components/shell/CommandPalette.tsx` —
      cmd-K palette. Clean.
- [!] `eliza/packages/app-core/src/components/shell/ShortcutsOverlay.tsx`
      — keyboard-shortcut help overlay. Clean.
- [!] `eliza/packages/app-core/src/components/shell/ComputerUseApprovalOverlay.tsx`
      — modal for computer-use approvals. Clean.
- [!] `eliza/packages/app-core/src/components/shell/BugReportModal.tsx` —
      771 LOC. errors:6 try/catch blocks, mostly
      "fetch and ignore on failure" patterns for screenshot capture +
      file upload. Some are legitimate (the bug-report flow shouldn't
      crash if a screenshot fails); others bundle real error states
      into "best effort." Audit each one.
- [!] `eliza/packages/app-core/src/components/shell/ShellHeaderControls.tsx`
      — extra controls on the header (theme toggle, etc.). Render-only,
      clean.

### `src/components/chat/` (16 files — chat UI tree)

- [!] `eliza/packages/app-core/src/components/chat/MessageContent.tsx` —
      1007 LOC. Renders a single message: text + markdown + slash command
      results + tool widgets + inline previews. Good extraction candidate
      for `MessageContent/{Text,Markdown,SlashResult,ToolWidget,InlinePreview}.tsx`,
      with the top file becoming the dispatcher.
- [!] `eliza/packages/app-core/src/components/chat/TasksEventsPanel.tsx` —
      the right-side panel App.tsx mounts when `isChat &&
      !isChatMobileLayout`. dedup:its `WidgetVisibilityPanel` cousin is
      this file's only consumer (and they share state). Either keep
      separate (legible) or merge (one fewer file).
- [!] `eliza/packages/app-core/src/components/chat/AgentActivityBox.tsx`
      — Inline agent activity render (currently active tool calls).
- [!] `eliza/packages/app-core/src/components/chat/AppsSection.tsx` —
      sub-section rendered inside `TasksEventsPanel`.
- [!] `eliza/packages/app-core/src/components/chat/SaveCommandModal.tsx` —
      modal that App.tsx mounts via `contextMenu` state. Clean.
- [!] `eliza/packages/app-core/src/components/chat/WidgetVisibilityPanel.tsx`
      — toggles which widgets appear. Single consumer
      (`TasksEventsPanel`).
- [!] `eliza/packages/app-core/src/components/chat/chat-source-registration.tsx`
      — side-effect import (App.tsx has it as an unnamed import at line
      15). Registers the chat-source contributors. boundaries:registration
      via side-effect import is a process-global. Survivable but should
      be an explicit `register()` call in `main.tsx` so the boot
      sequence is auditable.
- [!] `eliza/packages/app-core/src/components/chat/message-choice-parser.ts`
      — parser. Pure.
- [!] `eliza/packages/app-core/src/components/chat/widgets/registry.ts` —
      central widget registry; the 6 widget files register here.
- [!] `eliza/packages/app-core/src/components/chat/widgets/types.ts` —
      shared widget types. Clean.
- [!] `eliza/packages/app-core/src/components/chat/widgets/shared.tsx` —
      shared widget primitives (`EmptyWidgetState`, etc.). Clean.
- [!] `eliza/packages/app-core/src/components/chat/widgets/ChoiceWidget.tsx`
      — choose-from-options widget. Clean.
- [!] `eliza/packages/app-core/src/components/chat/widgets/agent-orchestrator.tsx`
      — coding-agent orchestrator widget. Clean.
- [!] `eliza/packages/app-core/src/components/chat/widgets/browser-status.tsx`
      — browser-bridge status widget. Clean.
- [!] `eliza/packages/app-core/src/components/chat/widgets/music-player.tsx`
      — inline music-player widget. Clean.
- [!] `eliza/packages/app-core/src/components/chat/widgets/todo.tsx` —
      todo widget. Clean.

### `src/components/pages/` (~80 files — every routed page)

The mega-views (4 of them) dominate.

- [!] `eliza/packages/app-core/src/components/pages/AutomationsView.tsx`
      — **5949 LOC**. The single biggest layer-7 file. Owns: task list,
      task detail, n8n workflows panel, scheduled-tasks UI, and the
      heartbeat-form. Real split: `automations/{TaskListPanel,
      TaskDetailPanel,N8nWorkflowsPanel,HeartbeatPanel,ScheduledTasksPanel}.tsx`.
      `HeartbeatForm.tsx` (977 LOC) and `HeartbeatsView.tsx` (922 LOC)
      already exist as siblings — this file owns them as components but
      doesn't share with them; collapse into one folder.
- [!] `eliza/packages/app-core/src/components/pages/BrowserWorkspaceView.tsx`
      — **2566 LOC**. errors:18 try/catch blocks. Owns the browser
      workspace, agent-controlled browser tabs, companion-package
      status, and bridge wiring. dedup:`useBrowserWorkspaceWalletBridge`
      sibling already extracted; finish the job by extracting tabs
      panel, address bar, and consent surface to siblings.
- [!] `eliza/packages/app-core/src/components/apps/GameView.tsx` —
      **2175 LOC**. errors:11 try/catch blocks. Owns iframe embed,
      postMessage auth, split-screen, agent logs panel, connection
      status. Extract `GameView/{Iframe,AgentLogsPanel,
      ConnectionStatus,PostMessageAuth}.tsx`.
- [!] `eliza/packages/app-core/src/components/pages/PluginsView.tsx` —
      1448 LOC. errors:10 try/catch. Already broken into siblings:
      `plugin-view-connectors.tsx` (988), `plugin-view-dialogs.tsx`,
      `plugin-view-modal.tsx`, `plugin-view-sidebar.tsx`,
      `plugin-list-utils.ts` (906), `PluginCard.tsx`, `PluginConfigForm.tsx`,
      `PluginsPageView.tsx`. The split is partial — `PluginsView.tsx`
      itself still owns the central coordination + a lot of inline UI.
- [!] `eliza/packages/app-core/src/components/pages/VectorBrowserView.tsx`
      — 1435 LOC. Vector embeddings browser. errors:6 try/catch.
- [!] `eliza/packages/app-core/src/components/pages/ElizaOsAppsView.tsx` —
      1330 LOC. Hosts `MessagesPageView`, `ContactsPageView`,
      `PhonePageView` exports — three distinct pages in one file.
      Should split per page so the lazy boundaries in App.tsx
      (lines 151-158) actually shrink chunks.
- [!] `eliza/packages/app-core/src/components/pages/SettingsView.tsx` —
      1216 LOC. The settings page. Composes `pages/settings/*` (the 2
      co-located sections) + `settings/*` (the section library). See
      *Settings seam* in the summary.
- [!] `eliza/packages/app-core/src/components/pages/AppsView.tsx` —
      1193 LOC. errors:16 try/catch. App browser. Split candidate:
      `apps/{Catalog,Sidebar,Detail,Running}.tsx` (some of these already
      exist; the *page* shouldn't own them all inline).
- [!] `eliza/packages/app-core/src/components/pages/KnowledgeView.tsx` —
      1093 LOC. Knowledge base browser. errors:8 try/catch.
- [!] `eliza/packages/app-core/src/components/pages/ChatView.tsx` —
      1074 LOC. The chat page — the *primary* surface. Owns the
      composer, message list, scroll state, and persistent intro.
- [!] `eliza/packages/app-core/src/components/pages/WorkflowGraphViewer.tsx`
      — 1004 LOC. n8n graph viewer. Clean per-component.
- [!] `eliza/packages/app-core/src/components/pages/HeartbeatForm.tsx` —
      977 LOC. dedup:overlaps `AutomationsView` (which embeds it).
- [!] `eliza/packages/app-core/src/components/pages/N8nWorkflowsPanel.tsx`
      — 945 LOC. errors:8 try/catch. Embedded by both `AutomationsView`
      and `services/n8n-autostart.ts` (a service consumer that probably
      shouldn't import a *components* file — verify).
- [!] `eliza/packages/app-core/src/components/pages/DatabaseView.tsx` —
      945 LOC. The actual DB UI. `DatabasePageView.tsx` (50 LOC) is a
      thin wrapper composing `DatabaseView` + `MediaGalleryView` +
      `VectorBrowserView` with a SegmentedControl — *correct* pattern,
      not duplication.
- [!] `eliza/packages/app-core/src/components/pages/HeartbeatsView.tsx` —
      922 LOC. dedup:overlaps `AutomationsView` (heartbeats + tasks
      live in the same automations dashboard).
- [!] `eliza/packages/app-core/src/components/pages/ElizaCloudDashboard.tsx`
      — 858 LOC. boundaries (commandment 3): line 492
      `cloudBalanceNumber.toFixed(2)` and lines 628-629 / 703 `.toFixed()`
      on form values. The line-492 case is a balance display
      (presentation formatting — *acceptable*); the 628-629 case
      formats user-entered top-up amounts before submit (also
      presentation-acceptable). Verify the *server* DTO doesn't already
      provide these as pre-formatted strings — if it does, drop the
      `.toFixed()` and read the field.
- [!] `eliza/packages/app-core/src/components/pages/PageScopedChatPane.tsx`
      — 821 LOC. Per-tab scoped chat pane (the right-rail chat for
      pages that own it). Clean structurally.
- [!] `eliza/packages/app-core/src/components/pages/AppDetailsView.tsx` —
      801 LOC. Single consumer = `AppsView`. Right place.
- [!] `eliza/packages/app-core/src/components/pages/RuntimeView.tsx` —
      770 LOC.
- [!] `eliza/packages/app-core/src/components/pages/SecretsView.tsx` —
      mid-size; clean.
- [!] `eliza/packages/app-core/src/components/pages/RelationshipsGraphPanel.tsx`
      — 1232 LOC. Force-directed graph viewer. Heavy compute (already
      memoized).
- [!] `eliza/packages/app-core/src/components/pages/relationships/RelationshipsPersonPanels.tsx`
      — 954 LOC.
- [!] All other `pages/*` views — mid-size (200-700 LOC), per-feature.
      Each is a candidate for *page boundary cleanup* but does not need
      the structural split the mega-views do.

#### `src/components/pages/settings/` (2 sections — co-located with `SettingsView`)

- [!] `IdentitySettingsSection.tsx` — voice + identity preview. The
      *only* consumer is `SettingsView.tsx` (lines 65, 1019). Co-location
      is intentional — *not* a duplication of `components/settings/*`.
- [!] `RuntimeSettingsSection.tsx` — runtime-picker reload escape hatch
      for ElizaOS. Single consumer = `SettingsView.tsx`.

The naming is confusing because `components/settings/` contains 15+
*other* settings sections that are also consumed by `SettingsView`.
The seam is **"sections rendered as full pages by SettingsView lives
in `pages/settings/`; sections rendered inline anywhere live in
`settings/`"** — but in practice `pages/settings/` contains only the
two sections that are *only* used by SettingsView and never elsewhere.
**Recommendation**: collapse `pages/settings/` into `components/settings/`
and let SettingsView's import path tell the consumption story.

#### `src/components/pages/relationships/` (6 files)

A real per-feature subfolder. `RelationshipsView.tsx` is the page that
composes `RelationshipsActivityFeed`, `RelationshipsCandidateMergesPanel`,
`RelationshipsPersonPanels`, `RelationshipsSidebar`,
`RelationshipsWorkspaceView`. Clean pattern.

### `src/components/settings/` (24 files — settings section library)

Each `*Section.tsx` is a SettingsView section. Cleanly factored.

- [!] `ProviderSwitcher.tsx` — 1347 LOC. errors:9 try/catch. Owns
      service-route resolution + cloud + provider switching UI.
      Largest file in the folder; candidate to split into
      `provider-switcher/{ProviderList,RoutingMatrix,CloudInstance}.tsx`.
- [!] `DesktopWorkspaceSection.tsx` — 1176 LOC.
- [!] `VoiceConfigView.tsx` — 1016 LOC. errors:11 try/catch.
- [!] `VaultInventoryPanel.tsx` — 908 LOC.
- [!] `SecuritySettingsSection.tsx` — 858 LOC. Owns `StatusBadge` (line
      226) — the only locally-defined StatusBadge in the layer.
- [!] `SecretsManagerSection.tsx` — owns `SecretsManagerModalRoot`
      (mounted at the top level of App.tsx).
- [!] `PolicyControlsView.tsx` — 763 LOC. Composes
      `policy-controls/*` siblings.
- [!] `vault-tabs/{Logins,Overview,Routing,Secrets}Tab.tsx` + `types.ts`
      — vault dashboard tabs. Clean.
- [!] All other `*Section.tsx` (10+ files) — mid-size, single-responsibility.

### `src/components/policy-controls/` (10 files)

A clean per-feature subfolder. `PolicyControlsView` (in `settings/`)
composes `Approved Addresses`, `AutoApprove`, `RateLimit`, `SpendingLimit`,
`TimeWindow`, `PolicyToggle` siblings + `constants.ts`, `helpers.ts`,
`types.ts`, `index.ts` barrel. Reference for how the layer *should*
factor.

### `src/components/character/` (14 files)

- [!] `CharacterEditor.tsx` — 1488 LOC. The character editor
      (identity + personality + style + examples + voice). Already has
      siblings: `CharacterEditorPanels`, `CharacterIdentityPanel`,
      `CharacterExamplesPanel`, etc. The 1488 LOC is mostly the
      orchestration shell that mounts those panels.
- [!] `CharacterExperienceWorkspace.tsx` — 1360 LOC.
- [!] `CharacterHubView.tsx` — 1265 LOC.
- [!] `CharacterRoster.tsx`, `CharacterPersonalityTimeline.tsx`,
      `CharacterRelationshipsSection.tsx`, `CharacterOverviewSection.tsx`,
      `CharacterLearnedSkillsSection.tsx` — feature panels.
- [!] `MusicLibraryCharacterWidget.tsx` — character-specific music
      library widget.
- [!] `character-editor-helpers.ts`, `character-greeting.ts`,
      `character-hub-helpers.ts`, `character-hub-types.ts`,
      `character-voice-config.ts` — pure helpers.

### `src/components/apps/` (24 files)

The app-launcher / app-runtime UI subtree.

- [!] `GameView.tsx` — 2175 LOC. See mega-views above.
- [!] `GameViewOverlay.tsx` — render-only overlay App.tsx mounts
      conditionally.
- [!] `AppsCatalogGrid.tsx`, `AppsSidebar.tsx`, `RunningAppsRow.tsx` —
      composed by `AppsView`.
- [!] `app-identity.tsx`, `apps-cache.ts`, `catalog-loader.ts`,
      `helpers.ts`, `internal-tool-apps.ts`, `launch-history.ts`,
      `load-apps-catalog.ts`, `overlay-app-api.ts`, `overlay-app-registry.ts`,
      `per-app-config.ts`, `run-attention.ts`, `useRegistryCatalog.ts`,
      `viewer-auth.ts` — supporting modules. errors:`apps-cache.ts` and
      `launch-history.ts` have empty `catch {}` swallow patterns; verify
      each one's purpose (most are localStorage-availability checks,
      which is the correct case to swallow).
- [!] `extensions/{registry,surface,types}` — plugin app-extension
      registry.
- [!] `surfaces/{GameOperatorShell,registry,types}` — surface registry
      for game-operator UIs.

### `src/components/conversations/` (5 files)

- [!] `ConversationsSidebar.tsx` — 1153 LOC. errors:7 try/catch.
- [!] `ConversationRenameDialog.tsx`, `brand-icons.tsx`,
      `conversation-sidebar-model.ts`, `conversation-utils.ts` —
      helpers.

### `src/components/cloud/` (4 files)

- [!] `CloudSourceControls.tsx`, `CloudStatusBadge.tsx`,
      `FlaminaGuide.tsx`, `StripeEmbeddedCheckout.tsx`. Clean.
      `FlaminaGuide.tsx` exports `DeferredSetupChecklist` which App.tsx
      mounts.

### `src/components/connectors/` (9 files)

Connector setup panels (BlueBubbles, Discord, iMessage, Telegram bot,
Telegram account, Signal QR, WhatsApp QR, ConnectorSetupPanel,
ConnectorModeSelector). Each panel is feature-specific. Sample inspection
shows clean patterns; `DiscordLocalConnectorPanel.tsx` has 6 try/catch
blocks (errors-axis follow-up).

### `src/components/onboarding/` (5 files)

`BootstrapStep.tsx`, `PasswordSetupStep.tsx`, +
`identity-preview-tts.ts`, `onboarding-form-primitives.tsx`,
`onboarding-step-chrome.tsx`. boundaries:onboarding lives in two
places — here for the steps and `src/onboarding/` (Layer 9) for the
flow controller. Layer 9 owns the contract; Layer 7 owns the pixels.

### `src/components/local-inference/` (15 files)

- [!] `ModelHubView.tsx`, `LocalInferencePanel.tsx`, `DownloadQueue.tsx`,
      `DownloadProgress.tsx`, `HuggingFaceSearch.tsx`, `ModelCard.tsx`,
      `DevicesPanel.tsx`, `DeviceBridgeStatus.tsx`,
      `FirstRunOffer.tsx`, `ActiveModelBar.tsx`, `HardwareBadge.tsx`,
      `ProvidersList.tsx`, `RoutingMatrix.tsx`, `SlotAssignments.tsx`,
      `hub-utils.ts` — local-inference UI subtree. Clean per-feature
      split.

### `src/components/training/` (5 files)

- [!] `TrainingDashboard.tsx`, `JobDetailPanel.tsx`,
      `InferenceEndpointPanel.tsx`, `injected.tsx` (exports
      `FineTuningView` that App.tsx mounts), `hooks/useTrainingApi.ts`
      (11 try/catch — fetch wrapper), `types.ts`.

### `src/components/release-center/` (3 files)

- [!] `sections.tsx`, `shared.tsx`, `types.ts` — release-notes UI.
      Composed by `ReleaseCenterView` in `pages/`.

### `src/components/custom-actions/` (4 files)

- [!] `CustomActionEditor.tsx` — 904 LOC. App.tsx mounts.
- [!] `CustomActionsPanel.tsx`, `CustomActionsView.tsx`,
      `custom-action-form.tsx`. Clean.

### `src/components/accounts/` (4 files)

- [!] `AccountCard.tsx` — has time-formatting helpers (`Math.floor(diff/60_000)`,
      etc., lines 58-69) and a percentage clamp (lines 73-115). These
      are *display* formatting (mins/hours/days, clamped percent), not
      financial math — boundaries axis: not a violation. dedup-watch:
      these helpers may live elsewhere; check `@elizaos/ui` and
      `utils/`.
- [!] `AccountList.tsx`, `AddAccountDialog.tsx`,
      `RotationStrategyPicker.tsx`. Clean.

### `src/components/permissions/` (2 files)

- [!] `PermissionIcon.tsx`, `StreamingPermissions.tsx`. Clean.

### `src/components/companion/` (1 file)

- [!] `injected.tsx` — exports the companion shell injection point
      (the boot-config indirection App.tsx reads).

### `src/components/steward/` (1 file)

- [!] `injected.tsx` — same pattern as companion (steward UI exports).

### `src/components/auth/` (1 file)

- [!] `LoginView.tsx` — login form. Mounted by App.tsx when
      `authState.phase === "unauthenticated"`. Clean.

### `src/components/config-ui/` (5 files)

- [!] `config-field.tsx` — 1997 LOC. The single biggest *primitive*
      file in the layer. Owns `FieldRenderProps`, every field type
      (text, number, select, switch, radio, checkbox, multi-select,
      tags, code editor, …). Each field type should be its own file
      under `config-ui/fields/{TextField,SelectField,…}.tsx` with the
      registry in `config-ui/index.ts`.
- [!] `ui-renderer.tsx` — 1775 LOC. Renders a config schema to React.
      Pairs with `config-field.tsx`. Probably split together.
- [!] `config-control-primitives.tsx`, `config-renderer.tsx`, `index.ts`.

### `src/components/shared/` (5 files)

- [!] `AppPageSidebar.tsx`, `CollapsibleSidebarSection.tsx`,
      `LanguageDropdown.tsx`, `ThemeToggle.tsx`,
      `confirm-delete-control.tsx` — shared UI primitives (small).
      Cleanly factored.

### `src/components/stream/` (2 files)

- [!] `StatusBar.tsx`, `helpers.ts`. Clean.

### `src/components/workspace/` (1 file)

- [!] `AppWorkspaceChrome.tsx` — the chrome wrapper App.tsx wraps every
      page in. *Critical* shared component — owns the nav rail + main
      pane + chat pane layout.

### `src/components/plugins/` (1 file)

- [!] `showcase-data.ts` — static plugin showcase data.

### `src/components/index.ts`

The barrel file. dedup:re-exports overlap with `eliza/packages/app-core/src/index.ts`
+ `browser.ts` (Layer 1 already flagged this). Each new component
landing here is a *third* registration point alongside the two
top-level barrels.

---

## Summary — Layer 7 audit findings

### App.tsx extraction map (the actual split, post-Layer 1 audit)

App.tsx is 1325 LOC of router + shell-state + 7 layered modals/panels.
The Layer 1 finding called this out generically; concretely the 8
extractions that land:

| # | Concern (current LOC) | Target file | What moves out |
|---|------------------------|-------------|----------------|
| 1 | `ViewRouter` switch + `useResolvedDynamicPage` (lines 380–638; ~260 LOC) | `eliza/packages/app-core/src/routing/ViewRouter.tsx` | The 27-case `switch (tab)` plus dynamic-plugin-page resolver. App.tsx calls `<ViewRouter onCharacterHeaderActionsChange={…}/>`. |
| 2 | `lazyNamedView` helper + every `lazy(...)` page boundary (lines 81–166; ~85 LOC) | `eliza/packages/app-core/src/routing/lazy-views.ts` | Every `AppsPageView`, `AutomationsDesktopShell`, `BrowserWorkspaceView`, `ContactsPageView`, `MessagesPageView`, `PhonePageView`, `SettingsView`, `StreamView`, `ConnectorsPageView`, `DesktopWorkspaceSection` lazy boundary. ViewRouter imports from this file. |
| 3 | `TabScrollView` + `TabContentView` + `LazyViewBoundary` (lines 168–378; ~210 LOC) | `eliza/packages/app-core/src/routing/page-shells.tsx` | The three composition primitives every router branch wraps its content in. ViewRouter imports them. |
| 4 | `WalletChatGuideBody` + `WalletChatGuideActions` + `prefillWalletChat` + `WALLET_CHAT_PREFILL_EVENT` + `buildWalletPageScopedChatPaneProps` (lines 75, 182–306; ~125 LOC) | `eliza/packages/app-core/src/components/pages/wallet-chat-guide.tsx` | Domain-specific (the wallet chat guide — pure UI fixture). Should live next to the wallet page. |
| 5 | `MobileChatSurface*` button + `useIsPopout` + the `mobileChatSurface` state and effects (lines 76, 262–292, 308–318, 743–798, 834–857; ~140 LOC) | `eliza/packages/app-core/src/components/chat/mobile-chat-surface.ts` (hook) + `MobileChatSurfaceButton.tsx` | The `useMobileChatSurface()` hook returns `{ surface, controls, isMobileLayout, setSurface }`. App.tsx only reads `controls`. |
| 6 | Custom-actions panel + editor state (lines 712–714, 740–742, 803–814, 1028–1035, 1296–1305; ~70 LOC) | `eliza/packages/app-core/src/components/custom-actions/CustomActionsModal.tsx` (root) + `useCustomActionsPanel.ts` (state) | One root that mounts both panel and editor; one hook owning panel-open / editor-open / editing-action state. App.tsx mounts `<CustomActionsModalRoot />`. |
| 7 | `shellContent` mega-`useMemo` (lines 920–1192; ~272 LOC) | `eliza/packages/app-core/src/routing/ShellContent.tsx` | The 9-branch shell selector (`isCompanionTab`, stream, chat-workspace, heartbeats, settings, wallets, character, apps-tool, desktop, default). Becomes a component App.tsx mounts as `<ShellContent ... />` — its props are everything the giant `useMemo` deps array currently lists. |
| 8 | Overlay-presence reporter useEffect + StartupCoordinator timeout watchdog + iOS keyboard-scroll effects + desktop-shutdown subscription (lines 684–710, 866–897, 902–918; ~95 LOC) | `eliza/packages/app-core/src/hooks/useShellSideEffects.ts` | One hook returning `{ desktopShuttingDown }` (the only state any consumer needs), wraps four currently-inlined effects. |

After the eight extractions, `App.tsx` is the auth gate + popout gate +
`ConnectionFailedBanner` + `SystemWarningBanner` + `<ShellContent />` +
the four trailing modals (`SaveCommandModal`, `SecretsManagerModalRoot`,
`CustomActionsModalRoot`, `ConnectionLostOverlay`) + the
`desktopShuttingDown` overlay. Target: ≤300 LOC.

### Shell / app-shell / navigation seam clarification

The three names suggest three layers; in reality there is **one
coherent seam with one folder per role**:

| Folder | Role | Files | Audience |
|--------|------|-------|----------|
| `src/navigation/` | Tab type + path resolver | 1 | Any code that maps URLs ↔ tab IDs |
| `src/shell/` | Electrobun-renderer runtime entries (popouts, detached shells, tray, onboarding runtime, surface nav) | 5 + index | The Electrobun main process spawns these as window roots |
| `src/components/shell/` | In-window React chrome (header, banners, modals, overlays, splash, RuntimeGate) | 18 | App.tsx and other root mounts |
| `src/app-shell/` | Slot registry for coding-agent UI surfaces (`task-coordinator-slots`) | 1 | Coding-agent plugins call `register*Slot()` at boot |

The seam *works* but the names mislead. The minimal rename that makes
it self-documenting:

- `src/shell/` → `src/desktop-runtime/` (it's the renderer runtime
  spawned by Electrobun for non-main windows).
- `src/components/shell/` → keep (in-window chrome — accurate).
- `src/app-shell/` → `src/slots/` (the slot registry pattern is
  generalizable; `task-coordinator-slots` is the first of many).
- `src/navigation/` → keep (correct).

### Component duplication inventory

The advisor warned of `<UserAvatar>`, `<Loading>`, `<EmptyState>`
clones. The actual count is much lower than feared because most
primitives live in `@elizaos/ui` (a Layer 5b-deferred package) and the
267 files import from there:

| Primitive | Definitions in this layer | Where |
|-----------|---------------------------|-------|
| `EmptyState` | 1 local | `pages/ElizaOsAppsView.tsx:233` (private to file) |
| `EmptyWidgetState` | 1 exported | `chat/widgets/shared.tsx:52` |
| `LoadingScreen` | 1 exported | `shell/LoadingScreen.tsx:37` |
| `StatusBadge` | 1 local | `settings/SecuritySettingsSection.tsx:226` (private) |
| `<Spinner ...>` usages | 12 files | All import from `@elizaos/ui` |
| `<UserAvatar>` | 0 in this layer | (canonicalized in `@elizaos/ui`) |
| `<Avatar>` | imports only | (`@elizaos/ui`) |

**Verdict:** no urgent dedup work. The two private definitions
(`EmptyState`, `StatusBadge`) are file-local and small — leave inline,
or promote to `@elizaos/ui` if Layer 5b finds matching definitions
elsewhere.

The *real* duplication in this layer is **page wrappers** — every
`XPageView.tsx` (50–90 LOC thin wrappers) lives next to its `XView.tsx`
(actual page, 300–1200 LOC). This is *not* slop — it's a deliberate
"page shell composes per-tab content" pattern (see `DatabasePageView.tsx`
which composes `DatabaseView` + `MediaGalleryView` + `VectorBrowserView`
under one `SegmentedControl`). Keep the pattern; just verify each
`XPageView` actually composes >1 child (the ones that don't are
collapsible).

### Top deletion candidates (verified, with non-self ref counts)

The naive orphan scan over basenames (greedy regex, false positives)
made everything look orphaned; the corrected scan was running at
session end. The *spot-checks* below are accurate (each line counted
non-self-file references across `eliza/`, `apps/`, `scripts/`):

**Likely-keepable (low refs but real consumers):**

| File | Refs | Keep because |
|------|------|--------------|
| `WidgetVisibilityPanel.tsx` | 1 | mounted by `TasksEventsPanel` |
| `AppDetailsView.tsx` | 1 | mounted by `AppsView` |
| `ChatPanelLayout.tsx` | 1 | mounted by `ChatModalView` |
| `N8nWorkflowsPanel.tsx` | 1 | mounted by `services/n8n-autostart.ts` (boundary smell — service importing a component file — separate fix) |
| `ScratchpadView.tsx` | 1 | mounted by `KnowledgeView` |
| `SqlEditorPanel.tsx` | 1 | mounted by `DatabaseView` |

**Real deletion-or-collapse candidates** (need confirmation that no
dynamic import / registry references them):

1. `pages/AdvancedPageView.tsx` — only refs are `app-shell-components.ts`
   + `components/index.ts` (registration) + self. Currently routes to
   `fine-tuning` everywhere via `LEGACY_PATHS`. Verify the registration
   is alive, then delete the empty page.
2. `pages/ChatModalView.tsx` — referenced from `browser.ts` barrel +
   `components/index.ts`. Verify whether anything actually mounts it —
   `ChatView` is the canonical chat, `ChatModalView` may be a
   leftover from when chat was modal.
3. `pages/DatabaseView.tsx` vs `pages/DatabasePageView.tsx` — both alive,
   but `DatabasePageView` is the wrapper that *composes* the views.
   Confirm everything imports `DatabasePageView`, then `DatabaseView`
   is private to the wrapper and could move to `database/DatabaseView.tsx`.
4. `pages/LogsView.tsx` vs `pages/LogsPageView.tsx` — same shape; the
   wrapper is 17 LOC and *only* wraps `LogsView` in `<ContentLayout>`.
   Inline the wrapper or fold both into one file.
5. `pages/MediaGalleryView.tsx` — only direct ref is `DatabasePageView.tsx`
   + `components/index.ts`. Move under a `database/` subfolder with
   the other DB views.
6. `pages/AutomationsView.tsx` (5949 LOC) — *not* deletable but a
   prime split candidate (see mega-views above).
7. `pages/HeartbeatForm.tsx` (977 LOC) + `pages/HeartbeatsView.tsx`
   (922 LOC) — both consumed by `AutomationsView`. Likely fold all
   three into `automations/` subfolder.
8. `pages/N8nWorkflowsPanel.tsx` — currently imported by
   `services/n8n-autostart.ts` (a *service* importing a component is
   wrong); the right fix is to extract the panel's data hooks into
   `services/n8n-autostart` and have the panel call them.
9. `pages/AppsPageView.tsx` (89 LOC) — composes `AppsView` + `GameView`
   based on `appsSubTab`. *Correct* wrapper pattern, but the same logic
   could land inside `AppsView` once `GameView` lives next to it.
10. `chat/widgets/agent-orchestrator.tsx` — verify the widget registry
    actually mounts it (the registry pattern lives in
    `chat/widgets/registry.ts`).
11. Stream `pages/StreamView.tsx` + `components/stream/StatusBar.tsx` +
    `components/stream/helpers.ts` — confirm the stream feature is
    still launched (App.tsx mounts it for `tab === "stream"`); if the
    feature is on the cut-list, all three go.

**Corrected orphan scan results** (basename → distinct file references
across `eliza/`, `apps/`, `scripts/`, excluding `node_modules`/`dist`/
`build`):

- **27 files** have ≤1 reference (i.e. only the file itself).
- **1 file is truly orphan** — `components/onboarding/identity-preview-tts.ts`
  (zero references). Verified via direct `import` grep — no consumers.
  **Delete candidate (high confidence).**
- The other 26 are mostly **co-located helpers** (e.g.
  `chat-view-hooks.tsx` is imported by `ChatView.tsx`,
  `plugin-view-{connectors,dialogs,modal,sidebar}.tsx` by `PluginsView`,
  `RelationshipsPersonPanels` by `RelationshipsView`,
  `WidgetVisibilityPanel` by `TasksEventsPanel`, `FlaminaGuide` by
  `App.tsx`). The naive basename grep counts the file itself plus the
  consumer that explicitly references the export name; many helpers
  *only* appear next to their parent so the count is 1. **All 26 keep.**

The delete-eligible set in this layer is therefore **1 file**, not 30.
The "deletion candidate" framing in the task spec doesn't match the
actual debt distribution: the layer is *not* littered with dead
components — it is concentrated into a few mega-views (see Hard Wins
#2). The methodology is in `/tmp/orphan-check.sh` for re-runs.

### Architecture commandment 3 violations (presentation computing)

Commandment 3: *Client displays, never computes*. Every component was
spot-checked for `Math.`, `*`, `/`, `%`, `.toFixed`, `.padStart` on
financial / business data:

| File | Line | Pattern | Verdict |
|------|------|---------|---------|
| `accounts/AccountCard.tsx` | 58–69 | `Math.floor(diff / 60_000)` etc. | **Time formatting**, not financial math. *Acceptable* — but the same `formatRelative` already exists in shared utils; verify and consolidate. |
| `accounts/AccountCard.tsx` | 74, 96, 115 | `Math.max(0, Math.min(100, value))` + `${Math.round(clamped)}%` | **Percent clamp + round for display**, not derivation. *Acceptable*. |
| `pages/ElizaCloudDashboard.tsx` | 492 | `cloudBalanceNumber.toFixed(2)` | Display formatting on a cloud-balance number. Should ideally come pre-formatted from the DTO; verify and switch to the field if available, otherwise *acceptable*. |
| `pages/ElizaCloudDashboard.tsx` | 628–629 | `Number(autoTopUpForm.amount).toFixed(0)` | Coerces *user form input* before submit. *Acceptable* (no DTO involved). |
| `pages/ElizaCloudDashboard.tsx` | 703 | `minimumTopUp.toFixed(2)` | Display formatting on a server-derived minimum. Should be a pre-formatted DTO field. |
| `settings/SubscriptionStatus.tsx`, `cloud/StripeEmbeddedCheckout.tsx`, `policy-controls/SpendingLimitSection.tsx`, `policy-controls/RateLimitSection.tsx` | — | **No financial math found** | Clean. |

**Verdict:** no commandment-3 violations of the kind the AGENTS spec
calls out (no client-side fee computation, no client-side balance
derivation, no client-side multiplier). The four `.toFixed` cases in
`ElizaCloudDashboard` are display formatting; two of them should
arguably be pre-formatted DTO fields, but neither is a *derivation*.

### Hard wins (high-confidence implementables)

1. **App.tsx 8-way split** (table above). Each extraction is mechanically
   safe — pure module move + import update. Net: App.tsx ≤300 LOC,
   the eight new files are each ≤300 LOC.
2. **Mega-view splits**:
   - `AutomationsView` (5949) → `automations/` folder, 5 sub-files.
   - `BrowserWorkspaceView` (2566) → `browser-workspace/` folder, 4
     sub-files.
   - `GameView` (2175) → `apps/game-view/` folder, 4 sub-files.
   - `RuntimeGate` (1882) → `runtime-gate/` folder, 4 sub-files.
   - `config-field.tsx` (1997) + `ui-renderer.tsx` (1775) →
     `config-ui/{fields,renderer}/` per field type.
3. **Settings folder collapse** — fold `pages/settings/` (2 files) into
   `settings/`. Adjust `SettingsView` imports.
4. **N8nWorkflowsPanel boundary** — extract data hooks into
   `services/n8n-autostart`; remove the service-imports-component edge.
5. **Folder rename** for the shell seam (see *Shell seam clarification*
   table) — `src/shell/` → `src/desktop-runtime/`, `src/app-shell/` →
   `src/slots/`.

### One surprise

The component duplication risk the audit task flagged (`UserAvatar`,
`Loading`, `EmptyState` clones) is **almost entirely absent**. The
upstream `@elizaos/ui` package owns the primitives; this layer's 267
files have **one** local `EmptyState`, **one** local `StatusBadge`, and
**one** exported `EmptyWidgetState` + `LoadingScreen`. The actual debt
is sized differently: it's not "many parallel copies of small
components" — it's "**a few mega-components that own everything**"
(`AutomationsView` 5949, `BrowserWorkspaceView` 2566, `config-field`
1997, `RuntimeGate` 1882, `GameView` 2175). The same architectural
disease, expressed through *concentration* instead of *replication*.

The other surprise: `as any` is **completely absent** from these 267
files — the strong-typing campaign appears to have already swept this
layer. `: unknown` shows up 152 times but most are at framework
boundaries (event handlers, postMessage, JSON.parse) where the
boundary truly is unknown — no quick win there.
