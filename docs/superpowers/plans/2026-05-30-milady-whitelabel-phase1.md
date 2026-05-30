# Milady Whitelabel — Phase 1 (Design System + Own Startup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Milady its own executive identity (flat velvet black, champagne/cream gold, condensed-display + mono type) and its own startup splash, replacing the inherited elizaOS gold theme + blue "elizaOS" splash — lightning-fast (no startup video/webfont on the critical path).

**Architecture:** Milady stays the `apps/app` client. Phase 1 is the design-system + identity foundation: a self-contained `milady-executive.css` token sheet replaces the `brand-gold.css` import (token-driven shared UI reskins automatically), self-hosted subset fonts, and a Milady-owned `MiladyStartupShell` supplied through a new `startupShell` boot-config slot. The slot + a committable splash recolor + a Milady favicon make the front door on-brand even before the upstream slot reaches packaged builds.

**Tech Stack:** Vite + React + TypeScript; Tailwind `@theme inline` over CSS custom properties; Electrobun desktop shell; bun.

**Ownership constraint:** Only `apps/app/**`, `scripts/**`, `docs/**` are committable here. `eliza/**` is the gitignored upstream clone — edits there take effect in local-mode dev only and must also ship as an elizaOS PR (Task 10). Each file below is marked COMMITTABLE or UPSTREAM (local-dev).

**Verification reality:** CSS/asset/React-component frontend work — verification is `bun run verify` (typecheck + lint), `bun run --cwd apps/app build`, and a desktop dev render + perf check, not unit-test TDD. A focused component test is included where it adds value.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `apps/app/design.md` | Create · COMMITTABLE | Design-system source of truth (DESIGN.md format) |
| `apps/app/src/styles/fonts/saira-condensed-latin.woff2` | Create · COMMITTABLE | Display font (condensed grotesque), latin subset |
| `apps/app/src/styles/fonts/jetbrains-mono-latin.woff2` | Create · COMMITTABLE | Mono/label font, latin subset |
| `apps/app/src/styles/milady-executive.css` | Create · COMMITTABLE | Theme: font-face + :root tokens + dark tokens + first-run + velvet + splash recolor stopgap |
| `apps/app/src/main.tsx` | Modify · COMMITTABLE | Swap brand-gold to milady-executive import; pass startupShell slot |
| `apps/app/index.html` | Modify · COMMITTABLE | Preload the 2 fonts; point favicons at the Milady mark |
| `apps/app/src/ui/shell/MiladyStartupShell.tsx` | Create · COMMITTABLE | Milady's own velvet splash |
| `apps/app/src/ui/shell/MiladyStartupShell.test.tsx` | Create · COMMITTABLE | Renders wordmark + status |
| `apps/app/public/brand/favicons/favicon.svg` | Replace · COMMITTABLE | Milady mark (splash logo + tab icon) |
| `eliza/packages/ui/src/config/boot-config-store.ts` | Modify · UPSTREAM (local-dev) | Add startupShell? to AppBootConfig + getter |
| `eliza/packages/ui/src/App.tsx` (~:1593) | Modify · UPSTREAM (local-dev) | Render bootConfig.startupShell ?? StartupScreen |

---

## Task 1: Author the design system (apps/app/design.md)

**Files:** Create `apps/app/design.md` — COMMITTABLE

- [ ] **Step 1:** Write `apps/app/design.md` in DESIGN.md format (YAML token front-matter + prose). Tokens mirror milady-executive.css :root.
  - colors: bg #0a0a0b, bgElevated #151518, card #121214, surface #17171a, text #ece7df, textStrong #f6f2ea, muted #8d877c, border rgba(236,231,223,0.08), accent #c9b38c, accentHover #e8dcc0, accentForeground #0a0a0b
  - typography: display "Saira Condensed" 600; mono "JetBrains Mono" (uppercase+tracked labels); body system sans
  - radius sm 4 / md 8 / lg 14; elevation: single radial glow rgba(201,179,140,0.06), one low soft shadow, matte
  - prose sections (canonical order): Overview · Colors · Typography · Layout · Elevation & Depth · Shapes · Components · Do's and Don'ts. Rules: velvet near-blacks never pure #000; champagne gold sparing (accent/hairline/wordmark dot), never bright #f0b90b; mono uppercase tracked labels; no blue; no gloss/hard shadows; no video on startup critical path.
