<!-- Generated 2026-05-30 by apple-linux-deploy-audit workflow (31 agents, adversarially verified). -->

Ground truth locked. The advisor was right on the mechanism:

1. **v2.0.10 actually shipped `stable-linux-x64-Milady-Setup.tar.gz`** — a real 748.7 MB self-extracting electrobun installer. The homepage Linux button works TODAY. NO `.deb`, NO `.AppImage`, NO `.rpm`, NO snap/flatpak attached.
2. The `eliza-<env>-...tar.zst` at line 1068 is confirmed **fallback-branch only** (gated `draft != true || publish_release == true` exits before reaching it; the zst code is the draft-fallback path). So the name-mismatch "regen drops Linux" mechanism is wrong — the `*-Setup.tar.gz` matches the homepage matcher fine.
3. The real blocker is the **publish gate** (`publish_release: false` → release job skipped → assetless automated releases for ALL platforms), not naming. v2.0.10 came from a manual dispatch.

I have everything I need. Writing the synthesis report now.

The final report:

# Linux Platform Deployment — Synthesis Report (Milady + elizaOS)

## 1. Executive Summary — true current state

**First-try usable today: QUALIFIED YES for the tarball, NO for everything the docs advertise.**

A Linux user who lands on the Milady homepage can download a working self-extracting desktop installer **right now**. The latest release `v2.0.10` actually carries `stable-linux-x64-Milady-Setup.tar.gz` (748.7 MB, a real electrobun self-extracting bundle — verified via `gh release view v2.0.10`), and the homepage button surfaces it correctly (`apps/homepage/src/generated/release-data.ts:52-57`; matcher `scripts/write-homepage-release-data.mjs:216-220` derives name/size live from the GitHub API). This is the ONE correct, branded, user-reachable Linux path.

Everything else is broken or misleading:

- **Every native package the docs advertise fails.** `README.md:83` advertises `.AppImage` / `.deb` / Snap / Flatpak / APT; `install.mdx:61-65` instructs `chmod +x Milady.AppImage` and `sudo dpkg -i milady_*.deb`; `README.md:269/283/301` give `snap install milady`, `flatpak install flathub ai.milady.Milady`, `apt install milady`. None of these exist: the Milady pipeline builds **no AppImage/deb/rpm GUI installer**, and the snap/flatpak/apt that DO build are the elizaOS-branded **headless CLI** (`elizaos-app` / `ai.elizaos.App`), a different product. 5 of 6 advertised Linux paths are dead.
- **The automated release path ships assetless releases.** `v2.0.10` only has assets because a human ran a manual `workflow_dispatch`. The routine `agent-release.yml` path attaches nothing (see Blocker 1), and the release body falsely claims installers were attached.
- **The shipped tarball links system WebKitGTK with no declared dependency or preflight** — conditional crash on minimal/server images and possibly Ubuntu 24.04 (medium, host-conditional).

**Mechanism correction (important):** an earlier reading held that the homepage "drops Linux on next regen because the pipeline emits `.tar.zst` not `.tar.gz`." That is **wrong**. The `eliza-<env>-linux-x64.tar.zst` at `release-electrobun.yml:1068` is the **draft-only fallback branch** (the non-fallback path exits at `:1044` before reaching it). The normal Linux artifact is electrobun's `*-Setup.tar.gz`, which matches the homepage matcher fine. The real failure is the **publish gate**, not naming.

Dev path is architecturally sound (shares `dev-platform.mjs` with macOS/Windows; correct `WEBKIT_DISABLE_DMABUF_RENDERER=1` workaround) but has the cross-platform packages-mode-vs-local-mode trap with no pointer to `eliza:local`.

---

## 2. Out-of-Box Blockers (ranked)

