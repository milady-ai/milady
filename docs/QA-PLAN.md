# Milady Desktop App — Comprehensive QA/Testing Plan (TDD)

## Context

The Milady desktop app needs extensive testing before release. The app spans 28 navigation tabs, 85+ UI components, 288 API methods, WebSocket streaming, wallet integration, connectors, plugins, VRM 3D avatars, and OBS streaming. 8 testers will execute this plan across all platforms (Windows, macOS, Linux, iOS, Android, Web).

## TDD Approach

**Tests are written FIRST as failing tests, then code is fixed to make them pass.**

Each section below has a corresponding `.test.ts` file with automated tests. Manual testers verify the same cases on real devices/platforms. The workflow is:

1. Write failing test → 2. Run & confirm it fails → 3. Fix code → 4. Run & confirm it passes → 5. Manual tester verifies on device

## Deliverables

### Doc
- `milady/docs/QA-PLAN.md` — This document (the full test plan)

### Test Files (TDD — written as failing tests first)
- `packages/app-core/src/__tests__/qa-onboarding.test.ts` — Onboarding wizard flows
- `packages/app-core/src/__tests__/qa-chat.test.ts` — Chat, conversations, streaming
- `packages/app-core/src/__tests__/qa-wallet.test.ts` — Wallet, trading, exports
- `packages/app-core/src/__tests__/qa-connectors.test.ts` — Connector config, health, reconnection
- `packages/app-core/src/__tests__/qa-settings.test.ts` — Settings, config, secrets, agent lifecycle
- `packages/app-core/src/__tests__/qa-plugins.test.ts` — Plugins, skills, MCP
- `packages/app-core/src/__tests__/qa-fuzz.test.ts` — Input fuzzing, XSS, injection, file upload abuse
- `packages/app-core/src/__tests__/qa-overload.test.ts` — Content overload, memory pressure
- `packages/app-core/src/__tests__/qa-errors.test.ts` — Error scenarios (401, 429, credits, disconnects)
- `packages/app-core/src/__tests__/qa-security.test.ts` — Security guards (SQL injection, auth, permissions)
- `packages/app-core/src/__tests__/qa-navigation.test.ts` — All 28 tabs render without crash

---

## Tester Assignments

| Tester | Primary Domain | Secondary Domain |
|--------|---------------|-----------------|
| **@dEXploarer** | Installation & Onboarding (all platforms) | Builds verification |
| **@Cayden0207** | Chat & Conversations (WebSocket, REST, streaming) | Knowledge & Memory |
| **@2AM** | Wallets & Trading (EVM, Solana, BSC) | Inventory & NFTs |
| **@BAO** | Connectors (Discord, Telegram, Farcaster, Matrix, Signal, Nostr, Lens, Feishu, WeChat, WhatsApp) | Heartbeats/Triggers |
| **@fabulous** | Settings, Config, Secrets, Permissions, Security | Database & Logs |
| **@nubs** | Avatar/Companion (VRM, Three.js), Stream (OBS), Voice | Media Settings |
| **@iono** | Plugins, Skills Marketplace, Apps, MCP | Training/Fine-tuning, Trajectories |
| **@Pleasures** | Fuzz Testing, Overload Testing, Extreme User Behavior | Error Scenarios & Edge Cases |

## Severity Ratings

- **S1 (Critical)**: App crash, data loss, security vulnerability, payment/wallet error
- **S2 (Major)**: Feature completely broken, blocking workflow, data corruption
- **S3 (Moderate)**: Feature partially broken, workaround exists, UI glitch with functional impact
- **S4 (Minor)**: Cosmetic issue, typo, minor UX annoyance

---

## SECTION 1: Installation & Onboarding (@dEXploarer)

### 1.1 Fresh Install

