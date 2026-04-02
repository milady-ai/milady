import type http from "node:http";
import { logger, stringToUuid, type UUID } from "@elizaos/core";
import type { ElizaConfig } from "../config/config.js";
import { configFileExists, loadElizaConfig } from "../config/config.js";
import {
  migrateLegacyRuntimeConfig,
  normalizePersistedOnboardingConnection,
  normalizeOnboardingProviderId,
} from "../contracts/onboarding.js";
import {
  normalizeDeploymentTargetConfig,
  normalizeLinkedAccountsConfig,
  normalizeServiceRoutingConfig,
} from "../contracts/service-routing.js";
import {
  applyCanonicalOnboardingConfig,
  applyOnboardingConnectionConfig,
  reconcilePersistedOnboardingConnection,
} from "./provider-switch-config.js";
import { resolveDefaultAgentWorkspaceDir } from "../providers/workspace.js";
import type { ReadJsonBodyOptions } from "./http-helpers.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnboardingRouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  url: URL;
  state: OnboardingServerState;
  json: (res: http.ServerResponse, data: unknown, status?: number) => void;
  error: (res: http.ServerResponse, message: string, status?: number) => void;
  readJsonBody: <T extends object>(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    options?: ReadJsonBodyOptions,
  ) => Promise<T | null>;
  // Server.ts helpers
  isCloudProvisionedContainer: () => boolean;
  hasPersistedOnboardingState: (config: ElizaConfig) => boolean;
  ensureWalletKeysInEnvAndConfig: (config: ElizaConfig) => boolean;
  getWalletAddresses: () => {
    evmAddress?: string;
    solanaAddress?: string;
  };
  pickRandomNames: (count: number) => string[];
  getStylePresets: (lang: string) => unknown[];
  getProviderOptions: () => unknown[];
  getCloudProviderOptions: () => unknown[];
  getModelOptions: () => unknown;
  getInventoryProviderOptions: () => unknown[];
  resolveConfiguredCharacterLanguage: (
    config: ElizaConfig,
    req: http.IncomingMessage,
  ) => string;
  normalizeCharacterLanguage: (lang: string | undefined) => string;
  readUiLanguageHeader: (req: http.IncomingMessage) => string | null;
  applyOnboardingVoicePreset: (
    config: ElizaConfig,
    body: Record<string, unknown>,
    language: string,
  ) => void;
  saveElizaConfig: (config: ElizaConfig) => void;
  loadPiAiPluginModule: () => Promise<{
    listPiAiModelOptions: () => Promise<{
      models: Array<{
        id: string;
        name: string;
        provider: string;
        isDefault: boolean;
      }>;
      defaultModelSpec?: string;
    }>;
  }>;
}

export interface OnboardingServerState {
  config: ElizaConfig;
  runtime: {
    agentId: string;
    character: Record<string, unknown> & { name: string };
    updateAgent: (...args: unknown[]) => Promise<unknown>;
  } | null;
  agentName: string;
  adminEntityId: UUID | null;
  chatUserId: UUID | null;
  chatConnectionReady: unknown;
  chatConnectionPromise: Promise<void> | null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function handleOnboardingRoutes(
  ctx: OnboardingRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, state, json, error, readJsonBody } = ctx;

