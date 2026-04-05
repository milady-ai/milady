/**
 * Docs registry — single source of truth for every consumer doc page at
 * milady.ai/docs. Drives the sidebar, tier landing pages, prev/next links,
 * and the /docs landing cards.
 *
 * Adding a page:
 *   1. Create the MDX file under `./content/<tier>/<slug>.mdx`
 *   2. Add an entry below with `component: lazy(() => import('./content/…'))`
 *   3. Bump the `order` field so the sidebar stays meaningfully ordered
 *
 * Pages that are planned but not yet written keep `component: null`. The
 * sidebar renders them as dimmed "Coming soon" items so the full info
 * architecture is visible from the first commit of Phase 2 onward. Later
 * phases flip null → lazy-loaded MDX as content lands.
 */

import { type ComponentType, lazy } from "react";

export type DocTier = "beginner" | "intermediate" | "advanced" | "developer";

export interface DocEntry {
  /** URL slug under the tier (e.g. "welcome"). Empty string = tier index. */
  slug: string;
  /** Display title shown in sidebar and `<h1>`. */
  title: string;
  /** Short pitch for landing cards and tier index lists. */
  description: string;
  /** Which tier column this page lives in; `null` for the top-level `/docs` landing. */
  tier: DocTier | null;
  /** Sort key within a tier. */
  order: number;
  /** Full URL path (used by router + sidebar + prev/next nav). */
  path: string;
  /**
   * React.lazy component that resolves to the MDX page module, or `null`
   * if the page hasn't been written yet.
   */
  component: ComponentType<object> | null;
}

export const docsRegistry: DocEntry[] = [
  // ── Landing ──────────────────────────────────────────────────────────
  {
    slug: "",
    title: "Docs",
    description: "Welcome to Milady. Start wherever you are.",
    tier: null,
    order: 0,
    path: "/docs",
    component: lazy(() => import("./content/index.mdx")),
  },

  // ── Beginner ─────────────────────────────────────────────────────────
  {
    slug: "welcome",
    title: "What is Milady?",
    description:
      "A short tour of what Milady actually does, what it isn't, and whether it's the right fit for you.",
    tier: "beginner",
    order: 1,
    path: "/docs/beginner/welcome",
    component: lazy(() => import("./content/beginner/welcome.mdx")),
  },
  {
    slug: "install",
    title: "Install Milady",
    description:
      "Download and install the desktop app on macOS, Windows, or Linux.",
    tier: "beginner",
    order: 2,
    path: "/docs/beginner/install",
    component: lazy(() => import("./content/beginner/install.mdx")),
  },
  {
    slug: "first-run",
    title: "Your first launch",
    description:
      "What happens the first time you open Milady — server picker, first agent, onboarding steps.",
    tier: "beginner",
    order: 3,
    path: "/docs/beginner/first-run",
    component: lazy(() => import("./content/beginner/first-run.mdx")),
  },
  {
    slug: "your-first-chat",
    title: "Your first chat",
    description:
      "Send a message, hear a voice, understand how responses come back and where they live.",
    tier: "beginner",
    order: 4,
    path: "/docs/beginner/your-first-chat",
    component: lazy(() => import("./content/beginner/your-first-chat.mdx")),
  },
  {
    slug: "picking-a-provider",
    title: "Picking a provider",
    description:
      "Local, Eliza Cloud, or bring-your-own-key — which one is right on day one and how to switch later.",
    tier: "beginner",
    order: 5,
    path: "/docs/beginner/picking-a-provider",
    component: lazy(() => import("./content/beginner/picking-a-provider.mdx")),
  },
  {
    slug: "settings-basics",
    title: "Settings basics",
    description:
      "The five settings that actually matter on day one, and the rest you can ignore.",
    tier: "beginner",
    order: 6,
    path: "/docs/beginner/settings-basics",
    component: lazy(() => import("./content/beginner/settings-basics.mdx")),
  },
  {
    slug: "troubleshooting",
    title: "First-hour troubleshooting",
    description:
      "Common things that go sideways in the first hour and how to get unstuck fast.",
    tier: "beginner",
    order: 7,
    path: "/docs/beginner/troubleshooting",
    component: lazy(() => import("./content/beginner/troubleshooting.mdx")),
  },

  // ── Intermediate ─────────────────────────────────────────────────────
  {
    slug: "connect-discord",
    title: "Connect to Discord",
    description:
      "Bring Milady into your Discord server without writing any code.",
    tier: "intermediate",
    order: 1,
    path: "/docs/intermediate/connect-discord",
    component: lazy(() => import("./content/intermediate/connect-discord.mdx")),
  },
  {
    slug: "connect-telegram",
    title: "Connect to Telegram",
    description: "Hook Milady up to a Telegram bot in a few minutes.",
    tier: "intermediate",
    order: 2,
    path: "/docs/intermediate/connect-telegram",
    component: lazy(
      () => import("./content/intermediate/connect-telegram.mdx"),
    ),
  },
  {
    slug: "character-tweaks",
    title: "Make it yours",
    description:
      "Name, personality, voice, avatar — how to change Milady's character without breaking anything.",
    tier: "intermediate",
    order: 3,
    path: "/docs/intermediate/character-tweaks",
    component: lazy(
      () => import("./content/intermediate/character-tweaks.mdx"),
    ),
  },
  {
    slug: "memory-and-knowledge",
    title: "Memory and knowledge",
    description:
      "How Milady remembers things across chats and how to teach it from your own documents.",
    tier: "intermediate",
    order: 4,
    path: "/docs/intermediate/memory-and-knowledge",
    component: lazy(
      () => import("./content/intermediate/memory-and-knowledge.mdx"),
    ),
  },
  {
    slug: "switching-providers",
    title: "Switching providers mid-flight",
    description:
      "Move between local models, cloud APIs, and fallback chains without losing state.",
    tier: "intermediate",
    order: 5,
    path: "/docs/intermediate/switching-providers",
    component: lazy(
      () => import("./content/intermediate/switching-providers.mdx"),
    ),
  },
  {
    slug: "voice-and-tts",
    title: "Voice, talk mode, and TTS",
    description:
      "Pick a voice, start talk mode, and understand what's happening when lip sync gets weird.",
    tier: "intermediate",
    order: 6,
    path: "/docs/intermediate/voice-and-tts",
    component: lazy(() => import("./content/intermediate/voice-and-tts.mdx")),
  },

  // ── Advanced ─────────────────────────────────────────────────────────
  {
    slug: "multi-connector-setup",
    title: "Running multiple connectors",
    description:
      "Discord + Telegram + iMessage all at once, without your agent losing its mind.",
    tier: "advanced",
    order: 1,
    path: "/docs/advanced/multi-connector-setup",
    component: lazy(
      () => import("./content/advanced/multi-connector-setup.mdx"),
    ),
  },
  {
    slug: "wallet-and-payments",
    title: "Wallet and payments",
    description:
      "EVM wallet, Vincent, Steward — what they are, when to use them, and how to stay safe.",
    tier: "advanced",
    order: 2,
    path: "/docs/advanced/wallet-and-payments",
    component: lazy(() => import("./content/advanced/wallet-and-payments.mdx")),
  },
  {
    slug: "plugins-for-users",
    title: "Plugins for non-developers",
    description:
      "How to install and enable a plugin without touching code. If you can download the app, you can do this.",
    tier: "advanced",
    order: 3,
    path: "/docs/advanced/plugins-for-users",
    component: lazy(() => import("./content/advanced/plugins-for-users.mdx")),
  },
  {
    slug: "privacy-and-data",
    title: "Privacy, data, and what stays local",
    description:
      "Where your conversations live, what gets sent to cloud providers, and how to turn telemetry off.",
    tier: "advanced",
    order: 4,
    path: "/docs/advanced/privacy-and-data",
    component: lazy(() => import("./content/advanced/privacy-and-data.mdx")),
  },
  {
    slug: "power-user-shortcuts",
    title: "Power user shortcuts",
    description:
      "Keybindings, a handful of CLI commands, and the dev observability endpoints worth knowing.",
    tier: "advanced",
    order: 5,
    path: "/docs/advanced/power-user-shortcuts",
    component: lazy(
      () => import("./content/advanced/power-user-shortcuts.mdx"),
    ),
  },

  // ── Developer (lander — real content lives at docs.milady.ai) ───────
  {
    slug: "",
    title: "For developers",
    description:
      "Building on Milady, writing plugins, using the REST API or CLI? Head to docs.milady.ai.",
    tier: "developer",
    order: 1,
    path: "/docs/developer",
    component: lazy(() => import("./content/developer/index.mdx")),
  },
];