**B1 — Automated release attaches no Linux (or any) desktop installer; release body lies.** `MILADY`
`agent-release.yml:417` calls `release-electrobun.yml` with `publish_release: false`; the release job is gated `if: (github.event_name != 'workflow_call' || inputs.publish_release)` (`release-electrobun.yml:1986`), so on the orchestrated path it is skipped — no GitHub release asset, no `releases.milady.ai` updater push. `agent-release.yml`'s own publish job creates a release (`:1288`) but has zero `download-artifact`/`gh release upload` for electrobun, yet asserts `'- ✅ Electrobun artifacts (uploaded during build phase)'` (`:1238`) and full Linux matrix (`:1227`). v2.0.10 exists only via manual dispatch. **Platform-agnostic** (same defect for macOS/Windows; dedupe with the Windows audit).
**Fix:** flip `publish_release` by channel, OR add a `download-artifact` + `softprops/action-gh-release` step in the publish job that attaches the `*-Setup.tar.gz`/`.dmg`/`.exe`. Correct the false notes at `:1227/:1238`.

**B2 — README + install docs advertise 5 Linux download paths that don't exist or install a different product.** `MILADY`
`README.md:83` (AppImage/deb/Snap/Flatpak/APT, all → `/releases/latest`); `README.md:269/283/287/301` (`snap install milady`, `flatpak install flathub ai.milady.Milady`, `flatpak --user install milady.flatpak`, `apt install milady`); `install.mdx:61-65` (`Milady.AppImage`, `sudo dpkg -i milady_*.deb`). Reality: the GUI ships only as `*-Setup.tar.gz`; snap is `elizaos-app` (`publish-packages.yml:279`), flatpak is `ai.elizaos.App` producing `elizaos-app.flatpak` (`:432/:456`), apt package is `elizaos-app`. The actual flatpak sideload file is `elizaos-app.flatpak`, not `milady.flatpak`. App-id is a triple mismatch: README `ai.milady.Milady` vs `package.json:74` `ai.milady.milady` (casing) vs published `ai.elizaos.App`.
**Fix:** rewrite `README.md` and `install.mdx` to advertise exactly the `stable-linux-x64-Milady-Setup.tar.gz` self-extracting installer + its real install steps (extract, run `./installer`); remove the AppImage/deb/snap/flatpak/apt rows until those are actually built + Milady-branded + published.

**B3 — Shipped Linux tarball depends on system WebKitGTK with no declared dep and no preflight.** `BOTH` *(host-conditional — medium per verdict)*
`electrobun.config.ts:599-607` sets `bundleCEF: linuxCefEnabled`, gated by `ELIZA_ELECTROBUN_ENABLE_LINUX_CEF` (`:80`), default **OFF** — never enabled in any CI of either repo (contrast `win.bundleCEF:true` at `:609`). The electrobun CLI then copies the GTK-only `libNativeWrapper.so` (`node_modules/electrobun/src/cli/index.ts:2737-2760`), which dlopens `libwebkit2gtk-4.1` / `libgtk-3` / `libayatana-appindicator3` at launch (corroborated by `dev-platform.mjs:85-94`). `createLinuxInstallerArchive` bundles no webview runtime. On minimal/server/derivative images, or Ubuntu 24.04 if the prebuilt links the dropped 4.0 soname, the app crashes at webview creation with no actionable error.
**Fix (MILADY):** document `libwebkit2gtk-4.1-0` / `libgtk-3-0` / `libayatana-appindicator3-1` as Linux prerequisites; add a startup/preflight probe that prints the exact `apt install` line if missing. **(ELIZA):** either enable `ELIZA_ELECTROBUN_ENABLE_LINUX_CEF` for Linux release builds (self-contained download) or pin/document the webkit soname the prebuilt links. Do NOT fix via deb `Depends:` — that packaging path is orphaned for the GUI.

---

## 3. Ranked Fix Plan

### MILADY (committable in this repo)

