import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger } from "@elizaos/core";
import {
  getEnvApiKey,
  getModels,
  getOAuthApiKey,
  getProviders,
  type OAuthCredentials,
} from "@mariozechner/pi-ai";

interface PiAuthApiKeyEntry {
  type: "api_key";
  key: string;
}

interface PiAuthOAuthEntry {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
}

type PiAuthEntry = PiAuthApiKeyEntry | PiAuthOAuthEntry;

type PiAuthFile = Record<string, PiAuthEntry>;

interface PiSettingsFile {
  defaultProvider?: string;
  defaultModel?: string;
}

function resolvePiAgentDir(overrideDir?: string): string {
  const normalizedOverride = overrideDir?.trim();
  if (normalizedOverride) {
    return normalizedOverride;
  }

  return (
    process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent")
  );
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno?.code === "ENOENT") {
      return null;
    }

    logger.warn(
      `pi-ai: failed to parse ${path.basename(filePath)} (${error instanceof Error ? error.message : String(error)})`,
    );
    return null;
  }
}

export interface PiCredentialProvider {
  hasCredentials(provider: string): boolean;
  getApiKey(provider: string): Promise<string | undefined>;
  getDefaultModelSpec(): Promise<string | undefined>;
}

export interface PiAiModelOption {
  id: string;
  name: string;
  provider: string;
  isDefault: boolean;
}

export async function createPiCredentialProvider(
  overrideAgentDir?: string,
): Promise<PiCredentialProvider> {
  const agentDir = resolvePiAgentDir(overrideAgentDir);
  const authPath = path.join(agentDir, "auth.json");
  const settingsPath = path.join(agentDir, "settings.json");

  const auth = (await readJsonFile<PiAuthFile>(authPath)) ?? {};
  const settings = (await readJsonFile<PiSettingsFile>(settingsPath)) ?? {};

  const oauthCreds: Record<string, OAuthCredentials> = {};

  for (const [provider, entry] of Object.entries(auth)) {
    if (entry.type === "oauth") {
      oauthCreds[provider] = {
        access: entry.access,
        refresh: entry.refresh,
        expires: entry.expires,
      };
    }
  }

  return {
    hasCredentials: (provider: string) => {
      if (getEnvApiKey(provider)) return true;
      return provider in auth;
    },

    getApiKey: async (provider: string) => {
      const envKey = getEnvApiKey(provider);
      if (envKey) return envKey;

      const entry = auth[provider];
      if (!entry) return undefined;

      if (entry.type === "api_key") {
        return entry.key;
      }

      try {
        const res = await getOAuthApiKey(provider, oauthCreds);
        if (!res) return undefined;

        oauthCreds[provider] = res.newCredentials;
        return res.apiKey;
      } catch (error) {
        logger.warn(
          `pi-ai: oauth refresh failed for ${provider}; refusing stale cached token (${error instanceof Error ? error.message : String(error)})`,
        );
        return undefined;
      }
    },

    getDefaultModelSpec: async () => {
      const provider = settings.defaultProvider;
      const model = settings.defaultModel;
      if (!provider || !model) return undefined;
      return `${provider}/${model}`;
    },
  };
}

export async function listPiAiModelOptions(overrideAgentDir?: string): Promise<{
  defaultModelSpec: string | undefined;
  models: PiAiModelOption[];
}> {
  const provider = await createPiCredentialProvider(overrideAgentDir);
  const defaultModelSpec = await provider.getDefaultModelSpec();

  const models: PiAiModelOption[] = [];

  for (const providerId of getProviders()) {
    if (!provider.hasCredentials(providerId)) continue;

    for (const model of getModels(providerId)) {
      const modelSpec = `${providerId}/${model.id}`;
      models.push({
        id: modelSpec,
        name: model.name,
        provider: providerId,
        isDefault: modelSpec === defaultModelSpec,
      });
    }
  }

  models.sort((a, b) => {
    if (a.isDefault !== b.isDefault) {
      return a.isDefault ? -1 : 1;
    }
    if (a.provider !== b.provider) {
      return a.provider.localeCompare(b.provider);
    }
    return a.name.localeCompare(b.name);
  });

  return { defaultModelSpec, models };
}