| ID | Test Case | Steps | Expected | Severity |
|----|-----------|-------|----------|----------|
| INS-001 | Windows NSIS fresh install | Download .exe, run installer, accept defaults | Installs to AppData, creates Start Menu + Desktop entries, launches | S1 |
| INS-002 | Windows install to custom path with spaces | Choose "C:\My Apps\Milady" | Installs and runs correctly | S2 |
| INS-003 | Windows install without admin | Run installer as standard user | Installs to user directory or shows clear error | S2 |
| INS-004 | macOS DMG arm64 | Mount DMG, drag to /Applications on Apple Silicon | Launches, no Rosetta, Gatekeeper passes | S1 |
| INS-005 | macOS DMG x64 | Mount DMG, drag to /Applications on Intel Mac | Launches correctly | S1 |
| INS-006 | Linux AppImage | Download, chmod +x, run | Launches, tray icon appears | S1 |
| INS-007 | Linux .deb install | `sudo dpkg -i milady.deb` on Ubuntu/Debian | Installs, shows in launcher, deps resolved | S1 |
| INS-008 | iOS build | Install via TestFlight or Xcode | Launches, Capacitor bridge works | S1 |
| INS-009 | Android build | Install APK or Play Store test track | Launches, Capacitor bridge works | S1 |
| INS-010 | Web build | Navigate to hosted URL in Chrome/Firefox/Safari/Edge | UI loads, API connects | S1 |

### 1.2 Upgrade & Reinstall

| ID | Test Case | Steps | Expected | Severity |
|----|-----------|-------|----------|----------|
| INS-011 | Windows upgrade over existing | Install v2 over v1 without uninstall | Settings preserved, app starts | S1 |
| INS-012 | Windows uninstall + reinstall | Uninstall via Control Panel, reinstall | Clean install, onboarding shows again | S2 |
| INS-013 | Config preservation across upgrade | Upgrade with active connectors, wallets, custom character | All config/secrets/character data survives | S1 |
| INS-014 | macOS upgrade via DMG replace | Replace app bundle in /Applications | Starts with existing config | S1 |

### 1.3 Onboarding Wizard (Welcome → Connection → Permissions → Activate)

| ID | Test Case | Steps | Expected | Severity |
|----|-----------|-------|----------|----------|
| ONB-001 | Complete onboarding: local + OpenAI | Select local, enter OpenAI key, set permissions, launch | Agent starts, redirects to chat | S1 |
| ONB-002 | Complete onboarding: Eliza Cloud | Select cloud mode, authenticate | Agent starts with cloud provider | S1 |
| ONB-003 | Complete onboarding: remote | Select remote, enter base URL + token | Agent connects to remote endpoint | S1 |
| ONB-004 | Complete onboarding: OpenRouter | Select openrouter, pick model | Agent starts with OpenRouter | S2 |
| ONB-005 | Invalid API key | Enter garbage API key | Clear error, stays on connection step | S2 |
| ONB-006 | Empty API key | Leave blank, try to proceed | Validation prevents advancement | S2 |
| ONB-007 | Navigate backward | Complete step 2, click Back | Returns to previous step with data preserved | S3 |
| ONB-008 | Language selection | Change language dropdown | UI text changes | S3 |
| ONB-009 | Onboarding after /reset | Reset agent from chat | Wizard reappears cleanly | S2 |
| ONB-010 | Permissions step toggles | Toggle shell, trade, automation permissions | Saved correctly, reflected in security audit | S2 |

### 1.4 Startup Failure

| ID | Test Case | Steps | Expected | Severity |
|----|-----------|-------|----------|----------|
| STR-001 | Backend timeout (>300s) | Block localhost:31337, start app | StartupFailureView shows, Retry button works | S1 |
| STR-002 | Backend unreachable | Start app without backend | Shows "Backend Unreachable" | S1 |
| STR-003 | Corrupt config | Corrupt eliza.json, start app | Shows error with detail, Retry works after fix | S1 |

---

## SECTION 2: Builds Verification (@dEXploarer + all)

