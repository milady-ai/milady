/**
 * Navigation — tabs + onboarding.
 */

import type { LucideIcon } from "lucide-react";
import {
  Brain,
  Clock3,
  Gamepad2,
  ListTodo,
  MessageSquare,
  Monitor,
  PencilLine,
  Radio,
  Settings,
  Share2,
  Sparkles,
  Wallet,
} from "lucide-react";
import { DEFAULT_BRANDING } from "../config/branding";

/** Apps are enabled by default; opt-out via VITE_ENABLE_APPS=false. */
export const APPS_ENABLED =
  String(import.meta.env.VITE_ENABLE_APPS ?? "true").toLowerCase() !== "false";

/** Stream routes stay addressable; the nav hides the tab unless streaming is enabled. */
export const STREAM_ENABLED = true;
/** Companion tab — enabled by default; opt-out via VITE_ENABLE_COMPANION_MODE=false. */
export const COMPANION_ENABLED =
  String(import.meta.env.VITE_ENABLE_COMPANION_MODE ?? "true").toLowerCase() !==
  "false";

export type Tab =
  | "chat"
  | "lifeops"
  | "browser"
  | "companion"
  | "stream"
  | "apps"
  | "character"
  | "character-select"
  | "wallets"
  | "knowledge"
  | "connectors"
  | "triggers"
  | "plugins"
  | "skills"
  | "advanced"
  | "fine-tuning"
  | "trajectories"
  | "relationships"
  | "memories"
  | "rolodex"
  | "voice"
  | "runtime"
  | "database"
  | "desktop"
  | "settings"
  | "logs";

export interface TabGroup {
  label: string;
  tabs: Tab[];
  icon: LucideIcon;
  description?: string;
}

export const ALL_TAB_GROUPS: TabGroup[] = [
  {
    label: "Chat",
    tabs: ["chat"],
    icon: MessageSquare,
    description:
      "Conversations with your agent and inbound messages from every connector",
  },
  {
    label: "LifeOps",
    tabs: ["lifeops"],
    icon: ListTodo,
    description:
      "Tasks, goals, reminders, calendar, inbox, and connected operational accounts",
  },
  {
    label: "Browser",
    tabs: ["browser"],
    icon: Monitor,
    description: "Agent-controlled browser workspace",
  },
  {
    label: "Stream",
    tabs: ["stream"],
    icon: Radio,
    description: "Live streaming controls",
  },
  {
    label: "Wallets",
    tabs: ["wallets"],
    icon: Wallet,
    description: "Crypto wallets and inventory",
  },
  {
    label: "Knowledge",
    tabs: ["knowledge"],
    icon: Brain,
    description: "Documents and memory",
  },
  {
    label: "Connectors",
    tabs: ["connectors"],
    icon: Share2,
    description: "Service and data source connections",
  },
  {
    label: "Character",
    tabs: ["character", "character-select"],
    icon: PencilLine,
    description: "Avatar identity and customization",
  },
  {
    label: "Apps",
    tabs: ["apps"],
    icon: Gamepad2,
    description: "Games and integrations",
  },
  {
    label: "Settings",
    tabs: ["settings"],
    icon: Settings,
    description: "Configuration and preferences",
  },
  {
    label: "Heartbeats",
    tabs: ["triggers"],
    icon: Clock3,
    description: "Scheduled autonomous automations",
  },

  {
    label: "Advanced",
    tabs: [
      "advanced",
      "plugins",
      "skills",
      "fine-tuning",
      "trajectories",
      "relationships",
      "memories",
      "rolodex",
      "runtime",
      "database",
      "logs",
    ],
    icon: Sparkles,
    description: "Developer and power user tools",
  },
];

/** Compute visible tab groups. Pass streamEnabled explicitly for React reactivity. */
export function getTabGroups(streamEnabled = STREAM_ENABLED): TabGroup[] {
  return ALL_TAB_GROUPS.filter(
    (g) =>
      (APPS_ENABLED || g.label !== "Apps") &&
      (streamEnabled || g.label !== "Stream"),
  );
}