- [ ] **Step 2: Commit**
```
git add apps/app/design.md
git commit -m "docs(app): add Milady executive design.md (design-system source of truth)"
```

---

## Task 2: Vendor self-hosted subset fonts

**Files:** Create the two woff2 under `apps/app/src/styles/fonts/` — COMMITTABLE. Both SIL OFL.

- [ ] **Step 1:** Fetch prebuilt latin woff2 from @fontsource (no runtime dep):
```
cd /Users/home/Documents/milady
mkdir -p apps/app/src/styles/fonts
npm pack @fontsource/saira-condensed@latest --pack-destination /tmp >/dev/null 2>&1
npm pack @fontsource/jetbrains-mono@latest --pack-destination /tmp >/dev/null 2>&1
tar -xzf /tmp/fontsource-saira-condensed-*.tgz -C /tmp
tar -xzf /tmp/fontsource-jetbrains-mono-*.tgz -C /tmp
cp /tmp/package/files/saira-condensed-latin-600-normal.woff2 apps/app/src/styles/fonts/saira-condensed-latin.woff2
cp /tmp/package/files/jetbrains-mono-latin-500-normal.woff2 apps/app/src/styles/fonts/jetbrains-mono-latin.woff2
ls -la apps/app/src/styles/fonts/
```
Expected: two .woff2, each well under ~40KB. If names differ by version: `ls /tmp/package/files/ | grep latin` and pick latin-600-normal (Saira) + latin-500-normal (JetBrains).
- [ ] **Step 2: Commit**
```
git add apps/app/src/styles/fonts/
git commit -m "feat(app): vendor self-hosted Saira Condensed + JetBrains Mono (latin subset, OFL)"
```

---

## Task 3: Create the executive theme sheet (milady-executive.css)

**Files:** Create `apps/app/src/styles/milady-executive.css` — COMMITTABLE. Self-contained replacement for brand-gold.css.