| # | Title | Sev | Change | Files |
|---|-------|-----|--------|-------|
| M1 | **Fix the publish gate** (B1) | blocker | Gate `publish_release` by channel, or add a `download-artifact` + `softprops/action-gh-release` attach job in the publish job. Remove false `✅ artifacts uploaded` lines. | `.github/workflows/agent-release.yml:417,1227,1238` |
| M2 | **Align all docs to the `*-Setup.tar.gz`** (B2) | blocker | Rewrite Linux rows to the one real artifact + real install steps; delete AppImage/deb/snap/flatpak/apt claims (or gate behind "coming soon"). Unify app-id casing to `ai.milady.milady`. | `README.md:83,266-303`, `apps/homepage/src/docs/content/beginner/install.mdx:35,61-65`, troubleshooting doc |
| M3 | **Stop publishing elizaOS-branded packages on every Milady release** | high | `release-orchestrator.yml` fires on `release: published` and forces snap/flatpak/apt/pypi true → `publish-packages.yml` builds+attaches `elizaos-app_*.deb` (`:378`) and `elizaos-app.flatpak` (`:456`) **un-credential-gated** to the Milady release, publishes PyPI `elizaos-app` (`:177`). Decide intent: REMOVE these jobs from the Milady release path, OR rebrand the recipes to Milady IDs sourcing Milady (not `npm i -g elizaos`). Do not ship both. | `.github/workflows/release-orchestrator.yml:265-276`, `publish-packages.yml` |
| M4 | **Document desktop requires LOCAL mode + add fail-fast** | high | Desktop build/dev needs `eliza:local` (packages mode ships no `platforms/`); `README.md:238` "both modes" is false; CI forces `MILADY_ELIZA_SOURCE: local` (`release-electrobun.yml:405`). Add a packages-mode guard to `desktop:preflight`/`dev:desktop:preflight` that exits with "run `bun run eliza:local` first". Reorder CLAUDE.md Quick Start so `eliza:local` precedes `dev:desktop`. Document `ELIZA_DESKTOP_BUILD_WHISPER=0`. | `README.md:238`, `package.json:74-75,124`, `scripts/`, `CLAUDE.md` |
| M5 | **Rename release from "Eliza" to "Milady"** | medium | `release-electrobun.yml:2071` names the GitHub release `Eliza ${tag}`. (Note: the version.json identity hardcode at `:1060/:1156` is **functionally inert** — runtime reads brand-config, not version.json; demote that half.) | `release-electrobun.yml:2071` |
| M6 | **Restore or remove the `@generated` header** | medium | `scripts/sync-root-github-workflows-from-eliza.mjs` is **absent** but 6 workflows claim `@generated by` it — this is why milady's `release-electrobun.yml` silently dropped eliza's Linux packaging step. Restore the generator (and reconcile the delta) OR strip the header and own these as hand-maintained with a drift guard. | `release-electrobun.yml:1`, `publish-packages.yml`, `release-orchestrator.yml`, `apple-store-release.yml`, `update-homebrew.yml`, `android-release.yml` |
| M7 | **Decide Tails ISO scope** | medium | `build-tails-iso.yml` clones `elizaOS/eliza@develop` for `variants/milady-tails` (absent in the local clone), builds artifact-only, never signs/publishes (`:21-24`). If real, add sign+publish+homepage entry; else label it internal-validation and stop implying a Linux ISO product. (Cross-repo: the variant tree lives upstream.) | `.github/workflows/build-tails-iso.yml` |
| M8 | **Sweep crashed Linux dev launcher** | low | `cleanup-desktop-orphans.mjs:65-66` patterns match only macOS `.app/Contents/MacOS/launcher`; Linux dev build is `<buildFolder>/Milady-dev/bin/launcher`. Add Linux/Windows launcher patterns. (Mitigated: the `dev-server.ts` API-orphan pattern still sweeps the PGlite lock-holder.) | `scripts/cleanup-desktop-orphans.mjs` |
| M9 | **Linux ARM honesty** | low | Desktop matrix is `linux-x64` only (`release-electrobun.yml:286,295`) though the core-target case accepts `linux-arm64` (`:951`). Add an arm64 matrix entry (arm64 runner) OR remove the misleading branch and document Linux as x86_64-only. | `release-electrobun.yml:286,295` |

