import { logger } from "@elizaos/core";
import { packageNameToAppDisplayName } from "@miladyai/shared/contracts/apps";
import type {
  AppUiExtensionConfig,
  RegistryAppMeta,
  RegistryAppSessionMeta,
  RegistryAppViewerMeta,
} from "./registry-client-types.js";

export const LOCAL_APP_DEFAULT_SANDBOX =
  "allow-scripts allow-same-origin allow-popups";

const ALLOWED_SANDBOX_TOKENS = new Set([
  "allow-downloads",
  "allow-forms",
  "allow-modals",
  "allow-orientation-lock",
  "allow-pointer-lock",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-presentation",
  "allow-same-origin",
  "allow-scripts",
  "allow-storage-access-by-user-activation",
  "allow-top-navigation-by-user-activation",
]);

interface LocalAppOverride {
  displayName?: string;
  category?: string;
  launchType?: string;
  launchUrl?: string | null;
  capabilities?: string[];
  runtimePlugin?: string;
  uiExtension?: AppUiExtensionConfig;
  viewer?: RegistryAppViewerMeta;
  session?: RegistryAppSessionMeta;
}

const LOCAL_APP_OVERRIDES: Readonly<Record<string, LocalAppOverride>> = {
  "@elizaos/app-babylon": {
    launchType: "url",
    launchUrl: "http://localhost:3000",
    uiExtension: {
      detailPanelId: "babylon-operator-dashboard",
    },
    viewer: {
      url: "http://localhost:3000",
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
  },
  "@elizaos/app-hyperscape": {
    displayName: "Hyperscape",
    category: "game",
    launchType: "connect",
    launchUrl: "{HYPERSCAPE_CLIENT_URL}",
    capabilities: ["combat"],
    runtimePlugin: "@hyperscape/plugin-hyperscape",
    uiExtension: {
      detailPanelId: "hyperscape-embedded-agent-control",
    },
    viewer: {
      url: "{HYPERSCAPE_CLIENT_URL}",
      embedParams: {
        embedded: "true",
        mode: "spectator",
        surface: "agent-control",
        followEntity: "{HYPERSCAPE_CHARACTER_ID}",
      },
      postMessageAuth: true,
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
    session: {
      mode: "spectate-and-steer",
      features: ["commands", "telemetry", "pause", "resume", "suggestions"],
    },
  },
  "@elizaos/app-hyperfy": {
    launchType: "connect",
    launchUrl: "http://localhost:3003",
    viewer: {
      url: "http://localhost:3003",
      sandbox: LOCAL_APP_DEFAULT_SANDBOX,
    },
  },
  "@elizaos/app-2004scape": {
    launchType: "connect",
    launchUrl: "{RS_SDK_SERVER_URL}",
    uiExtension: {
      detailPanelId: "2004scape-operator-dashboard",
    },
    viewer: {
      url: "{RS_SDK_SERVER_URL}/bot",
      embedParams: {
        bot: "{RS_SDK_BOT_NAME}",
        password: "{RS_SDK_BOT_PASSWORD}",
      },
      postMessageAuth: true,
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
    session: {
      mode: "spectate-and-steer",
      features: ["commands", "telemetry", "pause", "resume", "suggestions"],
    },
  },
  "@elizaos/app-defense-of-the-agents": {
    uiExtension: {
      detailPanelId: "defense-agent-control",
    },
  },
};

export function sanitizeSandbox(rawSandbox?: string): string {
  if (!rawSandbox?.trim()) {
    return LOCAL_APP_DEFAULT_SANDBOX;
  }

  const tokens = rawSandbox
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return LOCAL_APP_DEFAULT_SANDBOX;
  }

  for (const token of tokens) {
    if (!ALLOWED_SANDBOX_TOKENS.has(token)) {
      logger.warn(
        `[registry-client] rejecting untrusted sandbox token: ${token}`,
      );
      return LOCAL_APP_DEFAULT_SANDBOX;
    }
  }

  return Array.from(new Set(tokens)).join(" ");
}

function normalizeViewer(
  viewer: RegistryAppViewerMeta | undefined,
): RegistryAppViewerMeta | undefined {
  if (!viewer) return undefined;
  return {
    ...viewer,
    sandbox: sanitizeSandbox(viewer.sandbox),
  };
}

function mergeViewer(
  base: RegistryAppViewerMeta | undefined,
  patch: RegistryAppViewerMeta | undefined,
): RegistryAppViewerMeta | undefined {
  if (!base && !patch) return undefined;
  if (!base) return normalizeViewer(patch);
  if (!patch) return normalizeViewer(base);
  return normalizeViewer({
    ...base,
    ...patch,
    embedParams: {
      ...(base.embedParams ?? {}),
      ...(patch.embedParams ?? {}),
    },
  });
}

function mergeSession(
  base: RegistryAppSessionMeta | undefined,
  patch: RegistryAppSessionMeta | undefined,
): RegistryAppSessionMeta | undefined {
  if (!base && !patch) return undefined;
  if (!base) return patch;
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    features:
      patch.features && patch.features.length > 0
        ? patch.features
        : base.features,
  };
}

export function mergeAppMeta(
  base: RegistryAppMeta | undefined,
  patch: RegistryAppMeta | undefined,
): RegistryAppMeta | undefined {
  if (!base && !patch) return undefined;
  if (!base) return patch;
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    capabilities:
      patch.capabilities.length > 0 ? patch.capabilities : base.capabilities,
    runtimePlugin: patch.runtimePlugin ?? base.runtimePlugin,
    uiExtension: patch.uiExtension ?? base.uiExtension,
    viewer: mergeViewer(base.viewer, patch.viewer),
    session: mergeSession(base.session, patch.session),
  };
}

export function resolveAppOverride(
  packageName: string,
  appMeta: RegistryAppMeta | undefined,
): RegistryAppMeta | undefined {
  const override = LOCAL_APP_OVERRIDES[packageName];
  if (!override) return appMeta;
  const base: RegistryAppMeta = appMeta ?? {
    displayName:
      override.displayName ?? packageNameToAppDisplayName(packageName),
    category: override.category ?? "game",
    launchType: override.launchType ?? "url",
    launchUrl: override.launchUrl ?? null,
    icon: null,
    capabilities: override.capabilities ?? [],
    minPlayers: null,
    maxPlayers: null,
    runtimePlugin: override.runtimePlugin,
    uiExtension: override.uiExtension,
    viewer: override.viewer,
    session: override.session,
  };
  return {
    ...base,
    displayName: override.displayName ?? base.displayName,
    category: override.category ?? base.category,
    launchType: override.launchType ?? base.launchType,
    launchUrl:
      override.launchUrl !== undefined ? override.launchUrl : base.launchUrl,
    capabilities:
      override.capabilities !== undefined
        ? override.capabilities
        : base.capabilities,
    runtimePlugin: override.runtimePlugin ?? base.runtimePlugin,
    uiExtension: override.uiExtension ?? base.uiExtension,
    viewer: mergeViewer(base.viewer, override.viewer),
    session: mergeSession(base.session, override.session),
  };
}