const TAB_PATHS: Record<Tab, string> = {
  chat: "/chat",
  lifeops: "/lifeops",
  browser: "/browser",
  companion: "/companion",
  stream: "/stream",
  apps: "/apps",
  character: "/character",
  "character-select": "/character-select",
  triggers: "/triggers",
  wallets: "/wallets",
  knowledge: "/knowledge",
  connectors: "/connectors",
  plugins: "/plugins",
  skills: "/skills",
  advanced: "/advanced",
  "fine-tuning": "/fine-tuning",
  trajectories: "/trajectories",
  relationships: "/relationships",
  memories: "/memories",
  rolodex: "/rolodex",
  voice: "/voice",
  runtime: "/runtime",
  database: "/database",
  desktop: "/desktop",
  settings: "/settings",
  logs: "/logs",
};

/** Legacy path redirects — old paths that now map to new tabs. */
const LEGACY_PATHS: Record<string, Tab> = {
  "/game": "apps",
  "/agent": "character",
  "/inventory": "wallets",
  "/features": "plugins",
  "/admin": "advanced",
  "/config": "settings",
  "/triggers": "triggers",
};

const PATH_TO_TAB = new Map(
  Object.entries(TAB_PATHS).map(([tab, p]) => [p, tab as Tab]),
);

function normalizePathForLookup(pathname: string, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  let p = pathname || "/";
  if (base) {
    if (p === base) p = "/";
    else if (p.startsWith(`${base}/`)) p = p.slice(base.length);
  }
  let normalized = normalizePath(p).toLowerCase();
  if (normalized.endsWith("/index.html")) normalized = "/";
  return normalized;
}

export function pathForTab(tab: Tab, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  const p = TAB_PATHS[tab];
  return base ? `${base}${p}` : p;
}

export function isRouteRootPath(pathname: string, basePath = ""): boolean {
  return normalizePathForLookup(pathname, basePath) === "/";
}

export function resolveInitialTabForPath(
  pathname: string,
  fallbackTab: Tab,
  basePath = "",
): Tab {
  if (isRouteRootPath(pathname, basePath)) {
    return fallbackTab;
  }
  return tabFromPath(pathname, basePath) ?? fallbackTab;
}

export function tabFromPath(pathname: string, basePath = ""): Tab | null {
  const normalized = normalizePathForLookup(pathname, basePath);
  if (normalized === "/") return "chat";
  if (normalized === "/browser") return "browser";
  if (normalized === "/voice") return "settings";
  // Companion disabled unless explicitly feature-flagged
  if (
    !COMPANION_ENABLED &&
    (normalized === "/companion" || normalized === "/character-select")
  ) {
    return "chat";
  }
  // Apps disabled in production builds — redirect to chat
  if (!APPS_ENABLED && (normalized === "/apps" || normalized === "/game")) {
    return "chat";
  }
  // Stream tab (always enabled)
  // Check current paths first, then legacy redirects
  return PATH_TO_TAB.get(normalized) ?? LEGACY_PATHS[normalized] ?? null;
}

function normalizeBasePath(basePath: string): string {
  if (!basePath) return "";
  let base = basePath.trim();
  if (!base.startsWith("/")) base = `/${base}`;
  if (base === "/") return "";
  if (base.endsWith("/")) base = base.slice(0, -1);
  return base;
}

function normalizePath(p: string): string {
  if (!p) return "/";
  let normalized = p.trim();
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  if (normalized.length > 1 && normalized.endsWith("/"))
    normalized = normalized.slice(0, -1);
  return normalized;
}

export function titleForTab(tab: Tab): string {
  switch (tab) {
    case "chat":
      return "Chat";
    case "lifeops":
      return "LifeOps";
    case "browser":
      return "Browser";
    case "companion":
      return "Companion";
    case "apps":
      return "Apps";
    case "character":
      return "Character";
    case "character-select":
      return "Character Select";
    case "triggers":
      return "Heartbeats";
    case "wallets":
      return "Wallets";
    case "knowledge":
      return "Knowledge";
    case "connectors":
      return "Connectors";
    case "plugins":
      return "Plugins";
    case "skills":
      return "Skills";
    case "advanced":
      return "Advanced";
    case "fine-tuning":
      return "Fine-Tuning";
    case "trajectories":
      return "Trajectories";
    case "relationships":
      return "Relationships";
    case "memories":
      return "Memories";
    case "rolodex":
      return "Rolodex";
    case "voice":
      return "Voice";
    case "runtime":
      return "Runtime";
    case "database":
      return "Databases";
    case "settings":
      return "Settings";
    case "logs":
      return "Logs";
    case "stream":
      return "Stream";
    default:
      return DEFAULT_BRANDING.appName;
  }
}