### ELIZA (upstream PR — NOT committable here)

| # | Title | Sev | Change | Files |
|---|-------|-----|--------|-------|
| E1 | **Parameterize `package-electrobun-linux.mjs` branding** | high *(latent for Milady)* | Hardcodes `Name=Eliza`, `Exec=eliza`, `/opt/eliza`, `Package: elizaos-app`, `Eliza-*.AppImage` (`:102-114,121-149,161-193,252`); reads no `ELIZA_APP_NAME`/`ELIZA_APP_ID`/`ELIZA_NAMESPACE` (only env hit is AppImage arch at `:255`). Thread the brand env (same axis `build:desktop` already sets), default to Eliza. **Must land WITH any Milady fix that wires this script in**, else Milady installers ship Eliza-branded. | `eliza/packages/app-core/scripts/package-electrobun-linux.mjs` |
| E2 | **Resolve the `elizaos-app` .deb name collision** | high | Two producers emit `Package=elizaos-app`: the Electrobun GUI deb (`package-electrobun-linux.mjs:161`, → `/opt/eliza`) and the headless CLI deb (`packaging/debian/control`, → `/usr/lib/elizaos-app`). `release-all.yml` runs both. Rename the CLI package (e.g. `elizaos-cli`). Also reconcile the dashboard port: snap lists both 2138 + 18789, debian/control lists only 18789. | `eliza/.../scripts/package-electrobun-linux.mjs`, `eliza/.../packaging/debian/control`, `packaging/snap/snapcraft.yaml` |
| E3 | **Add a Linux packaged-app smoke test** | medium | `release-electrobun.yml` has macOS (`:1375`) + Windows (`:1061`) packaged smoke steps but NO Linux one; no workflow uses xvfb to boot the GUI. This is exactly why B3 (webkit dep gap) can ship undetected. Add an xvfb-run install+launch smoke for the AppImage/deb. | `eliza/.github/workflows/release-electrobun.yml` |
| E4 | **AppImage arch + branding bug** | low | `buildAppImage` always downloads `appimagetool-x86_64` regardless of target arch; hardcodes Eliza names. Select tool by arch; thread brand env. (Moot until Milady wires it.) | `eliza/.../scripts/package-electrobun-linux.mjs` |
| E5 | **GNOME close-to-tray trap** | low | Close defaults to minimize-to-tray (`index.ts:1091-1103`, `exitOnLastWindowClosed:false`), but GNOME hides tray without appindicator → window strands, menu unreachable. Quit-on-last-window or detect StatusNotifierWatcher on Linux. | `eliza/.../platforms/electrobun/...index.ts` |

---

## 4. Linux FORMAT CONSOLIDATION — decisive recommendation

Evidence of what is **actually built + attached + reachable** vs **dead/aspirational**:

| Format | Built? | Attached to release? | Branded Milady? | Reachable by user? | Verdict |
|--------|--------|----------------------|-----------------|--------------------|---------|
| **electrobun `*-Setup.tar.gz`** | ✅ | ✅ (v2.0.10, 748.7 MB) | ✅ | ✅ homepage button | **KEEP — canonical** |
| `.tar.zst` updater | ✅ (fallback/updater transport) | n/a | ✅ | ❌ not an installer | KEEP internal (updater only — never surface to users) |
| GUI `.deb`/`.rpm`/`.AppImage` (`package-electrobun-linux.mjs`) | ❌ in Milady (orphaned; eliza only) | ❌ | ❌ Eliza-branded | ❌ | **AppImage: build via existing path if a native fmt is wanted. deb/rpm: RETIRE** |
| Snap `elizaos-app` | ✅ | publish gated on creds | ❌ Eliza CLI | ❌ wrong product | **RETIRE or rebrand** |
| Flatpak `ai.elizaos.App` | ✅ | ✅ un-gated (wrong product) | ❌ Eliza CLI | ❌ | **RETIRE or rebrand** |
| APT repo `elizaos-app` | dispatch gated on creds | n/a | ❌ Eliza CLI | ❌ | **RETIRE or rebrand** |
| PyPI `elizaos-app` | ✅ | n/a | ❌ Eliza CLI | ❌ | **RETIRE from Milady release path** |
| CLI `.deb` (`packaging/debian`) | ✅ | ✅ un-gated | ❌ Eliza CLI | ❌ | RETIRE/rename (collides with GUI deb name) |
| Linux ISO / USB / VM / Tails | partial, unsigned/artifact-only | ❌ | partial | ❌ | **Separate "elizaOS OS" product line — not the app download** |