/** Map from `/docs/...` path → entry. Used by the route components. */
export const docsByPath = new Map<string, DocEntry>(
  docsRegistry.map((entry) => [entry.path, entry]),
);

/** Entries grouped and sorted by tier. */
export function entriesForTier(tier: DocTier): DocEntry[] {
  return docsRegistry
    .filter((e) => e.tier === tier)
    .sort((a, b) => a.order - b.order);
}

/** All four tiers in display order, with their entries. Drives the sidebar. */
export const tierSections: Array<{
  tier: DocTier;
  label: string;
  description: string;
  entries: DocEntry[];
}> = [
  {
    tier: "beginner",
    label: "Beginner",
    description: "Start here. Install, first run, first chat.",
    entries: entriesForTier("beginner"),
  },
  {
    tier: "intermediate",
    label: "Intermediate",
    description: "Connect platforms, customize the character, manage memory.",
    entries: entriesForTier("intermediate"),
  },
  {
    tier: "advanced",
    label: "Advanced",
    description: "Multi-connector setups, wallet, plugins, privacy.",
    entries: entriesForTier("advanced"),
  },
  {
    tier: "developer",
    label: "Developer",
    description: "Building on Milady? You want docs.milady.ai.",
    entries: entriesForTier("developer"),
  },
];

/**
 * Given the current path, return the previous and next written pages in
 * registry order. Unwritten (component === null) entries are skipped so the
 * footer never links to a "coming soon" stub.
 */
export function findAdjacent(currentPath: string): {
  prev: DocEntry | null;
  next: DocEntry | null;
} {
  const written = docsRegistry.filter((e) => e.component !== null);
  const idx = written.findIndex((e) => e.path === currentPath);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? written[idx - 1] : null,
    next: idx < written.length - 1 ? written[idx + 1] : null,
  };
}