- [ ] **Step 1:** Write `apps/app/src/styles/milady-executive.css`:
```css
/* Milady executive design system — velvet black + champagne gold.
 * Replaces @elizaos/app-core/styles/brand-gold.css. Source of truth: design.md. */

@font-face {
  font-family: "Saira Condensed";
  font-style: normal; font-weight: 600; font-display: swap;
  src: url("./fonts/saira-condensed-latin.woff2") format("woff2");
}
@font-face {
  font-family: "JetBrains Mono";
  font-style: normal; font-weight: 500; font-display: swap;
  src: url("./fonts/jetbrains-mono-latin.woff2") format("woff2");
}

:root {
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-display: "Saira Condensed", "Arial Narrow", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  --jet-black: #08080a; --rich-black: #0a0a0b; --charcoal: #121214;
  --deep-gold: #a8946b; --classic-gold: #c9b38c; --highlight-gold: #e8dcc0;
  --champagne-gold: #ece7df; --burnished-gold: #b9a173;
  --dark-silver: #2a2a2e; --steel: #8d877c; --bright-silver: #b8b2a6;
  --chrome-highlight: #ece7df; --gunmetal: #17171a;
  --gold-glow: rgba(201,179,140,0.10); --soft-white-glow: rgba(236,231,223,0.05);
  --inner-shadow: rgba(0,0,0,0.55);

  --accent: var(--classic-gold); --accent-rgb: 201,179,140;
  --accent-hover: var(--highlight-gold); --accent-muted: var(--deep-gold);
  --accent-subtle: rgba(201,179,140,0.10); --accent-foreground: #0a0a0b;
  --primary: var(--classic-gold); --primary-foreground: #0a0a0b;
  --ring: rgba(201,179,140,0.55); --border-hover: var(--classic-gold);
  --warn: var(--burnished-gold); --warn-muted: rgba(185,161,115,0.7);
  --warn-subtle: rgba(185,161,115,0.14); --focus: rgba(201,179,140,0.16);
  --focus-ring: 0 0 0 2px rgba(201,179,140,0.30);
  --link-color: var(--classic-gold); --link-hover-color: var(--highlight-gold);
}

[data-theme="dark"], .dark {
  font-family: var(--font-sans);
  --bg: #0a0a0b; --bg-accent: #101012; --bg-elevated: #151518;
  --bg-hover: #1d1d22; --bg-muted: #101012;
  --card: #121214; --card-foreground: #e7e2d9; --surface: #17171a;
  --text: #ece7df; --text-strong: #f6f2ea; --chat-text: #ece7df;
  --muted: #8d877c; --muted-strong: #ada69a;
  --border: rgba(236,231,223,0.08); --border-strong: rgba(236,231,223,0.14);
  --border-subtle: rgba(236,231,223,0.05); --input: #1b1b1f;
  --accent-foreground: #0a0a0b; --primary-foreground: #0a0a0b;
  --header-bar-bg: #08080a; --header-bar-fg: #ece7df;
  --section-bar-bg: #0a0a0b; --section-bar-fg: #ece7df;
}

/* Velvet card sheen — a single diffuse top glow, matte. */
.card, [class*="bg-card"] {
  background-image: radial-gradient(120% 80% at 50% 0%, rgba(201,179,140,0.045), transparent 60%);
}

/* First-run / onboarding palette -> executive velvet. */
.first-run-screen {
  position: fixed; inset: 0; width: 100%; height: 100dvh;
  overflow: hidden; overscroll-behavior: none; background: transparent;
  --text: #ece7df; --muted: #8d877c; --border: rgba(236,231,223,0.10);
  --card: rgba(23,23,26,0.72); --ok: #7fbf9b;
  --accent: var(--classic-gold); --accent-foreground: #0a0a0b;
  --first-run-text-strong: rgba(246,242,234,0.98);
  --first-run-text-primary: rgba(236,231,223,0.96);
  --first-run-text-subtle: rgba(236,231,223,0.80);
  --first-run-text-muted: rgba(173,166,154,0.86);
  --first-run-card-bg: rgba(23,23,26,0.72);
  --first-run-card-border-strong: rgba(201,179,140,0.32);
  --first-run-recommended-bg: rgba(201,179,140,0.12);
  --first-run-recommended-border: rgba(201,179,140,0.28);
  --first-run-accent-bg: rgba(201,179,140,0.16);
  --first-run-accent-border: rgba(201,179,140,0.28);
  --first-run-accent-foreground: #0a0a0b;
  --first-run-input-bg: rgba(10,10,11,0.7);
  --first-run-link: var(--highlight-gold);
}

/* Splash recolor STOPGAP — until MiladyStartupShell ships via the slot (Task 7).
 * Overrides StartupShell hardcoded elizaOS literal-hex classes. FRAGILE; retired by slot. */
[data-testid="startup-shell-loading"],
[data-testid="startup-shell-loading"] [class*="bg-[#F7F9FF]"] {
  background-color: #0a0a0b !important; color: #ece7df !important;
}
[data-testid="startup-shell-loading"] [class*="text-[#0B35F1]"] { color: #ece7df !important; }
[data-testid="startup-shell-loading"] [class*="bg-white"]       { background-color: #17171a !important; }
[data-testid="startup-shell-loading"] [class*="bg-[#0B35F1]"]   { background-color: rgba(201,179,140,0.45) !important; }
[data-testid="startup-shell-loading"] [class*="ring-[#0B35F1]"] { box-shadow: 0 0 0 1px rgba(201,179,140,0.20) !important; }

/* Functional, brand-neutral blocks carried over from brand-gold.css. */
:root {
  --memory-type-messages-bg: rgba(99,102,241,0.15); --memory-type-messages-fg: rgb(99,102,241);
  --memory-type-memories-bg: rgba(168,85,247,0.15); --memory-type-memories-fg: rgb(168,85,247);
  --memory-type-facts-bg: rgba(34,197,94,0.15); --memory-type-facts-fg: rgb(34,197,94);
  --memory-type-documents-bg: rgba(245,158,11,0.15); --memory-type-documents-fg: rgb(245,158,11);
  --memory-type-unknown-bg: rgba(156,163,175,0.15); --memory-type-unknown-fg: rgb(156,163,175);
}
.memory-type-badge-messages { background-color: var(--memory-type-messages-bg); color: var(--memory-type-messages-fg); }
.memory-type-badge-memories { background-color: var(--memory-type-memories-bg); color: var(--memory-type-memories-fg); }
.memory-type-badge-facts { background-color: var(--memory-type-facts-bg); color: var(--memory-type-facts-fg); }
.memory-type-badge-documents { background-color: var(--memory-type-documents-bg); color: var(--memory-type-documents-fg); }
.memory-type-badge-unknown { background-color: var(--memory-type-unknown-bg); color: var(--memory-type-unknown-fg); }
.memory-type-dot-messages { background-color: var(--memory-type-messages-fg); }
.memory-type-dot-memories { background-color: var(--memory-type-memories-fg); }
.memory-type-dot-facts { background-color: var(--memory-type-facts-fg); }
.memory-type-dot-documents { background-color: var(--memory-type-documents-fg); }
.memory-type-dot-unknown { background-color: var(--memory-type-unknown-fg); }
```
- [ ] **Step 2: Commit**
```
git add apps/app/src/styles/milady-executive.css
git commit -m "feat(app): add milady-executive.css (velvet/champagne theme + splash recolor stopgap)"
```

