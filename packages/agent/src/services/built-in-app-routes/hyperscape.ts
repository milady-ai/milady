import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import type {
  AppLaunchDiagnostic,
  AppLaunchPreparation,
  AppSessionState,
} from "@miladyai/shared/contracts/apps";
import type {
  AppRouteModule,
  AppRunSessionContext,
} from "../app-package-modules.js";

const HYPERSCAPE_APP_NAME = "@hyperscape/plugin-hyperscape";
const DEFAULT_HYPERSCAPE_URL = "https://hyperscape.gg";

function resolveSettingLike(
  runtime: IAgentRuntime | null | undefined,
  key: string,
): string | undefined {
  const fromRuntime = runtime?.getSetting?.(key);
  if (typeof fromRuntime === "string" && fromRuntime.trim().length > 0) {
    return fromRuntime.trim();
  }
  const fromEnv = process.env[key];
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return undefined;
}

function resolveStateDir(): string {
  return (
    process.env.MILADY_STATE_DIR?.trim() ||
    process.env.ELIZA_STATE_DIR?.trim() ||
    path.join(process.env.HOME ?? ".", ".milady")
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deriveServerApiUrl(clientUrl: string | undefined): string {
  // Client runs on :3333, server (Fastify HTTP API) runs on :5555.
  // Accept either HYPERSCAPE_SERVER_URL or derive from the client URL.
  if (!clientUrl) return "http://localhost:5555";
  try {
    const u = new URL(clientUrl);
    if (u.port === "3333") u.port = "5555";
    return `${u.protocol}//${u.host}`;
  } catch {
    return "http://localhost:5555";
  }
}

async function createCharacterInHyperscape(
  apiBase: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${apiBase}/api/characters/db`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: "milady-dev-account",
        name: "MiladyDev",
        isAgent: true,
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      success?: boolean;
      character?: { id?: string };
    };
    const id = body?.character?.id;
    return typeof id === "string" && UUID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

async function getOrCreateDevCharacterId(
  apiBase: string,
): Promise<string> {
  const file = path.join(resolveStateDir(), "apps", "hyperscape-dev-character.txt");
  try {
    const existing = (await fs.readFile(file, "utf-8")).trim();
    if (UUID_RE.test(existing)) return existing;
  } catch {
    // missing — fall through to create
  }
  const created = await createCharacterInHyperscape(apiBase);
  const id = created ?? randomUUID();
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, id, "utf-8");
  } catch {
    // best-effort persistence; id is still usable for this session
  }
  return id;
}

export const prepareLaunch: AppRouteModule["prepareLaunch"] = async (ctx) => {
  const { runtime } = ctx;
  const serverUrl = resolveSettingLike(runtime, "HYPERSCAPE_SERVER_URL");
  const authToken = resolveSettingLike(runtime, "HYPERSCAPE_AUTH_TOKEN");
  const explicitCharacterId = resolveSettingLike(
    runtime,
    "HYPERSCAPE_CHARACTER_ID",
  );

  const preparation: AppLaunchPreparation = {};

  if (serverUrl) {
    preparation.launchUrl = serverUrl;
  }

  const viewerUrl = serverUrl ?? DEFAULT_HYPERSCAPE_URL;
  if (authToken && explicitCharacterId) {
    preparation.viewer = {
      url: viewerUrl,
      postMessageAuth: true,
      embedParams: { characterId: explicitCharacterId },
    };
    return preparation;
  }

  const apiBase = deriveServerApiUrl(serverUrl);
  const characterId =
    explicitCharacterId ?? (await getOrCreateDevCharacterId(apiBase));
  preparation.viewer = {
    url: viewerUrl,
    embedParams: { characterId },
  };
  return preparation;
};

export const collectLaunchDiagnostics: AppRouteModule["collectLaunchDiagnostics"] =
  async (ctx) => {
    const { runtime } = ctx;
    const diagnostics: AppLaunchDiagnostic[] = [];

    const serverUrl = resolveSettingLike(runtime, "HYPERSCAPE_SERVER_URL");
    if (!serverUrl) {
      diagnostics.push({
        code: "hyperscape-no-server-url",
        severity: "warning",
        message:
          "HYPERSCAPE_SERVER_URL is not set. The app will use the default production URL.",
      });
    }

    const authToken = resolveSettingLike(runtime, "HYPERSCAPE_AUTH_TOKEN");
    if (!authToken) {
      diagnostics.push({
        code: "hyperscape-no-auth-token",
        severity: "warning",
        message:
          "HYPERSCAPE_AUTH_TOKEN is not set. The agent will not be able to authenticate with the game server.",
      });
    }

    const characterId = resolveSettingLike(runtime, "HYPERSCAPE_CHARACTER_ID");
    if (!characterId) {
      diagnostics.push({
        code: "hyperscape-no-character-id",
        severity: "warning",
        message:
          "HYPERSCAPE_CHARACTER_ID is not set. The agent will not have a game character identity.",
      });
    }

    return diagnostics;
  };

export const resolveLaunchSession: AppRouteModule["resolveLaunchSession"] =
  async (ctx) => {
    const { runtime } = ctx;
    const serverUrl =
      resolveSettingLike(runtime, "HYPERSCAPE_SERVER_URL") ??
      DEFAULT_HYPERSCAPE_URL;
    const authToken = resolveSettingLike(runtime, "HYPERSCAPE_AUTH_TOKEN");
    const characterId = resolveSettingLike(runtime, "HYPERSCAPE_CHARACTER_ID");

    const session: AppSessionState = {
      sessionId: characterId ?? runtime?.agentId ?? HYPERSCAPE_APP_NAME,
      appName: HYPERSCAPE_APP_NAME,
      mode: "viewer",
      status: authToken ? "running" : "connecting",
      characterId,
      summary: authToken
        ? `Connected to Hyperscape at ${serverUrl}`
        : "Waiting for HYPERSCAPE_AUTH_TOKEN to authenticate.",
      telemetry: {
        serverUrl,
        hasAuth: Boolean(authToken),
      },
    };

    return session;
  };