**Decisive cut:**

1. **Canonical user download = the electrobun `*-Setup.tar.gz` self-extracting installer.** It is the only format actually built, attached, branded Milady, and surfaced. All docs point here.
2. **If one native package is desired, choose AppImage** (portable, no store account, no name collision) and produce it through the **existing single path** — do NOT wire `package-electrobun-linux.mjs` into `release-electrobun.yml`, because `publish-packages.yml` already builds a deb; adding the GUI deb creates the exact two-deb divergence this audit exists to kill. One native format, one path.
3. **Retire (or fully rebrand+store-list) the elizaos-app snap/flatpak/apt/pypi** from the Milady release path. Today they ship a wrong-product, wrong-brand CLI on every Milady release — the single sharpest confusion source.
4. **Treat ISO/USB/VM/Tails as a distinct "elizaOS OS" product**, not the app download. Stop implying a Milady Linux ISO product until it is signed + published + surfaced.

Net: collapse ~9 advertised/attempted Linux formats down to **1 canonical (Setup.tar.gz)** + optionally **1 native (AppImage)**.

---

## 5. Simplify / De-confuse

- **One Linux download, one doc.** README, install.mdx, troubleshooting.mdx, and homepage `release-data.ts` must all name the same artifact (`stable-linux-x64-Milady-Setup.tar.gz`). Today they diverge (docs say AppImage/deb/snap/flatpak/apt; homepage says tarball).
- **One deb name, one product.** Eliza upstream has two `elizaos-app` debs (GUI vs CLI) that collide on install (E2).
- **One source of truth for workflows.** Either the `@generated` sync script exists and runs, or the header is removed (M6). Right now it claims auto-generation that cannot happen and has already caused the Linux-packaging drift.
- **One publish path.** The desktop GUI installers and the (to-be-removed-or-rebranded) packages should not be attached by different jobs with different gating; today GUI installers strand as artifacts while CLI packages reach the release un-gated.
- **One mode story for desktop.** Stop saying "both modes"; desktop = local mode, fail fast otherwise (M4).

## Open Questions (user decisions only)

1. **Native Linux package — yes/no, and which?** Recommend AppImage-only via the existing path, or tarball-only. Do you want a `.deb` at all (requires rebranding + de-colliding upstream)?
2. **Snap/Flatpak/APT/PyPI — remove or rebrand?** Are these intended Milady distribution surfaces? If yes, they need Milady-branded recipes (upstream PR) + store accounts (`SNAP_STORE_CREDENTIALS`, Flathub listing, `APT_REPO_TOKEN`). If no, remove the jobs from the Milady release path.
3. **Linux ISO / Tails — real product or internal?** If real, it needs signing + publishing + a homepage entry, and the `milady-tails` variant must land on `elizaOS/eliza@develop`.
4. **Linux ARM — supported?** If yes, add the arm64 matrix entry + runner; if no, remove the misleading core-target branch.
5. **Bundle CEF on Linux (self-contained, larger) vs require system WebKitGTK (smaller, fragile)?** This decides whether B3 is fixed by bundling or by documentation+preflight.