---

## Task 4: Swap the theme import in main.tsx

**Files:** Modify `apps/app/src/main.tsx:3` — COMMITTABLE
- [ ] **Step 1:** Replace line 3 `import "@elizaos/app-core/styles/brand-gold.css";` with:
```
// Milady executive theme — replaces the upstream elizaOS gold theme.
import "./styles/milady-executive.css";
```
Leave line 2 (styles.css base) in place.
- [ ] **Step 2:** `bun run --cwd apps/app build`. Expected: succeeds; the two woff2 emit into the production output (`find apps/app -path '*assets*woff2' -not -path '*node_modules*'`).
- [ ] **Step 3: Commit**
```
git add apps/app/src/main.tsx
git commit -m "feat(app): use milady-executive theme instead of brand-gold"
```

---

## Task 5: Preload the fonts in index.html

**Files:** Modify `apps/app/index.html` — COMMITTABLE. font-display: swap already prevents FOIT.
- [ ] **Step 1:** In `<head>` near the `<link rel="icon">` block (~line 67) add:
```
<link rel="preload" as="font" type="font/woff2" href="/src/styles/fonts/saira-condensed-latin.woff2" crossorigin />
```
If the literal path 404s in the production output, drop the preload and rely on font-display: swap. Do NOT add an external font CDN (CSP is font-src 'self').
- [ ] **Step 2:** `bun run --cwd apps/app build`. Expected: succeeds.
- [ ] **Step 3: Commit**
```
git add apps/app/index.html
git commit -m "perf(app): preload Milady display font; swap fallback paints instantly"
```

---

## Task 6: Milady's own startup splash component

