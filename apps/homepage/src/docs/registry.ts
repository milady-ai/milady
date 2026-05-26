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

import type { MDXProps } from "mdx/types";
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
  component: ComponentType<MDXProps> | null;
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
      "What happens the first time you open Milady — name, runtime target, and launch.",
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
    order: 4,
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
    order: 5,
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
    order: 6,
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
    order: 7,
    path: "/docs/intermediate/voice-and-tts",
    component: lazy(() => import("./content/intermediate/voice-and-tts.mdx")),
  },
  {
    slug: "byok-api-keys",
    title: "Bring your own API key",
    description:
      "Sign up for a cloud model provider and paste the key into Milady. Covers OpenAI, Anthropic, Gemini, Groq, OpenRouter, xAI, and Vercel AI Gateway.",
    tier: "intermediate",
    order: 8,
    path: "/docs/intermediate/byok-api-keys",
    component: lazy(() => import("./content/intermediate/byok-api-keys.mdx")),
  },
  {
    slug: "local-ollama",
    title: "Run Milady on a local model with Ollama",
    description:
      "Install Ollama, pull a model, and run Milady entirely on your own machine with nothing going to the cloud.",
    tier: "intermediate",
    order: 9,
    path: "/docs/intermediate/local-ollama",
    component: lazy(() => import("./content/intermediate/local-ollama.mdx")),
  },
  {
    slug: "local-ai",
    title: "Use local model files directly",
    description:
      "Point Milady at .gguf files you already have on disk for fully in-process local inference.",
    tier: "intermediate",
    order: 10,
    path: "/docs/intermediate/local-ai",
    component: lazy(() => import("./content/intermediate/local-ai.mdx")),
  },
  {
    slug: "connect-slack",
    title: "Connect to Slack",
    description:
      "Drop your agent into a Slack workspace using Socket Mode — no public webhook needed.",
    tier: "intermediate",
    order: 11,
    path: "/docs/intermediate/connect-slack",
    component: lazy(() => import("./content/intermediate/connect-slack.mdx")),
  },
  {
    slug: "connect-bluesky",
    title: "Connect to Bluesky",
    description:
      "Post to Bluesky and reply to mentions with an app password — five minutes start to finish.",
    tier: "intermediate",
    order: 12,
    path: "/docs/intermediate/connect-bluesky",
    component: lazy(() => import("./content/intermediate/connect-bluesky.mdx")),
  },
  {
    slug: "connect-nostr",
    title: "Connect to Nostr",
    description:
      "Use your Nostr keypair to post and reply across the decentralized relay network.",
    tier: "intermediate",
    order: 13,
    path: "/docs/intermediate/connect-nostr",
    component: lazy(() => import("./content/intermediate/connect-nostr.mdx")),
  },
  {
    slug: "connect-matrix",
    title: "Connect to Matrix",
    description:
      "Drop your agent into any Matrix homeserver — matrix.org, Element, or self-hosted.",
    tier: "intermediate",
    order: 14,
    path: "/docs/intermediate/connect-matrix",
    component: lazy(() => import("./content/intermediate/connect-matrix.mdx")),
  },
  {
    slug: "connect-mattermost",
    title: "Connect to Mattermost",
    description:
      "Create a Mattermost bot account, copy its token, and connect your self-hosted team chat.",
    tier: "intermediate",
    order: 15,
    path: "/docs/intermediate/connect-mattermost",
    component: lazy(
      () => import("./content/intermediate/connect-mattermost.mdx"),
    ),
  },
  {
    slug: "connect-msteams",
    title: "Connect to Microsoft Teams",
    description:
      "Register an Azure app, connect it to Bot Framework, and drop your agent into a Teams channel.",
    tier: "intermediate",
    order: 16,
    path: "/docs/intermediate/connect-msteams",
    component: lazy(() => import("./content/intermediate/connect-msteams.mdx")),
  },
  {
    slug: "connect-gmail-watch",
    title: "Connect to Gmail (Gmail Watch)",
    description:
      "Let your agent react to incoming email via Gmail API + Google Cloud Pub/Sub push notifications.",
    tier: "intermediate",
    order: 17,
    path: "/docs/intermediate/connect-gmail-watch",
    component: lazy(
      () => import("./content/intermediate/connect-gmail-watch.mdx"),
    ),
  },
  {
    slug: "connect-google-chat",
    title: "Connect to Google Chat",
    description:
      "Create a Google Chat app with a service account and add your agent to Workspace spaces.",
    tier: "intermediate",
    order: 18,
    path: "/docs/intermediate/connect-google-chat",
    component: lazy(
      () => import("./content/intermediate/connect-google-chat.mdx"),
    ),
  },
  {
    slug: "connect-instagram",
    title: "Connect to Instagram",
    description:
      "Respond to Instagram DMs via the unofficial API — with a clear-eyed look at the ban risk.",
    tier: "intermediate",
    order: 19,
    path: "/docs/intermediate/connect-instagram",
    component: lazy(
      () => import("./content/intermediate/connect-instagram.mdx"),
    ),
  },
  {
    slug: "connect-whatsapp",
    title: "Connect to WhatsApp",
    description:
      "Two paths: Meta's official Cloud API for business use, or Baileys for personal use at your own risk.",
    tier: "intermediate",
    order: 20,
    path: "/docs/intermediate/connect-whatsapp",
    component: lazy(
      () => import("./content/intermediate/connect-whatsapp.mdx"),
    ),
  },
  {
    slug: "connect-line",
    title: "Connect to LINE",
    description:
      "Create a LINE Messaging API channel and talk to users across Japan, Taiwan, and Thailand.",
    tier: "intermediate",
    order: 21,
    path: "/docs/intermediate/connect-line",
    component: lazy(() => import("./content/intermediate/connect-line.mdx")),
  },
  {
    slug: "connect-feishu",
    title: "Connect to Feishu / Lark",
    description:
      "Build a custom Feishu or Lark app and drop your agent into team chats and groups.",
    tier: "intermediate",
    order: 22,
    path: "/docs/intermediate/connect-feishu",
    component: lazy(() => import("./content/intermediate/connect-feishu.mdx")),
  },
  {
    slug: "connect-twitter",
    title: "Connect to Twitter / X",
    description:
      "Post to X, reply to mentions, and handle autonomous engagement — with clear eyes on the rate limits.",
    tier: "intermediate",
    order: 23,
    path: "/docs/intermediate/connect-twitter",
    component: lazy(() => import("./content/intermediate/connect-twitter.mdx")),
  },
  {
    slug: "connect-github",
    title: "Connect to GitHub",
    description:
      "Give your agent scoped access to a repo so it can read issues, comment, and open pull requests.",
    tier: "intermediate",
    order: 24,
    path: "/docs/intermediate/connect-github",
    component: lazy(() => import("./content/intermediate/connect-github.mdx")),
  },
  {
    slug: "connect-twitch",
    title: "Connect to Twitch",
    description:
      "Drop your agent into a Twitch channel as a proper chatbot with a dedicated bot account.",
    tier: "intermediate",
    order: 25,
    path: "/docs/intermediate/connect-twitch",
    component: lazy(() => import("./content/intermediate/connect-twitch.mdx")),
  },
  {
    slug: "connect-farcaster",
    title: "Connect to Farcaster",
    description:
      "Post and reply on Farcaster using a Warpcast account and a Neynar signer.",
    tier: "intermediate",
    order: 26,
    path: "/docs/intermediate/connect-farcaster",
    component: lazy(
      () => import("./content/intermediate/connect-farcaster.mdx"),
    ),
  },
  {
    slug: "connect-wechat",
    title: "Connect to WeChat",
    description:
      "Bridge a dedicated WeChat account through a proxy service for mainland China messaging.",
    tier: "intermediate",
    order: 27,
    path: "/docs/intermediate/connect-wechat",
    component: lazy(() => import("./content/intermediate/connect-wechat.mdx")),
  },
  {
    slug: "connect-zalo",
    title: "Connect to Zalo (Official Account)",
    description:
      "Use Zalo's official OA API to reach users across Vietnam — the ToS-compliant path.",
    tier: "intermediate",
    order: 28,
    path: "/docs/intermediate/connect-zalo",
    component: lazy(() => import("./content/intermediate/connect-zalo.mdx")),
  },
  {
    slug: "connect-zalouser",
    title: "Connect to Zalo (personal account)",
    description:
      "Bridge a personal Zalo account via an unofficial path. Read the warning first.",
    tier: "intermediate",
    order: 29,
    path: "/docs/intermediate/connect-zalouser",
    component: lazy(
      () => import("./content/intermediate/connect-zalouser.mdx"),
    ),
  },
  {
    slug: "connect-twilio",
    title: "Connect to Twilio (SMS + Voice)",
    description:
      "Give your agent a real phone number for texts and voice calls via Twilio.",
    tier: "intermediate",
    order: 30,
    path: "/docs/intermediate/connect-twilio",
    component: lazy(() => import("./content/intermediate/connect-twilio.mdx")),
  },
  {
    slug: "connect-signal",
    title: "Connect to Signal",
    description:
      "Run signal-cli-rest-api in Docker and bridge Signal through a local REST daemon.",
    tier: "intermediate",
    order: 31,
    path: "/docs/intermediate/connect-signal",
    component: lazy(() => import("./content/intermediate/connect-signal.mdx")),
  },
  {
    slug: "connect-nextcloud-talk",
    title: "Connect to Nextcloud Talk",
    description:
      "Register a bot via Nextcloud's occ CLI and drop your agent into Nextcloud Talk rooms.",
    tier: "intermediate",
    order: 32,
    path: "/docs/intermediate/connect-nextcloud-talk",
    component: lazy(
      () => import("./content/intermediate/connect-nextcloud-talk.mdx"),
    ),
  },
  {
    slug: "connect-imessage",
    title: "Connect to iMessage (macOS native)",
    description:
      "Read chat.db directly on a Mac running iMessage, no bridge or external server.",
    tier: "intermediate",
    order: 33,
    path: "/docs/intermediate/connect-imessage",
    component: lazy(
      () => import("./content/intermediate/connect-imessage.mdx"),
    ),
  },
  {
    slug: "connect-blooio",
    title: "Connect to Blooio",
    description:
      "Use Blooio's API to send SMS/iMessage from a real number without running your own server.",
    tier: "intermediate",
    order: 34,
    path: "/docs/intermediate/connect-blooio",
    component: lazy(() => import("./content/intermediate/connect-blooio.mdx")),
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
  {
    slug: "connect-mcp",
    title: "Connect MCP servers",
    description:
      "Give your agent access to external tools, files, and APIs via the Model Context Protocol.",
    tier: "advanced",
    order: 6,
    path: "/docs/advanced/connect-mcp",
    component: lazy(() => import("./content/advanced/connect-mcp.mdx")),
  },
  {
    slug: "connect-iq-solana",
    title: "Connect to IQ (Solana on-chain)",
    description:
      "Post and read on-chain chat messages on Solana for crypto-native agent networks.",
    tier: "advanced",
    order: 7,
    path: "/docs/advanced/connect-iq-solana",
    component: lazy(() => import("./content/advanced/connect-iq-solana.mdx")),
  },
  {
    slug: "connect-tlon",
    title: "Connect to Tlon (Urbit)",
    description:
      "Bridge your agent into Tlon channels if you run an Urbit ship.",
    tier: "advanced",
    order: 8,
    path: "/docs/advanced/connect-tlon",
    component: lazy(() => import("./content/advanced/connect-tlon.mdx")),
  },
  {
    slug: "connect-acp",
    title: "Connect ACP (Agent Communication Protocol)",
    description:
      "Wire your agent to talk to other agents over a shared gateway. For multi-agent developers only.",
    tier: "advanced",
    order: 9,
    path: "/docs/advanced/connect-acp",
    component: lazy(() => import("./content/advanced/connect-acp.mdx")),
  },
  {
    slug: "stream-twitch",
    title: "Stream to Twitch",
    description:
      "Push your agent's video stream to Twitch with a stream key from the Creator Dashboard.",
    tier: "advanced",
    order: 10,
    path: "/docs/advanced/stream-twitch",
    component: lazy(() => import("./content/advanced/stream-twitch.mdx")),
  },
  {
    slug: "stream-youtube",
    title: "Stream to YouTube Live",
    description:
      "Enable live streaming on YouTube, copy your stream key, and broadcast from Milady.",
    tier: "advanced",
    order: 11,
    path: "/docs/advanced/stream-youtube",
    component: lazy(() => import("./content/advanced/stream-youtube.mdx")),
  },
  {
    slug: "stream-custom-rtmp",
    title: "Stream to a custom RTMP destination",
    description:
      "Facebook Live, TikTok, Kick, or any self-hosted RTMP server — point Milady at any ingest URL.",
    tier: "advanced",
    order: 12,
    path: "/docs/advanced/stream-custom-rtmp",
    component: lazy(() => import("./content/advanced/stream-custom-rtmp.mdx")),
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