  // ── GET /api/onboarding/status ──────────────────────────────────────
  if (method === "GET" && pathname === "/api/onboarding/status") {
    if (ctx.isCloudProvisionedContainer()) {
      json(res, { complete: true });
      return true;
    }

    let config = state.config;
    let complete =
      configFileExists() && ctx.hasPersistedOnboardingState(config);

    if (!complete && configFileExists()) {
      try {
        config = loadElizaConfig();
        complete = ctx.hasPersistedOnboardingState(config);
        if (complete) {
          state.config = config;
        }
      } catch (err) {
        logger.warn(
          `[eliza-api] Failed to refresh config for onboarding status: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    json(res, { complete });
    return true;
  }

  // ── GET /api/wallet/keys (onboarding only) ─────────────────────────
  if (method === "GET" && pathname === "/api/wallet/keys") {
    if (ctx.hasPersistedOnboardingState(state.config)) {
      json(
        res,
        { error: "Wallet keys are only available during onboarding" },
        403,
      );
      return true;
    }

    logger.warn(
      `[eliza-api] Wallet keys requested during onboarding (ip=${req.socket?.remoteAddress ?? "unknown"})`,
    );

    ctx.ensureWalletKeysInEnvAndConfig(state.config);
    try {
      ctx.saveElizaConfig(state.config);
    } catch {
      // Non-fatal
    }

    const evmPrivateKey = process.env.EVM_PRIVATE_KEY ?? "";
    const solanaPrivateKey = process.env.SOLANA_PRIVATE_KEY ?? "";
    const addresses = ctx.getWalletAddresses();

    const maskKey = (key: string): string => {
      if (!key || key.length <= 4) return key ? "****" : "";
      return "****" + key.slice(-4);
    };

    json(res, {
      evmPrivateKey: maskKey(evmPrivateKey),
      evmAddress: addresses.evmAddress ?? "",
      solanaPrivateKey: maskKey(solanaPrivateKey),
      solanaAddress: addresses.solanaAddress ?? "",
    });
    return true;
  }

  // ── GET /api/onboarding/options ─────────────────────────────────────
  if (method === "GET" && pathname === "/api/onboarding/options") {
    let piAiModels: Array<{
      id: string;
      name: string;
      provider: string;
      isDefault: boolean;
    }> = [];
    let piAiDefaultModel: string | null = null;

    try {
      const piAi = await (await ctx.loadPiAiPluginModule()).listPiAiModelOptions();
      piAiModels = piAi.models;
      piAiDefaultModel = piAi.defaultModelSpec ?? null;
    } catch (err) {
      logger.warn(
        `[api] Failed to load pi-ai model options: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    json(res, {
      names: ctx.pickRandomNames(5),
      styles: ctx.getStylePresets(
        ctx.resolveConfiguredCharacterLanguage(state.config, req),
      ),
      providers: ctx.getProviderOptions(),
      cloudProviders: ctx.getCloudProviderOptions(),
      models: ctx.getModelOptions(),
      piAiModels,
      piAiDefaultModel,
      inventoryProviders: ctx.getInventoryProviderOptions(),
      sharedStyleRules: "Keep responses brief. Be helpful and concise.",
      githubOAuthAvailable: Boolean(process.env.GITHUB_OAUTH_CLIENT_ID?.trim()),
    });
    return true;
  }

  // ── POST /api/onboarding ────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/onboarding") {
    const body = await readJsonBody<Record<string, unknown>>(req, res);
    if (!body) return true;

    // ── Validate required fields ──────────────────────────────────────────
    if (!body.name || typeof body.name !== "string" || !(body.name as string).trim()) {
      error(res, "Missing or invalid agent name", 400);
      return true;
    }
    if (body.runMode && body.runMode !== "local" && body.runMode !== "cloud") {
      error(res, "Invalid runMode: must be 'local' or 'cloud'", 400);
      return true;
    }

    const config = state.config;
    const configuredLanguage = ctx.normalizeCharacterLanguage(
      (body.language as string | undefined) ??
        ctx.readUiLanguageHeader(req) ??
        config.ui?.language,
    );

    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    config.agents.defaults.workspace = resolveDefaultAgentWorkspaceDir();
    const onboardingAdminEntityId = stringToUuid(
      `${(body.name as string).trim()}-admin-entity`,
    ) as UUID;
    config.agents.defaults.adminEntityId = onboardingAdminEntityId;
    state.adminEntityId = onboardingAdminEntityId;
    state.chatUserId = onboardingAdminEntityId;
    state.chatConnectionReady = null;
    state.chatConnectionPromise = null;

    if (!config.agents.list) config.agents.list = [];
    if (config.agents.list.length === 0) {
      config.agents.list.push({ id: "main", default: true });
    }
    const agent = config.agents.list[0] as Record<string, unknown>;
    agent.name = (body.name as string).trim();
    agent.workspace = resolveDefaultAgentWorkspaceDir();
    let normalizedMessageExamples:
      | Array<{
          examples: { name: string; content: { text: string } }[];
        }>
      | undefined;
    if (body.bio) agent.bio = body.bio as string[];
    if (body.systemPrompt) agent.system = body.systemPrompt as string;
    if (body.style)
      agent.style = body.style as {
        all?: string[];
        chat?: string[];
        post?: string[];
      };
    if (body.adjectives) agent.adjectives = body.adjectives as string[];
    if (body.topics) {
      agent.topics = body.topics as string[];
    }
    if (body.postExamples) agent.postExamples = body.postExamples as string[];
    if (body.messageExamples) {
      const raw = body.messageExamples as unknown[];
      normalizedMessageExamples = raw.map((item) => {
        if (
          item &&
          typeof item === "object" &&
          "examples" in (item as Record<string, unknown>)
        ) {
          return item as {
            examples: { name: string; content: { text: string } }[];
          };
        }
        const arr = item as {
          user?: string;
          name?: string;
          content: { text: string };
        }[];
        return {
          examples: arr.map((m) => ({
            name: m.name ?? m.user ?? "",
            content: m.content,
          })),
        };
      });
      agent.messageExamples = normalizedMessageExamples;
    }

    if (!config.ui) {
      config.ui = {};
    }
    config.ui.assistant = {
      ...(config.ui.assistant ?? {}),
      name: agent.name as string,
    };
    if (
      typeof body.avatarIndex === "number" &&
      Number.isFinite(body.avatarIndex)
    ) {
      config.ui.avatarIndex = Number(body.avatarIndex);
    }
    config.ui.language = configuredLanguage;
    if (typeof body.presetId === "string" && body.presetId.trim()) {
      config.ui.presetId = body.presetId.trim();
    }
    ctx.applyOnboardingVoicePreset(config, body, configuredLanguage);

    // ── Theme preference ──────────────────────────────────────────────────
    if (body.theme) {
      if (!config.ui) config.ui = {};
      config.ui.theme = body.theme as
        | "eliza"
        | "qt314"
        | "web2000"
        | "programmer"
        | "haxor"
        | "psycho";
    }

    const explicitConnectionRequested = Object.hasOwn(body, "connection");
    const explicitConnection = explicitConnectionRequested
      ? normalizePersistedOnboardingConnection(body.connection)
      : null;
    if (explicitConnectionRequested && !explicitConnection) {
      error(res, "Invalid connection", 400);
      return true;
    }
    const explicitDeploymentTargetRequested = Object.hasOwn(
      body,
      "deploymentTarget",
    );
    const explicitDeploymentTarget = explicitDeploymentTargetRequested
      ? normalizeDeploymentTargetConfig(body.deploymentTarget)
      : null;
    if (explicitDeploymentTargetRequested && !explicitDeploymentTarget) {
      error(res, "Invalid deploymentTarget", 400);
      return true;
    }
    const explicitLinkedAccountsRequested = Object.hasOwn(
      body,
      "linkedAccounts",
    );
    const explicitLinkedAccounts = explicitLinkedAccountsRequested
      ? normalizeLinkedAccountsConfig(body.linkedAccounts)
      : null;
    const explicitServiceRoutingRequested = Object.hasOwn(
      body,
      "serviceRouting",
    );
    const explicitServiceRouting = explicitServiceRoutingRequested
      ? normalizeServiceRoutingConfig(body.serviceRouting)
      : null;
    const hasCanonicalRuntimeConfig =
      explicitDeploymentTargetRequested ||
      explicitLinkedAccountsRequested ||
      explicitServiceRoutingRequested;

    // ── Run mode & cloud configuration ────────────────────────────────────
    const runMode = (body.runMode as string) || "local";

    // ── Sandbox mode (from 3-mode onboarding: off / light / standard / max)
    const sandboxMode = (body.sandboxMode as string) || "off";
    if (sandboxMode !== "off") {
      if (!config.agents) config.agents = {};
      if (!config.agents.defaults) config.agents.defaults = {};
      if (!(config.agents.defaults as Record<string, unknown>).sandbox) {
        (config.agents.defaults as Record<string, unknown>).sandbox = {};
      }
      (
        (config.agents.defaults as Record<string, unknown>).sandbox as Record<
          string,
          unknown
        >
      ).mode = sandboxMode;
      logger.info(`[eliza-api] Sandbox mode set to: ${sandboxMode}`);
    }

    if (explicitConnection) {
      await applyOnboardingConnectionConfig(config, explicitConnection);
    } else if (!hasCanonicalRuntimeConfig) {
      if (!config.cloud) config.cloud = {};

      if (runMode === "cloud") {
        if (
          typeof body.providerApiKey === "string" &&
          body.providerApiKey.trim().length > 0
        ) {
          const cloudApiKey = body.providerApiKey.trim();
          config.cloud.apiKey = cloudApiKey;
          process.env.ELIZAOS_CLOUD_API_KEY = cloudApiKey;
        }
        if (!config.models) config.models = {};
        config.models.small =
          (body.smallModel as string) ||
          config.models.small ||
          "openai/gpt-5-mini";
        config.models.large =
          (body.largeModel as string) ||
          config.models.large ||
          "anthropic/claude-sonnet-4.5";
      }

      // ── Local LLM provider ──────────────────────────────────────────────
      {
        if (!config.env) config.env = {};
        const envCfg = config.env as Record<string, unknown>;
        const vars = (envCfg.vars ?? {}) as Record<string, string>;
        const providerId =
          typeof body.provider === "string" ? body.provider : "";

        (envCfg as Record<string, unknown>).vars = vars;

        const clearPiAiFlag = () => {
          for (const key of ["ELIZA_USE_PI_AI", "MILADY_USE_PI_AI"] as const) {
            delete vars[key];
            delete (config.env as Record<string, string>)[key];
            delete process.env[key];
          }
        };

        if (runMode === "local" && providerId === "pi-ai") {
          vars.ELIZA_USE_PI_AI = "1";
          process.env.ELIZA_USE_PI_AI = "1";

          if (!config.agents) config.agents = {};
          if (!config.agents.defaults) config.agents.defaults = {};
          const defaults = config.agents.defaults as Record<string, unknown>;
          const modelConfig = (defaults.model ?? {}) as Record<string, unknown>;
          const primaryModel =
            typeof body.primaryModel === "string"
              ? body.primaryModel.trim()
              : "";

          if (primaryModel) {
            modelConfig.primary = primaryModel;
          } else {
            delete modelConfig.primary;
          }

          defaults.model = modelConfig;
        } else {
          clearPiAiFlag();
        }

        if (runMode === "local" && providerId && body.providerApiKey) {
          const providerOpt = (
            ctx.getProviderOptions() as Array<{
              id: string;
              envKey?: string;
            }>
          ).find((p) => p.id === providerId);
          if (providerOpt?.envKey) {
            (config.env as Record<string, string>)[providerOpt.envKey] =
              body.providerApiKey as string;
            process.env[providerOpt.envKey] = body.providerApiKey as string;
          }
        }
      }

      // ── Subscription providers (no API key needed — uses OAuth) ────────
      if (
        runMode === "local" &&
        (body.provider === "anthropic-subscription" ||
          body.provider === "openai-subscription")
      ) {
        if (!config.agents) config.agents = {};
        if (!config.agents.defaults) config.agents.defaults = {};
        (
          config.agents.defaults as Record<string, unknown>
        ).subscriptionProvider = body.provider;
        logger.info(
          `[eliza-api] Subscription provider selected: ${body.provider} — complete OAuth via /api/subscription/ endpoints`,
        );

        if (
          body.provider === "anthropic-subscription" &&
          typeof body.providerApiKey === "string" &&
          body.providerApiKey.trim().startsWith("sk-ant-")
        ) {
          const token = body.providerApiKey.trim();
          if (!config.env) config.env = {};
          (config.env as Record<string, string>).ANTHROPIC_API_KEY = token;
          process.env.ANTHROPIC_API_KEY = token;
          logger.info(
            "[eliza-api] Anthropic setup token saved during onboarding",
          );
        }
      }

      reconcilePersistedOnboardingConnection(config);
    }

    if (hasCanonicalRuntimeConfig) {
      applyCanonicalOnboardingConfig(config, {
        deploymentTarget: explicitDeploymentTarget,
        linkedAccounts: explicitLinkedAccounts,
        serviceRouting: explicitServiceRouting,
        clearRoutes:
          explicitServiceRoutingRequested &&
          !explicitServiceRouting?.llmText &&
          !explicitConnection
            ? ["llmText"]
            : [],
      });

      if (!explicitConnection) {
        delete config.connection;
        delete process.env.ELIZAOS_CLOUD_ENABLED;
        delete process.env.ELIZAOS_CLOUD_SMALL_MODEL;
        delete process.env.ELIZAOS_CLOUD_LARGE_MODEL;

        if (config.models && typeof config.models === "object") {
          delete config.models.small;
          delete config.models.large;
        }

        if (config.agents?.defaults?.model) {
          delete config.agents.defaults.model.primary;
        }
      }
    }

    // ── GitHub token ────────────────────────────────────────────────────
    if (
      body.githubToken &&
      typeof body.githubToken === "string" &&
      body.githubToken.trim()
    ) {
      if (!config.env) config.env = {};
      (config.env as Record<string, string>).GITHUB_TOKEN =
        body.githubToken.trim();
      process.env.GITHUB_TOKEN = body.githubToken.trim();
    }

    // ── Connectors (Telegram, Discord, WhatsApp, Twilio, Blooio) ────────
    if (!config.connectors) config.connectors = {};
    if (
      body.telegramToken &&
      typeof body.telegramToken === "string" &&
      body.telegramToken.trim()
    ) {
      config.connectors.telegram = { botToken: body.telegramToken.trim() };
    }
    if (
      body.discordToken &&
      typeof body.discordToken === "string" &&
      body.discordToken.trim()
    ) {
      config.connectors.discord = { token: body.discordToken.trim() };
    }
    if (
      body.whatsappSessionPath &&
      typeof body.whatsappSessionPath === "string" &&
      body.whatsappSessionPath.trim()
    ) {
      config.connectors.whatsapp = {
        sessionPath: body.whatsappSessionPath.trim(),
      };
    }
    if (
      body.twilioAccountSid &&
      typeof body.twilioAccountSid === "string" &&
      body.twilioAccountSid.trim() &&
      body.twilioAuthToken &&
      typeof body.twilioAuthToken === "string" &&
      body.twilioAuthToken.trim()
    ) {
      if (!config.env) config.env = {};
      (config.env as Record<string, string>).TWILIO_ACCOUNT_SID = (
        body.twilioAccountSid as string
      ).trim();
      (config.env as Record<string, string>).TWILIO_AUTH_TOKEN = (
        body.twilioAuthToken as string
      ).trim();
      process.env.TWILIO_ACCOUNT_SID = (body.twilioAccountSid as string).trim();
      process.env.TWILIO_AUTH_TOKEN = (body.twilioAuthToken as string).trim();
      if (
        body.twilioPhoneNumber &&
        typeof body.twilioPhoneNumber === "string" &&
        body.twilioPhoneNumber.trim()
      ) {
        (config.env as Record<string, string>).TWILIO_PHONE_NUMBER = (
          body.twilioPhoneNumber as string
        ).trim();
        process.env.TWILIO_PHONE_NUMBER = (
          body.twilioPhoneNumber as string
        ).trim();
      }
    }
    if (
      body.blooioApiKey &&
      typeof body.blooioApiKey === "string" &&
      body.blooioApiKey.trim()
    ) {
      if (!config.env) config.env = {};
      const trimmedKey = (body.blooioApiKey as string).trim();
      (config.env as Record<string, string>).BLOOIO_API_KEY = trimmedKey;
      process.env.BLOOIO_API_KEY = trimmedKey;

      const blooioConnector: Record<string, string> = { apiKey: trimmedKey };

      if (
        body.blooioPhoneNumber &&
        typeof body.blooioPhoneNumber === "string" &&
        body.blooioPhoneNumber.trim()
      ) {
        const trimmedPhone = (body.blooioPhoneNumber as string).trim();
        (config.env as Record<string, string>).BLOOIO_PHONE_NUMBER =
          trimmedPhone;
        process.env.BLOOIO_PHONE_NUMBER = trimmedPhone;
        blooioConnector.fromNumber = trimmedPhone;
      }

      config.connectors.blooio = blooioConnector;
    }

    // ── Inventory / RPC providers ─────────────────────────────────────────
    if (Array.isArray(body.inventoryProviders)) {
      if (!config.env) config.env = {};
      const allInventory = ctx.getInventoryProviderOptions() as Array<{
        id: string;
        rpcProviders: Array<{ id: string; envKey?: string }>;
      }>;
      for (const inv of body.inventoryProviders as Array<{
        chain: string;
        rpcProvider: string;
        rpcApiKey?: string;
      }>) {
        const chainDef = allInventory.find((ip) => ip.id === inv.chain);
        if (!chainDef) continue;
        const rpcDef = chainDef.rpcProviders.find(
          (rp) => rp.id === inv.rpcProvider,
        );
        if (rpcDef?.envKey && inv.rpcApiKey) {
          (config.env as Record<string, string>)[rpcDef.envKey] = inv.rpcApiKey;
          process.env[rpcDef.envKey] = inv.rpcApiKey;
        }
      }
    }

    // ── Ensure wallet keys exist so inventory can resolve addresses ───────
    ctx.ensureWalletKeysInEnvAndConfig(config);

    if (!config.meta) {
      config.meta = {};
    }
    config.meta.onboardingComplete = true;

    if (state.runtime) {
      const runtimeCharacter = state.runtime.character;
      const agentTopics = agent.topics as string[] | undefined;
      runtimeCharacter.name = (agent.name as string) ?? runtimeCharacter.name;
      if (Array.isArray(agent.bio)) {
        runtimeCharacter.bio = [...(agent.bio as string[])];
      }
      if (typeof agent.system === "string" && agent.system) {
        runtimeCharacter.system = agent.system;
      }
      if (Array.isArray(agent.adjectives)) {
        runtimeCharacter.adjectives = [...(agent.adjectives as string[])];
      }
      if (Array.isArray(agentTopics)) {
        runtimeCharacter.topics = [...agentTopics];
      }
      if (agent.style) {
        runtimeCharacter.style = JSON.parse(JSON.stringify(agent.style));
      }
      if (normalizedMessageExamples) {
        runtimeCharacter.messageExamples = normalizedMessageExamples;
      }
      if (Array.isArray(agent.postExamples)) {
        runtimeCharacter.postExamples = [...(agent.postExamples as string[])];
      }

      try {
        await state.runtime.updateAgent(state.runtime.agentId, {
          name: runtimeCharacter.name,
          metadata: {
            ...(runtimeCharacter.metadata as Record<string, unknown> | undefined),
            character: {
              name: runtimeCharacter.name,
              bio: runtimeCharacter.bio,
              system: runtimeCharacter.system,
              adjectives: runtimeCharacter.adjectives,
              topics: runtimeCharacter.topics,
              style: runtimeCharacter.style,
              messageExamples: runtimeCharacter.messageExamples,
              postExamples: runtimeCharacter.postExamples,
            },
          },
        });
      } catch (err) {
        logger.warn(
          `[character-db] Failed to persist onboarding character to DB: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    state.config = config;
    state.agentName = (body.name as string) ?? state.agentName;
    migrateLegacyRuntimeConfig(config as Record<string, unknown>);
    try {
      ctx.saveElizaConfig(config);
    } catch (err) {
      logger.error(
        `[eliza-api] Failed to save config after onboarding: ${err}`,
      );
      error(res, "Failed to save configuration", 500);
      return true;
    }

    if (!configFileExists()) {
      logger.error(
        `[eliza-api] Config file does not exist after save — onboarding data will be lost on restart`,
      );
      error(res, "Configuration file was not persisted to disk", 500);
      return true;
    }

    logger.info(
      `[eliza-api] Onboarding complete for agent "${body.name}" (mode: ${(body.runMode as string) || "local"})`,
    );
    json(res, { ok: true });
    return true;
  }

  return false;
}