| ID | Test Case | Platform | Expected | Severity |
|----|-----------|----------|----------|----------|
| BLD-001 | Full E2E | Windows 11 | Install → onboard → chat → wallets all work | S1 |
| BLD-002 | Full E2E | macOS arm64 | Same | S1 |
| BLD-003 | Full E2E | macOS x64 | Same | S1 |
| BLD-004 | Full E2E | Linux AppImage | Same | S1 |
| BLD-005 | Full E2E | Linux .deb | Same | S1 |
| BLD-006 | Core features | iOS | Chat, avatar, Capacitor plugins | S1 |
| BLD-007 | Core features | Android | Chat, avatar, Capacitor plugins | S1 |
| BLD-008 | Full features | Web Chrome | All features | S1 |
| BLD-009 | Full features | Web Firefox | All features | S2 |
| BLD-010 | Full features | Web Safari | All features | S2 |
| BLD-011 | GPU sandbox (PR #1231 regression) | Windows w/ discrete GPU | No CEF GPU crash | S1 |

---

## SECTION 3: All Buttons Work

### 3.1 Chat (@Cayden0207)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| BTN-C001 | Send message | Sends via WebSocket, response streams back | S1 |
| BTN-C002 | New conversation | Creates new, clears chat | S1 |
| BTN-C003 | Switch conversation | Loads correct history | S1 |
| BTN-C004 | Delete conversation | Confirmation → deletes | S2 |
| BTN-C005 | Rename conversation | Title updates in sidebar | S3 |
| BTN-C006 | Attach file | Uploads, shows in message | S2 |
| BTN-C007 | Emote picker | Overlay appears, VRM animates | S3 |
| BTN-C008 | Command palette (Ctrl+K) | Opens, searchable, commands execute | S2 |
| BTN-C009 | Stop generation | Stops streaming mid-response | S2 |
| BTN-C010 | Slash commands (/help, /reset, custom) | Execute correctly | S2 |

### 3.2 Avatar/Companion (@nubs)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| BTN-A001 | Avatar selector | VRM model changes, Three.js renders | S2 |
| BTN-A002 | Upload custom VRM | API call succeeds, avatar loads | S2 |
| BTN-A003 | Upload custom background | Background changes | S3 |
| BTN-A004 | Companion shell controls | Toggle/resize works | S3 |
| BTN-A005 | Global emote overlay | Animation plays | S4 |

### 3.3 Stream (@nubs)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| BTN-S001 | Stream settings toggle | OBS integration toggle saves | S2 |
| BTN-S002 | Voice config | Voice provider saves | S2 |
| BTN-S003 | Activity feed | Real-time events display | S3 |
| BTN-S004 | Chat ticker | Messages scroll in overlay | S3 |
| BTN-S005 | Avatar PiP | VRM renders in small overlay | S3 |

### 3.4 Wallets (@2AM)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| BTN-W001 | View balances | Tokens display in table | S1 |
| BTN-W002 | View NFTs | NFT grid renders | S2 |
| BTN-W003 | Copy wallet address | Copied to clipboard, toast | S3 |
| BTN-W004 | Configure wallet | Config loads, form works | S2 |
| BTN-W005 | BSC trade: get quote | Quote displays with gas estimate | S1 |
| BTN-W006 | BSC trade: execute | Tx hash returned, status polls | S1 |
| BTN-W007 | Switch RPC provider | Provider changes, creds update | S2 |
| BTN-W008 | Export wallet keys | Guard enforces cooldown, keys shown | S1 |
| BTN-W009 | Production defaults | Sets privy, user-sign-only | S2 |

### 3.5 Knowledge (@Cayden0207)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| BTN-K001 | Upload document | Processes, appears in list | S2 |
| BTN-K002 | Bulk upload | All files process | S2 |
| BTN-K003 | Upload from URL | Fetches and processes | S2 |
| BTN-K004 | Search knowledge | Returns relevant fragments | S2 |
| BTN-K005 | Delete document | Confirmation → removes | S3 |
| BTN-K006 | /remember command | Memory persists | S3 |
| BTN-K007 | Search memory | Returns results | S3 |

### 3.6 Connectors (@BAO)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| BTN-CN001 | View connectors list | Available connectors display | S2 |
| BTN-CN002 | Configure Discord | Bot token saves, connector starts | S2 |
| BTN-CN003 | Configure Telegram | Bot connects | S2 |
| BTN-CN004 | Configure Farcaster | Authenticates | S2 |
| BTN-CN005 | Configure Matrix | Joins rooms | S2 |
| BTN-CN006 | Configure Signal | Initializes | S2 |
| BTN-CN007 | Configure Nostr | Connects to relays | S2 |
| BTN-CN008 | Configure WeChat | Starts on port | S3 |
| BTN-CN009 | Configure WhatsApp (QR) | WhatsApp connects | S2 |
| BTN-CN010 | Delete connector | Stops and removes | S2 |
| BTN-CN011 | Health check | Accurate up/down status | S2 |

### 3.7 Heartbeats/Triggers (@BAO)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| BTN-T001 | Create trigger | Appears in list | S2 |
| BTN-T002 | Edit trigger | Changes save | S2 |
| BTN-T003 | Delete trigger | Removed | S2 |
| BTN-T004 | Run Now | Executes immediately | S2 |
| BTN-T005 | View run history | Shows executions | S3 |
| BTN-T006 | Trigger health dashboard | Snapshot renders | S3 |

### 3.8 Settings (@fabulous)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| BTN-SET001 | Character editor (name, bio, style) | Saves, agent reflects changes | S2 |
| BTN-SET002 | Character roster switch | Character loads, agent restarts | S2 |
| BTN-SET003 | Config save footer (Save/Discard) | Footer appears, Save calls API | S2 |
| BTN-SET004 | API key config | Keys save via updateSecrets | S2 |
| BTN-SET005 | Provider switcher | switchProvider triggers restart | S1 |
| BTN-SET006 | Theme toggle | Light/dark switches, persists | S4 |
| BTN-SET007 | Language dropdown | UI reloads in selected language | S3 |
| BTN-SET008 | Media/voice settings | Config saves, TTS/STT works | S2 |

### 3.9 Advanced Tabs (@fabulous + @iono)

| ID | Test | Expected | Sev | Who |
|----|------|----------|-----|-----|
| BTN-ADV001 | Plugins list | Renders installed + available | S2 | @iono |
| BTN-ADV002 | Toggle core plugin | Toggles, agent restarts | S2 | @iono |
| BTN-ADV003 | Install registry plugin | Plugin loads | S2 | @iono |
| BTN-ADV004 | Skills marketplace browse | Search returns results | S2 | @iono |
| BTN-ADV005 | Install marketplace skill | Skill activates | S2 | @iono |
| BTN-ADV006 | Fine-tuning view | Training status loads | S2 | @iono |
| BTN-ADV007 | Build training dataset | Triggers, progress shows | S2 | @iono |
| BTN-ADV008 | Start training job | Job progress tracks | S2 | @iono |
| BTN-ADV009 | Trajectories view | List renders | S3 | @iono |
| BTN-ADV010 | MCP config (add/remove servers) | Saves correctly | S2 | @iono |
| BTN-ADV011 | Runtime view | Agent state displays | S3 | @fabulous |
| BTN-ADV012 | Database view + SQL query | Tables list, query executes | S2 | @fabulous |
| BTN-ADV013 | Logs view with filters | Logs display, filters work | S3 | @fabulous |
| BTN-ADV014 | Security audit | Events stream/display | S2 | @fabulous |
| BTN-ADV015 | Secrets view (list/edit) | Lists masked, updates save | S2 | @fabulous |

### 3.10 Agent Lifecycle (@fabulous)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| BTN-AG001 | Start agent | Returns running state | S1 |
| BTN-AG002 | Stop agent | Returns stopped state | S1 |
| BTN-AG003 | Restart agent | Comes back cleanly | S1 |
| BTN-AG004 | Pause/resume | Toggles correctly | S2 |
| BTN-AG005 | Reset agent | Clears state, onboarding reappears | S1 |
| BTN-AG006 | Bug report modal | Opens, rate-limited submission | S3 |
| BTN-AG007 | Confirm modal on destructive actions | Requires confirmation | S2 |
| BTN-AG008 | Check for updates | ReleaseCenterView shows update status | S3 |
| BTN-AG009 | Export/import agent | Zip download/restore works | S2 |

---

## SECTION 4: End-to-End Workflows

### 4.1 Chat E2E (@Cayden0207)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| E2E-C001 | Full chat: streaming | Tokens stream real-time, message builds progressively | S1 |
| E2E-C002 | Multi-conversation switching | Each loads its own history | S1 |
| E2E-C003 | Chat with knowledge context | Upload doc → ask about it → agent uses it | S2 |
| E2E-C004 | Chat with memory | /remember → ask about it → recall works | S2 |
| E2E-C005 | Chat while agent restarting | Message queued or error shown, no silent drop | S2 |

### 4.2 Wallet E2E (@2AM)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| E2E-W001 | Full trade flow | Preflight → quote → execute → poll → balance updates | S1 |
| E2E-W002 | Transfer flow | Transfer succeeds, balance reflects | S1 |
| E2E-W003 | Trade permission enforcement | user-sign-only blocks agent-initiated trades | S1 |
| E2E-W004 | Wallet export hardened guard | Rate limiting enforced, audit logged | S1 |

### 4.3 Connector E2E (@BAO)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| E2E-CN001 | Discord round-trip | Configure → receive message → agent responds | S2 |
| E2E-CN002 | Telegram round-trip | Configure → /start → agent responds | S2 |
| E2E-CN003 | Multiple connectors simultaneous | All active, no port conflicts | S2 |
| E2E-CN004 | Connector auto-reconnect | Disconnect network briefly → reconnects | S2 |

### 4.4 Plugin/Skill E2E (@iono)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| E2E-PL001 | Install + use plugin | Install → verify actions available in chat | S2 |
| E2E-PL002 | Uninstall plugin | Actions no longer available | S2 |
| E2E-PL003 | Skill install from marketplace | Search → install → scan → active | S2 |

### 4.5 Training E2E (@iono)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| E2E-TR001 | Full training pipeline | Trajectories → dataset → train → import → activate | S2 |
| E2E-TR002 | Cancel training job | Job stops cleanly | S2 |

### 4.6 Stream E2E (@nubs)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| E2E-ST001 | Stream with OBS | Overlay renders with avatar, ticker, feed | S2 |
| E2E-ST002 | Voice during stream | TTS routes to stream audio | S2 |

---

## SECTION 5: Fuzz Testing (@Pleasures)

### 5.1 Text Input Fuzzing

| ID | Input | Target | Expected | Sev |
|----|-------|--------|----------|-----|
| FUZ-001 | Empty string | Chat | Ignored or clear message | S3 |
| FUZ-002 | Whitespace only | Chat | Treated as empty | S3 |
| FUZ-003 | 100K characters | Chat | Truncated/rejected, no OOM | S2 |
| FUZ-004 | Zalgo/RTL/emoji bomb | Chat | Renders without layout break | S3 |
| FUZ-005 | `<script>alert(1)</script>` | Chat | Rendered as text, not executed | S1 |
| FUZ-006 | `<img src=x onerror=alert(1)>` | Chat | Sanitized | S1 |
| FUZ-007 | `../`, `\0`, pipe chars | Character name | Sanitized, no path traversal | S1 |
| FUZ-008 | `'; DROP TABLE users; --` | API key field | Literal string, no SQL | S1 |
| FUZ-009 | `{"__proto__": {"admin": true}}` | Config value | Prototype pollution prevented | S1 |
| FUZ-010 | `(?:a{1000000})` | Search field | No ReDoS | S2 |

### 5.2 API Fuzzing

| ID | Target | Input | Expected | Sev |
|----|--------|-------|----------|-----|
| FUZ-011 | queryDatabase | `SELECT *; DROP TABLE memories;` | Rejected by readonly guard | S1 |
| FUZ-012 | runTerminalCommand | `rm -rf / && echo pwned` | Rejected by allowlist/sandbox | S1 |
| FUZ-013 | Knowledge upload filename | `../../../etc/passwd` | Sanitized | S1 |
| FUZ-014 | POST endpoints | `{invalid json` | 400 Bad Request | S2 |
| FUZ-015 | createTrigger | Empty body | 400 with validation errors | S2 |
| FUZ-016 | DNS rebinding | Spoofed Host header | Blocked | S1 |
| FUZ-017 | updateConfig | Blocked env keys | Rejected | S1 |

### 5.3 WebSocket Fuzzing

| ID | Input | Expected | Sev |
|----|-------|----------|-----|
| FUZ-018 | Binary garbage | Connection closed gracefully | S2 |
| FUZ-019 | Invalid JSON | Ignored, connection stays alive | S2 |
| FUZ-020 | Unknown message type | Ignored, no crash | S3 |
| FUZ-021 | 50MB text frame | Rejected/truncated, no OOM | S2 |
| FUZ-022 | 100 rapid reconnections | Server handles, no resource leak | S2 |

### 5.4 File Upload Fuzzing

| ID | Input | Expected | Sev |
|----|-------|----------|-----|
| FUZ-023 | .exe renamed to .vrm | File type validation rejects | S1 |
| FUZ-024 | Zero-byte file | Rejected with clear error | S2 |
| FUZ-025 | 2GB file | Size limit error, aborts cleanly | S2 |
| FUZ-026 | Null bytes in filename | Sanitized | S1 |
| FUZ-027 | 20 concurrent uploads | All succeed or fail gracefully | S2 |

---

## SECTION 6: Extreme Dumb User Behavior (@Pleasures)

### 6.1 Rapid Interaction

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| DUM-001 | Click send 50x in 5 seconds | Debounced, no duplicates, no freeze | S2 |
| DUM-002 | Double-click every action button | No duplicate operations | S2 |
| DUM-003 | Spam through all 28 tabs rapidly | UI keeps up, correct tab displays | S2 |
| DUM-004 | Switch provider back and forth 10x | Settles on final choice | S2 |
| DUM-005 | Spam restart agent 20x | Debounced, eventually stabilizes | S2 |

### 6.2 Interrupting Operations

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| DUM-006 | Close app during onboarding submit | Next launch: completes or restarts cleanly | S2 |
| DUM-007 | Navigate away during file upload | Continues or cancels with notification | S2 |
| DUM-008 | Close app during agent restart | Next launch: starts from clean state | S2 |
| DUM-009 | Close app during config save | Fully saved or reverted, no partial writes | S1 |
| DUM-010 | Close app during trade execution | Trade completes on-chain or status checkable | S1 |

### 6.3 Wrong Inputs

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| DUM-011 | Upload .exe as knowledge | File type rejection | S2 |
| DUM-012 | Letters in port field | "Must be a number" | S3 |
| DUM-013 | Negative interval for trigger | Validation rejects | S3 |
| DUM-014 | All fields empty, click save | Validation prevents or defaults applied | S2 |

### 6.4 Network Disruption

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| DUM-015 | Disable WiFi mid-conversation | ConnectionFailedBanner appears, reconnection attempts | S1 |
| DUM-016 | Re-enable network | WebSocket reconnects, chat resumes, banner dismisses | S1 |
| DUM-017 | Network loss during trade | Shows pending, allows checking after reconnect | S1 |
| DUM-018 | Throttle to 2G speeds | Operations complete slowly, timeouts shown if exceeded | S2 |

---

## SECTION 7: Overload with Content (@Pleasures)

### 7.1 Message Overload

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| OVR-001 | 10K character message | Sends, renders without layout break | S2 |
| OVR-002 | 1000-line message | Renders with scroll, no DOM explosion | S2 |
| OVR-003 | 500 messages in one conversation | Loads, scrolls, no memory crash | S2 |
| OVR-004 | 100 conversations | Sidebar renders, switching works | S2 |
| OVR-005 | 10 messages/second | Rate limiting or clean queue | S2 |

### 7.2 File/Data Overload

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| OVR-006 | 100 knowledge documents | All process, stats reflect | S2 |
| OVR-007 | 500MB knowledge file | Rejected with size limit or progress indicator | S2 |
| OVR-008 | 50 active triggers | All schedule/execute | S2 |
| OVR-009 | 20 installed plugins | All load, no startup timeout | S2 |
| OVR-010 | 1000 log entries | Paginates, no freeze | S3 |

### 7.3 Memory Pressure

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| OVR-011 | 8-hour session with periodic chat | No memory leak, <2GB process | S2 |
| OVR-012 | VRM + Chat + Stream simultaneous | All work, no GPU crash | S2 |
| OVR-013 | 5 browser tabs | Each functions or "already open" message | S3 |
| OVR-014 | 100K database rows | Paginates, query within timeout | S2 |

---

## SECTION 8: Error Scenarios

### 8.1 Auth Errors (@fabulous)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| ERR-001 | 401 Unauthorized | Clear login prompt | S1 |
| ERR-002 | Token expires mid-session | Auto-refresh or re-auth prompt | S1 |
| ERR-003 | Invalid pairing code 10x | 429 rate limit, cooldown message | S2 |

### 8.2 Rate Limiting (@fabulous)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| ERR-004 | 429 on pairing | Cooldown message | S2 |
| ERR-005 | 429 on bug reports | No duplicate submissions | S3 |
| ERR-006 | API provider rate limit | Retry-after info shown | S2 |

### 8.3 Credits/Subscription (@fabulous)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| ERR-007 | Zero credits | Clear "no credits" + billing link | S1 |
| ERR-008 | Subscription expired | Degraded mode or upgrade prompt | S1 |
| ERR-009 | Payment declined | Stripe shows error, no charge | S2 |

### 8.4 Infrastructure Errors (coordinated by @Pleasures)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| ERR-010 | Kill backend while app running | ConnectionFailedBanner, reconnection attempts | S1 |
| ERR-011 | Database unavailable | Clear errors, no data corruption | S1 |
| ERR-012 | Disk full | Write fails with clear error | S1 |
| ERR-013 | Port 31337 already in use | Clear "port in use" or auto-port | S2 |
| ERR-014 | WebSocket drops mid-stream | Reconnection logic fires, banner shows | S1 |
| ERR-015 | Corrupted eliza.json | Detects, offers reset or error | S1 |
| ERR-016 | Missing VRM assets | Fallback or clear error | S2 |

### 8.5 ErrorBoundary (@Pleasures)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| ERR-017 | Force React render crash | ErrorBoundary catches, shows "Something went wrong" | S1 |
| ERR-018 | Click Dismiss on boundary | Clears, UI re-renders | S2 |
| ERR-019 | Click Reload on boundary | Full page reload | S2 |

---

## SECTION 9: Security Testing (@fabulous)

| ID | Test | Expected | Sev |
|----|------|----------|-----|
| SEC-001 | SQL injection via database query | Rejected by readonly guard | S1 |
| SEC-002 | Command injection via terminal | Blocked by allowlist/sandbox | S1 |
| SEC-003 | Wallet export rate limiting | Hardened guard rate-limits, audit logs | S1 |
| SEC-004 | Secrets endpoint without auth | 401 | S1 |
| SEC-005 | WebSocket without auth token | Connection rejected | S1 |
| SEC-006 | Connector config without auth | Blocked | S1 |
| SEC-007 | Plugin config without auth | Blocked | S1 |
| SEC-008 | Trade without permissions | Blocked | S1 |
| SEC-009 | Transfer without permissions | Blocked | S1 |
| SEC-010 | Database rows without auth | Blocked | S1 |
| SEC-011 | DNS rebinding | Blocked | S1 |
| SEC-012 | Terminal run without auth | Blocked | S1 |
| SEC-013 | Config include injection | Blocked | S1 |
| SEC-014 | SPA fallback outside scope | Blocked | S2 |

---

## SECTION 10: TDD Test Files

All test files use vitest with the existing setup (`test/setup.ts`). They follow the repo's patterns: `vi.hoisted()` + `vi.mock()` for mocking, `vi.fn()` for stubs, `// @vitest-environment jsdom` for component tests.

### Test Files to Create

| File | Tests | Mocking Approach |
|------|-------|-----------------|
| `qa-onboarding.test.ts` | ONB-001 through ONB-010, STR-001 through STR-003 | Mock `client.submitOnboarding`, `client.getOnboardingStatus`, `client.getOnboardingOptions` |
| `qa-chat.test.ts` | BTN-C001 through C010, E2E-C001 through C005 | Mock `client.sendMessage`, WebSocket, `client.createConversation` |
| `qa-wallet.test.ts` | BTN-W001 through W009, E2E-W001 through W004 | Mock `client.getWalletBalances`, `client.executeBscTrade`, `client.exportWalletKeys` |
| `qa-connectors.test.ts` | BTN-CN001 through CN011, BTN-T001 through T006 | Mock `client.getConnectors`, `client.saveConnector`, `client.createTrigger` |
| `qa-settings.test.ts` | BTN-SET001 through SET008, BTN-AG001 through AG009 | Mock `client.updateConfig`, `client.updateSecrets`, `client.startAgent` |
| `qa-plugins.test.ts` | BTN-ADV001 through ADV010, E2E-PL001 through PL003 | Mock `client.getPlugins`, `client.installRegistryPlugin`, `client.searchSkillsMarketplace` |
| `qa-fuzz.test.ts` | FUZ-001 through FUZ-027 | Direct API calls + mock responses for sanitization validation |
| `qa-overload.test.ts` | OVR-001 through OVR-014 | Generate large payloads, measure memory/timing |
| `qa-errors.test.ts` | ERR-001 through ERR-019, DUM-015 through DUM-018 | Mock `fetch` to return 401/429/500, simulate network failures |
| `qa-security.test.ts` | SEC-001 through SEC-014 | Direct HTTP requests to security-guarded endpoints |
| `qa-navigation.test.ts` | All 28 tabs | React TestRenderer with mocked state, verify no throw |

### Run Commands
```bash
# Run all QA tests
bun run test --grep "QA:"

# Run specific category
bun run test --grep "QA: Fuzz"
bun run test --grep "QA: Security"

# Run full suite
bun run test
bun run check
```

---

## Execution Schedule

| Phase | Days | Focus |
|-------|------|-------|
| **Smoke** | Day 1 | Everyone: install, onboard, verify chat. @Pleasures: run automated suite |
| **Feature** | Days 2-3 | Each tester runs their BTN-* and E2E-* cases. Daily sync |
| **Stress & Security** | Days 4-5 | @Pleasures: FUZ/DUM/OVR. @fabulous: SEC. Others: regression |
| **Cross-Platform** | Day 6 | Each tester tests on different platform than primary |
| **Sign-off** | Day 7 | All S1 resolved, S2 filed, automated suite passes |

---

## Bug Report Template

```
**ID**: [e.g. BTN-W005]
**Title**: [short description]
**Severity**: S1/S2/S3/S4
**Platform**: Windows 11 / macOS arm64 / Linux / iOS / Android / Web
**Build**: [version/commit]
**Tester**: @handle

**Steps**:
1. ...

**Expected**: ...
**Actual**: ...
**Console Errors**: [if any]
**Screenshots**: [attach]
```

---

## Critical Files Reference

- `packages/app-core/src/api/client.ts` — 288-method API client (every test touches this)
- `packages/app-core/src/navigation/index.ts` — All 28 tabs defined here
- `packages/app-core/src/components/OnboardingWizard.tsx` — Onboarding flow
- `packages/app-core/src/api/server.ts` — Security guards, SQL sanitization, wallet hardening
- `apps/app/electrobun/src/index.ts` — Desktop runtime entry (window state, CEF config)
- `apps/app/electrobun/electrobun.config.ts` — CEF chromium flags, GPU sandbox fix