**Files:** Create `apps/app/src/ui/shell/MiladyStartupShell.tsx` + `.test.tsx` — COMMITTABLE. Hardcodes "Milady", minimal props, pure-CSS velvet gradient.
- [ ] **Step 1:** Write `apps/app/src/ui/shell/MiladyStartupShell.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MiladyStartupShell } from "./MiladyStartupShell";

describe("MiladyStartupShell", () => {
  it("renders the Milady wordmark and the status", () => {
    render(<MiladyStartupShell phase="starting" status="Starting agent" />);
    expect(screen.getByText("Milady")).toBeInTheDocument();
    expect(screen.getByText("Starting agent")).toBeInTheDocument();
  });
  it("renders without a status", () => {
    render(<MiladyStartupShell />);
    expect(screen.getByText("Milady")).toBeInTheDocument();
  });
});
```
- [ ] **Step 2:** (from apps/app) `bunx vitest run src/ui/shell/MiladyStartupShell.test.tsx`. Expected: FAIL (cannot resolve ./MiladyStartupShell).
- [ ] **Step 3:** Write `apps/app/src/ui/shell/MiladyStartupShell.tsx`:
```tsx
/** Milady's own startup splash, supplied to elizaOS App via the startupShell
 * boot-config slot. Pure-CSS velvet gradient — no video, no critical-path webfont. */
export interface MiladyStartupShellProps { phase?: string; status?: string; }

export function MiladyStartupShell({ phase, status }: MiladyStartupShellProps) {
  return (
    <div
      data-testid="milady-startup-shell"
      data-startup-phase={phase}
      role="status" aria-live="polite" aria-busy="true"
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{
        background: "radial-gradient(120% 80% at 50% 0%, #17171a 0%, #0a0a0b 55%, #08080a 100%)",
        color: "#ece7df",
        fontFamily: "var(--font-display, 'Arial Narrow', system-ui, sans-serif)",
      }}
    >
      <div className="relative z-10 flex w-full max-w-[24rem] flex-col items-center gap-5 px-6 text-center">
        <div className="flex items-center justify-center gap-3">
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 9999, background: "#c9b38c", boxShadow: "0 0 18px rgba(201,179,140,0.45)" }} />
          <span style={{ fontSize: "2.5rem", fontWeight: 600, letterSpacing: "0.02em", lineHeight: 1 }}>Milady</span>
        </div>
        {status ? (
          <p className="min-h-5 text-sm animate-pulse motion-reduce:animate-none"
             style={{ color: "rgba(236,231,223,0.7)", fontFamily: "var(--font-mono, ui-monospace, monospace)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
            {status}
          </p>
        ) : null}
        <div className="flex w-full max-w-[18rem] flex-col gap-2" aria-hidden>
          <div className="h-2.5 w-full rounded-sm animate-pulse motion-reduce:animate-none" style={{ background: "rgba(201,179,140,0.18)" }} />
          <div className="h-2.5 w-3/4 self-center rounded-sm animate-pulse motion-reduce:animate-none" style={{ background: "rgba(201,179,140,0.12)" }} />
          <div className="h-2.5 w-1/2 self-center rounded-sm animate-pulse motion-reduce:animate-none" style={{ background: "rgba(201,179,140,0.08)" }} />
        </div>
      </div>
    </div>
  );
}
```
- [ ] **Step 4:** (from apps/app) `bunx vitest run src/ui/shell/MiladyStartupShell.test.tsx`. Expected: PASS (2 tests).
- [ ] **Step 5: Commit**
```
git add apps/app/src/ui/shell/MiladyStartupShell.tsx apps/app/src/ui/shell/MiladyStartupShell.test.tsx
git commit -m "feat(app): MiladyStartupShell — own velvet splash (no video, CSS gradient)"
```

---

## Task 7: Wire the startupShell slot

### 7a — UPSTREAM (local-dev): add the slot to AppBootConfig
Modify `eliza/packages/ui/src/config/boot-config-store.ts`. Add to AppBootConfig (near companionShell, ~:227-299):
```ts
  /** Host-supplied startup/splash shell, rendered while the agent boots. */
  startupShell?: import("react").ComponentType<{ phase?: string; status?: string }>;
```
Expose via the same getter pattern as the other slots (mirror companionShell's getter).

### 7b — UPSTREAM (local-dev): render the slot in App.tsx (~:1593)
Modify `eliza/packages/ui/src/App.tsx`. Resolve `const StartupShellSlot = bootConfig.startupShell;`, then in the non-ready startup gate replace `<StartupScreen />` with:
```tsx
{StartupShellSlot ? (
  <StartupShellSlot phase={startupCoordinator.phase} status={startupCoordinator.statusLabel} />
) : (
  <StartupScreen />
)}
```
Use whatever status string the controller exposes; if none, pass only phase=.

### 7c — COMMITTABLE: pass the slot from Milady
Modify `apps/app/src/main.tsx`:
- [ ] add import `import { MiladyStartupShell } from "./ui/shell/MiladyStartupShell";`
- [ ] add to the appBootConfig object literal: `startupShell: MiladyStartupShell,`
Harmless on stale alpha (unknown fields ignored); activates when the slot ships. Until then the Task 3 recolor holds.
- [ ] **Verify (local mode):** `bun run dev:desktop` — splash is the Milady velvet shell (Milady wordmark, champagne dot, no blue, no cloud video).
- [ ] **Commit (committable part only):**
```
git add apps/app/src/main.tsx
git commit -m "feat(app): supply MiladyStartupShell via the startupShell boot-config slot"
```
The eliza/** edits (7a/7b) are NOT committed here — local-mode dev + the upstream PR (Task 10).

---

## Task 8: Milady favicon mark

**Files:** Replace `apps/app/public/brand/favicons/favicon.svg` — COMMITTABLE.
- [ ] **Step 1:** Write `apps/app/public/brand/favicons/favicon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Milady">
  <rect width="64" height="64" rx="14" fill="#0a0a0b"/>
  <circle cx="32" cy="32" r="9" fill="#c9b38c"/>
  <circle cx="32" cy="32" r="9" fill="none" stroke="#e8dcc0" stroke-opacity="0.35" stroke-width="2"/>
</svg>
```
- [ ] **Step 2:** `bun run --cwd apps/app build`; open the splash or inspect the emitted favicon.svg. Expected: champagne dot on velvet, no elizaOS face.
- [ ] **Step 3: Commit**
```
git add apps/app/public/brand/favicons/favicon.svg
git commit -m "feat(app): Milady favicon mark (champagne dot on velvet) replacing elizaOS face"
```
Note: root PNG favicons in index.html are still elizaOS-rendered — regenerating from the mark is a small follow-up; the SVG covers the splash + modern-browser tab.

---

## Task 9: Performance + final verification
- [ ] `bun run verify` — PASS for touched apps/app files.
- [ ] `bun run --cwd apps/app build`; record the two woff2 sizes + the css size (each woff2 < ~40KB; css small). Large bundle regression blocks done.
- [ ] `bun run dev:desktop` (local mode), then probe dev observability:
```
curl -s "http://127.0.0.1:31337/api/dev/console-log?maxLines=200"
curl -s http://127.0.0.1:31337/api/dev/cursor-screenshot -o /tmp/milady-splash.png && ls -la /tmp/milady-splash.png
```
Expected: no font/CSP errors; screenshot shows velvet executive look + Milady splash; no Clouds_Loop_*.mp4 on the startup path.
- [ ] `git push`.

---

## Task 10: Upstream PR for the startupShell slot (handoff)
**Files:** the eliza/** edits from 7a/7b — UPSTREAM (elizaOS PR).
- [ ] Open a PR against elizaOS/eliza adding the startupShell boot-config slot (7a + 7b). Small, generally-useful extension of the existing slot pattern. Durable path so the Milady splash reaches packaged builds after the next alpha republish; until then the Task 3 recolor + Task 8 favicon hold. Track in the upstream connectivity backlog.

---

## Self-Review
- **Spec coverage:** design.md (T1) · theme replacing brand-gold (T3-4) · subset fonts + preload/swap (T2,5) · MiladyStartupShell via slot + recolor + favicon stopgap (T6-8) · lightning-fast: no startup video, swap fallback, thin component, bundle budget (T6,9 + CSS) · ownership marked per file · verify/build/render+perf (T9). All covered.
- **Placeholders:** none — full CSS, full component, full SVG, exact edits + commands.
- **Type consistency:** MiladyStartupShellProps { phase?, status? } identical across component, test, slot type (7a), App render (7b). Slot field `startupShell` consistent across 7a/7b/7c.
- **Risks:** splash recolor couples to upstream class strings (stopgap, retired by slot); upstream slot gated for packaged builds; preload path may drop to swap-only if 404.
