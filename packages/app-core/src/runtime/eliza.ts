import "../utils/namespace-defaults.js";
import { existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  type AgentRuntime,
  AutonomyService,
  ChannelType,
  logger,
  ModelType,
  type Plugin,
  stringToUuid,
} from "@elizaos/core";

export * from "@miladyai/agent/runtime/eliza";

import { loadElizaConfig } from "@miladyai/agent/config/config";
import { resolveUserPath } from "@miladyai/agent/config/paths";
import { resolveDefaultAgentWorkspaceDir } from "@miladyai/agent/providers/workspace";
import {
  type BootElizaRuntimeOptions,
  type StartElizaOptions,
  applyCloudConfigToEnv as upstreamApplyCloudConfigToEnv,
  bootElizaRuntime as upstreamBootElizaRuntime,
  buildCharacterFromConfig as upstreamBuildCharacterFromConfig,
  CHANNEL_PLUGIN_MAP as upstreamChannelPluginMap,
  collectPluginNames as upstreamCollectPluginNames,
  configureLocalEmbeddingPlugin as upstreamConfigureLocalEmbeddingPlugin,
  shutdownRuntime as upstreamShutdownRuntime,
  startEliza as upstreamStartEliza,
} from "@miladyai/agent/runtime/eliza";
import { getLastFailedPluginNames } from "@miladyai/agent/runtime/plugin-resolver";
import {
  getDefaultStylePreset,
  normalizeCharacterLanguage,
  resolveStylePresetByAvatarIndex,
  resolveStylePresetById,
  resolveStylePresetByName,
} from "@miladyai/shared/onboarding-presets";
import {
  resolveServerOnlyPort,
  syncResolvedApiPort,
} from "@miladyai/shared/runtime-env";
import { normalizeCharacterMessageExamples } from "../utils/character-message-examples.js";
import { syncElizaEnvToMilady, syncMiladyEnvToEliza } from "../utils/env.js";
import { ensureRuntimeSqlCompatibility } from "../utils/sql-compat.js";
import type { EmbeddingProgressCallback } from "./embedding-manager-support.js";
import {
  DEFAULT_MODELS_DIR,
  embeddingGgufFilePresent,
  ensureModel,
  findExistingEmbeddingModelForWarmupReuse,
  isMiladyEmbeddingWarmupReuseDisabled,
} from "./embedding-manager-support.js";
import { detectEmbeddingPreset } from "./embedding-presets.js";
import { shouldWarmupLocalEmbeddingModel } from "./embedding-warmup-policy.js";
import { updateMiladyStartupEmbeddingProgress } from "./milady-startup-overlay.js";

const AUTONOMY_WORLD_ID = stringToUuid("00000000-0000-0000-0000-000000000001");
const AUTONOMY_ENTITY_ID = stringToUuid("00000000-0000-0000-0000-000000000002");
const AUTONOMY_MESSAGE_SERVER_ID = stringToUuid("autonomy-message-server");
const INTERNAL_CHANNEL_PLUGIN_OVERRIDES = {
  signal: "@elizaos/plugin-signal",
  telegramAccount: "@elizaos-plugins/client-telegram-account",
  whatsapp: "@elizaos/plugin-whatsapp",
  wechat: "@miladyai/plugin-wechat",
} as const;

/** Swarm / PTY paths call TEXT_TO_SPEECH; Edge TTS supplies that model with no API key. */
const AGENT_ORCHESTRATOR_PLUGIN = "@elizaos/plugin-agent-orchestrator";
const EDGE_TTS_PLUGIN = "@elizaos/plugin-edge-tts";
const require = createRequire(import.meta.url);
const DIRECT_HELP_FLAGS = new Set(["-h", "--help", "help"]);
const DIRECT_VERSION_FLAGS = new Set(["-v", "-V", "--version", "version"]);
const PLUGIN_SQL_GLOBAL_SINGLETONS = Symbol.for(
  "@elizaos/plugin-sql/global-singletons",
);
const MILADY_AUTO_RESET_PGLITE_ERROR_CODE =
  "ELIZA_PGLITE_MANUAL_RESET_REQUIRED";

interface PluginSqlGlobalSingletons {
  pgLiteClientManager?: {
    close?: () => Promise<unknown> | unknown;
  };
}

type ErrorWithCause = Error & {
  cause?: unknown;
  code?: unknown;
  dataDir?: unknown;
};

export function isMiladyEdgeTtsDisabled(
  config: Parameters<typeof upstreamCollectPluginNames>[0],
): boolean {
  if (config.plugins?.entries?.["edge-tts"]?.enabled === false) {
    return true;
  }
  const raw = process?.env
    ? (process.env.MILADY_DISABLE_EDGE_TTS ??
      process.env.ELIZA_DISABLE_EDGE_TTS)
    : undefined;
  if (!raw || typeof raw !== "string") return false;
  const n = raw.trim().toLowerCase();
  return n === "1" || n === "true" || n === "yes";
}

export const CHANNEL_PLUGIN_MAP = {
  ...upstreamChannelPluginMap,
  ...INTERNAL_CHANNEL_PLUGIN_OVERRIDES,
};

/** Guards against registering signal handlers more than once. */
let signalHandlersRegistered = false;

interface EntityLike {
  id: string;
  agentId?: string;
  names?: string[];
  metadata?: Record<string, unknown>;
}

interface RuntimeAutonomyCompat {
  getEntityById?: (id: string) => Promise<EntityLike | null>;
  createEntity?: (entity: {
    id: string;
    names: string[];
    agentId: string;
    metadata?: Record<string, unknown>;
  }) => Promise<boolean>;
  updateEntity?: (entity: EntityLike & { agentId: string }) => Promise<boolean>;
  ensureWorldExists?: (world: {
    id: string;
    name: string;
    agentId: string;
    messageServerId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<unknown>;
  ensureRoomExists?: (room: {
    id: string;
    name: string;
    worldId: string;
    source: string;
    type: ChannelType;
    metadata?: Record<string, unknown>;
  }) => Promise<unknown>;
  ensureParticipantInRoom?: (
    entityId: string,
    roomId: string,
  ) => Promise<unknown>;
  addParticipant?: (entityId: string, roomId: string) => Promise<unknown>;
}

interface RuntimeAdapterAutonomyCompat {
  upsertEntities?: (
    entities: Array<{
      id: string;
      names: string[];
      agentId: string;
      metadata?: Record<string, unknown>;
    }>,
  ) => Promise<unknown>;
}

interface RuntimeModelCompat {
  useModel?: (
    type: (typeof ModelType)[keyof typeof ModelType] | string,
    params: { prompt: string },
  ) => Promise<unknown>;
}

function syncBrandEnvAliases(): void {
  syncElizaEnvToMilady();
  syncMiladyEnvToEliza();
}

function resolveMiladyPreset(
  config: Parameters<typeof upstreamBuildCharacterFromConfig>[0],
  name: string | undefined,
) {
  const uiConfig = (config.ui ?? {}) as {
    presetId?: string;
    avatarIndex?: number;
    language?: unknown;
  };
  const language = normalizeCharacterLanguage(uiConfig.language);
  const matchedPreset =
    (typeof uiConfig.presetId === "string" && uiConfig.presetId
      ? resolveStylePresetById(uiConfig.presetId, language)
      : undefined) ??
    resolveStylePresetByAvatarIndex(uiConfig.avatarIndex, language) ??
    resolveStylePresetByName(name, language);
  if (matchedPreset) {
    return matchedPreset;
  }
  return name ? undefined : getDefaultStylePreset(language);
}

export function collectPluginNames(
  ...args: Parameters<typeof upstreamCollectPluginNames>
): ReturnType<typeof upstreamCollectPluginNames> {
  syncBrandEnvAliases();
  const [config] = args;
  const result = upstreamCollectPluginNames(...args);
  if (
    result.has(AGENT_ORCHESTRATOR_PLUGIN) &&
    !isMiladyEdgeTtsDisabled(config) &&
    !result.has(EDGE_TTS_PLUGIN)
  ) {
    result.add(EDGE_TTS_PLUGIN);
  }
  syncBrandEnvAliases();
  return result;
}

type TtsModelHandler = (
  runtime: AgentRuntime,
  input: unknown,
) => Promise<unknown>;

type RuntimeWithModelRegistration = AgentRuntime & {
  getModel: (modelType: string | number) => TtsModelHandler | undefined;
  registerModel: (
    modelType: string | number,
    handler: TtsModelHandler,
    provider: string,
    priority?: number,
  ) => void;
};

/**
 * `@miladyai/agent` boot calls its own `collectPluginNames` — Milady's wrapper
 * (which adds Edge TTS) is not used. Register the Edge TTS model handler on
 * the live runtime so core streaming voice (`useModel(TEXT_TO_SPEECH)`) works
 * for swarm / agent chat sessions and matches UI TTS expectations.
 */
export async function ensureMiladyTextToSpeechHandler(
  runtime: AgentRuntime,
): Promise<void> {
  let config: Parameters<typeof upstreamCollectPluginNames>[0];
  try {
    const { loadElizaConfig } = await import("@miladyai/agent/config/config");
    config = loadElizaConfig();
  } catch {
    config = {} as Parameters<typeof upstreamCollectPluginNames>[0];
  }

  if (isMiladyEdgeTtsDisabled(config)) {
    return;
  }

  const r = runtime as RuntimeWithModelRegistration;
  if (
    typeof r.getModel !== "function" ||
    typeof r.registerModel !== "function"
  ) {
    return;
  }

  const existing = r.getModel(ModelType.TEXT_TO_SPEECH);
  if (existing) {
    return;
  }

  type EdgeTtsPluginModule = {
    default?: { models?: Record<string, TtsModelHandler> };
    edgeTTSPlugin?: { models?: Record<string, TtsModelHandler> };
  };

  const readHandler = (
    plugin: EdgeTtsPluginModule["default"],
  ): TtsModelHandler | undefined => {
    const h = plugin?.models?.[ModelType.TEXT_TO_SPEECH];
    return typeof h === "function" ? h : undefined;
  };

  try {
    // Prefer the CommonJS entry in local workspaces. Some workspace ESM builds
    // throw during module evaluation, and Bun can hang a later hot-restart when
    // the same broken specifier is imported again. The CJS export remains stable.
    let handler: TtsModelHandler | undefined;
    try {
      const cjsMod = require("@elizaos/plugin-edge-tts") as EdgeTtsPluginModule;
      handler = readHandler(cjsMod.edgeTTSPlugin);
    } catch {
      handler = undefined;
    }

    // The package root export can resolve to the **browser stub** (`models: {}`)
    // under Bun / some bundlers. The `/node` subpath always loads `node-edge-tts`.
    if (!handler) {
      try {
        const nodeMod = (await import(
          "@elizaos/plugin-edge-tts/node"
        )) as EdgeTtsPluginModule;
        handler = readHandler(nodeMod.default);
      } catch {
        handler = undefined;
      }
    }
    if (!handler) {
      const rootMod = (await import(
        "@elizaos/plugin-edge-tts"
      )) as EdgeTtsPluginModule;
      handler = readHandler(rootMod.default);
    }
    if (!handler) {
      logger.warn(
        "[milady] @elizaos/plugin-edge-tts: no TEXT_TO_SPEECH handler (browser stub or incompatible build — use @elizaos/plugin-edge-tts/node)",
      );
      return;
    }
    r.registerModel(ModelType.TEXT_TO_SPEECH, handler, "edge-tts", 0);
    logger.info(
      "[milady] Registered Edge TTS for runtime TEXT_TO_SPEECH (streaming / swarm voice)",
    );
  } catch (err) {
    logger.warn(
      `[milady] Could not register Edge TTS for TEXT_TO_SPEECH: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function applyCloudConfigToEnv(
  ...args: Parameters<typeof upstreamApplyCloudConfigToEnv>
): ReturnType<typeof upstreamApplyCloudConfigToEnv> {
  syncBrandEnvAliases();
  const result = upstreamApplyCloudConfigToEnv(...args);
  syncBrandEnvAliases();
  return result;
}

export function buildCharacterFromConfig(
  ...args: Parameters<typeof upstreamBuildCharacterFromConfig>
): ReturnType<typeof upstreamBuildCharacterFromConfig> {
  syncBrandEnvAliases();
  const [config] = args;
  const character = upstreamBuildCharacterFromConfig(...args);
  syncBrandEnvAliases();

  const agentEntry = config.agents?.list?.[0];
  const bundledPreset = resolveMiladyPreset(config, character.name);
  if ((character.messageExamples?.length ?? 0) > 0) {
    character.messageExamples = normalizeCharacterMessageExamples(
      character.messageExamples,
      character.name,
    );
  }
  if (bundledPreset) {
    // The upstream buildCharacterFromConfig may use its own preset data
    // which can differ from the Milady presets. Backfill all Milady preset
    // fields so character data is complete even when the Bun body replay
    // drops fields during onboarding.
    if (!agentEntry?.style && !character.style && bundledPreset.style) {
      // Plain style arrays match runtime usage; upstream `StyleGuides` is a protobuf
      // shape with `$typeName` that we do not construct here.
      character.style = {
        all: [...bundledPreset.style.all],
        chat: [...bundledPreset.style.chat],
        post: [...bundledPreset.style.post],
      } as unknown as NonNullable<(typeof character)["style"]>;
    }
    if (
      !agentEntry?.adjectives &&
      (!character.adjectives || character.adjectives.length === 0) &&
      bundledPreset.adjectives.length > 0
    ) {
      character.adjectives = [...bundledPreset.adjectives];
    }
    if (
      !agentEntry?.topics &&
      (!Array.isArray(character.topics) || character.topics.length === 0) &&
      Array.isArray(bundledPreset.topics) &&
      bundledPreset.topics.length > 0
    ) {
      character.topics = [...bundledPreset.topics];
    }
    if (
      !agentEntry?.postExamples &&
      (character.postExamples?.length ?? 0) === 0
    ) {
      character.postExamples = [...bundledPreset.postExamples];
    }
    if (
      !agentEntry?.messageExamples &&
      (character.messageExamples?.length ?? 0) === 0
    ) {
      character.messageExamples = normalizeCharacterMessageExamples(
        bundledPreset.messageExamples,
        character.name,
      );
    }
  }

  return character;
}

async function ensureAutonomyBootstrapContext(
  runtime: AgentRuntime,
): Promise<void> {
  const runtimeWithCompat = runtime as AgentRuntime & RuntimeAutonomyCompat;
  const adapter = runtime.adapter as RuntimeAdapterAutonomyCompat | undefined;
  const autonomousRoomId = stringToUuid(`autonomy-room-${runtime.agentId}`);

  await runtimeWithCompat.ensureWorldExists?.({
    id: AUTONOMY_WORLD_ID,
    name: "Autonomy World",
    agentId: runtime.agentId,
    messageServerId: AUTONOMY_MESSAGE_SERVER_ID,
    metadata: {
      type: "autonomy",
      description: "World for autonomous agent thinking",
    },
  });

  await runtimeWithCompat.ensureRoomExists?.({
    id: autonomousRoomId,
    name: "Autonomous Thoughts",
    worldId: AUTONOMY_WORLD_ID,
    source: "autonomy-service",
    type: ChannelType.SELF,
    metadata: {
      source: "autonomy-service",
      description: "Room for autonomous agent thinking",
    },
  });

  const autonomyEntity = {
    id: AUTONOMY_ENTITY_ID,
    names: ["Autonomy"],
    agentId: runtime.agentId,
    metadata: {
      type: "autonomy",
      description: "Dedicated entity for autonomy service prompts",
    },
  };
  const existingEntity =
    (await runtimeWithCompat.getEntityById?.(AUTONOMY_ENTITY_ID)) ?? null;

  if (!existingEntity) {
    const created = await runtimeWithCompat.createEntity?.(autonomyEntity);
    if (!created && adapter?.upsertEntities) {
      await adapter.upsertEntities([autonomyEntity]);
    }
  } else if (existingEntity.agentId !== runtime.agentId) {
    if (runtimeWithCompat.updateEntity) {
      await runtimeWithCompat.updateEntity({
        ...existingEntity,
        agentId: runtime.agentId,
      });
    } else if (adapter?.upsertEntities) {
      await adapter.upsertEntities([
        {
          id: existingEntity.id ?? AUTONOMY_ENTITY_ID,
          names:
            existingEntity.names && existingEntity.names.length > 0
              ? existingEntity.names
              : autonomyEntity.names,
          agentId: runtime.agentId,
          metadata: {
            ...autonomyEntity.metadata,
            ...(existingEntity.metadata ?? {}),
          },
        },
      ]);
    }
  }

  if (runtimeWithCompat.ensureParticipantInRoom) {
    await runtimeWithCompat.ensureParticipantInRoom(
      runtime.agentId,
      autonomousRoomId,
    );
    await runtimeWithCompat.ensureParticipantInRoom(
      AUTONOMY_ENTITY_ID,
      autonomousRoomId,
    );
  } else if (runtimeWithCompat.addParticipant) {
    await runtimeWithCompat.addParticipant(runtime.agentId, autonomousRoomId);
    await runtimeWithCompat.addParticipant(
      AUTONOMY_ENTITY_ID,
      autonomousRoomId,
    );
  }
}

async function repairRuntimeAfterBoot(
  runtime: AgentRuntime,
): Promise<AgentRuntime> {
  await ensureRuntimeSqlCompatibility(runtime);
  await ensureMiladyTextToSpeechHandler(runtime);
  await ensureAutonomyBootstrapContext(runtime);

  if (!runtime.getService("AUTONOMY")) {
    try {
      await AutonomyService.start(runtime);
      logger.info(
        "[milady] AutonomyService started after SQL compatibility repair",
      );
    } catch (error) {
      logger.warn(
        `[milady] AutonomyService restart after SQL compatibility repair failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Enable the autonomy loop so trigger/heartbeat instructions are processed.
  {
    const autonomySvc = (runtime.getService("AUTONOMY") ??
      runtime.getService("autonomy")) as unknown as
      | { enableAutonomy(): Promise<void> }
      | null
      | undefined;
    if (autonomySvc && typeof autonomySvc.enableAutonomy === "function") {
      try {
        await autonomySvc.enableAutonomy();
        logger.info(
          "[milady] AutonomyService enabled — trigger instructions will be processed",
        );
      } catch (err) {
        logger.warn(
          `[milady] Failed to enable autonomy loop: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // Ensure Telegram bot is polling. The upstream plugin's bot.launch() is
  // not awaited and silently fails on bun/Windows. We create a standalone
  // Telegraf instance with proper lifecycle management.
  await ensureTelegramBotPolling(runtime);

  return runtime;
}

// Module-level Telegraf bot reference for lifecycle management across restarts.
let _miladyTelegramBot: { stop: (reason?: string) => void } | null = null;

async function ensureTelegramBotPolling(runtime: AgentRuntime): Promise<void> {
  // Stop any previous bot instance
  if (_miladyTelegramBot) {
    try {
      _miladyTelegramBot.stop("restart");
    } catch {
      /* ignore */
    }
    _miladyTelegramBot = null;
    await new Promise((r) => setTimeout(r, 1000));
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  try {
    const { Telegraf } = await import("telegraf");
    const apiRoot = process.env.TELEGRAM_API_ROOT || "https://api.telegram.org";
    const bot = new Telegraf(botToken, { telegram: { apiRoot } });

    // Build character context for personality
    const char = runtime.character ?? ({} as Record<string, unknown>);
    const bioText = Array.isArray(char.bio)
      ? char.bio.join(" ")
      : (char.bio ?? "");
    const loreText = Array.isArray((char as Record<string, unknown>).lore)
      ? ((char as Record<string, unknown>).lore as string[]).join(" ")
      : "";
    const styleText = (() => {
      const s = (char as Record<string, unknown>).style as
        | Record<string, string[]>
        | undefined;
      if (!s) return "";
      const parts: string[] = [];
      if (s.all?.length) parts.push(s.all.join(" "));
      if (s.chat?.length) parts.push(s.chat.join(" "));
      return parts.join(" ");
    })();
    const systemPrompt = [
      `You are ${char.name}.`,
      char.system ?? "",
      bioText ? `Bio: ${bioText}` : "",
      loreText ? `Lore: ${loreText}` : "",
      styleText ? `Style: ${styleText}` : "",
      "Respond in character. Keep responses concise for chat.",
    ]
      .filter(Boolean)
      .join("\n");

    const chatHistories = new Map<
      number,
      Array<{ role: string; content: string }>
    >();

    bot.on(
      "message",
      async (ctx: {
        message: {
          text?: string;
          from?: { username?: string; first_name?: string };
          chat?: { id: number };
        };
        reply: (t: string) => Promise<unknown>;
      }) => {
        try {
          const text = ctx.message?.text;
          if (!text) return;
          const chatId = ctx.message.chat?.id ?? 0;

          // Check allowed chats (reads live from process.env — no restart needed)
          const allowedChats = process.env.TELEGRAM_ALLOWED_CHATS;
          if (
            allowedChats &&
            allowedChats.trim() !== "" &&
            allowedChats.trim() !== "[]"
          ) {
            try {
              if (
                !(JSON.parse(allowedChats) as string[]).includes(String(chatId))
              )
                return;
            } catch {
              return;
            }
          }

          const username =
            ctx.message.from?.username ??
            ctx.message.from?.first_name ??
            "Unknown";
          logger.info(
            `[milady] Telegram message from @${username}: ${text.substring(0, 80)}`,
          );

          let history = chatHistories.get(chatId);
          if (!history) {
            history = [];
            // Evict least-recently-used chat to prevent unbounded memory growth
            if (chatHistories.size >= 500) {
              const oldest = chatHistories.keys().next().value;
              if (oldest !== undefined) chatHistories.delete(oldest);
            }
          } else {
            // Move to end of Map iteration order (most-recently-used)
            chatHistories.delete(chatId);
          }
          chatHistories.set(chatId, history);
          history.push({ role: "user", content: `@${username}: ${text}` });
          if (history.length > 20) history.splice(0, history.length - 20);

          try {
            const conv = history
              .map(
                (m) =>
                  `${m.role === "user" ? "User" : char.name}: ${m.content}`,
              )
              .join("\n");
            const modelRuntime = runtime as AgentRuntime & RuntimeModelCompat;
            if (typeof modelRuntime.useModel !== "function") {
              logger.warn("[milady] Telegram runtime missing useModel");
              return;
            }
            // biome-ignore lint/correctness/useHookAtTopLevel: false positive, hook is at module level
            const response = await modelRuntime.useModel(ModelType.TEXT_LARGE, {
              prompt: `${systemPrompt}\n\nConversation:\n${conv}\n\n${char.name}:`,
            });
            const responseText =
              typeof response === "string"
                ? response
                : ((response as { text?: string })?.text ?? "");
            if (responseText) {
              history.push({ role: "assistant", content: responseText });
              await ctx.reply(responseText);
              logger.info(`[milady] Telegram replied to @${username}`);
            }
          } catch (err) {
            logger.warn(
              `[milady] Telegram response error: ${err instanceof Error ? err.message : String(err)}`,
            );
            await ctx
              .reply("Sorry, I encountered an error processing your message.")
              .catch(() => {});
          }
        } catch (outerErr) {
          logger.warn(
            `[milady] Telegram handler error: ${outerErr instanceof Error ? outerErr.message : String(outerErr)}`,
          );
        }
      },
    );

    bot.catch((err: unknown) =>
      logger.warn(
        `[milady] Telegram bot error: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );

    // Fire-and-forget — bot.launch() only resolves on stop()
    bot
      .launch({
        dropPendingUpdates: true,
        allowedUpdates: ["message", "message_reaction"],
      })
      .catch((err) =>
        logger.warn(
          `[milady] Telegram bot launch error: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    _miladyTelegramBot = bot;
    // Telegram bot cleanup is handled by the unified signal handler in
    // startEliza() via _miladyTelegramBot — no separate registration needed.

    await new Promise((r) => setTimeout(r, 500));
    logger.info("[milady] Telegram bot polling started");
  } catch (err) {
    logger.warn(
      `[milady] Telegram bot setup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Eagerly download the embedding model file if not already present.
 * This ensures the GGUF is on disk before the runtime's first
 * generateEmbedding() call, avoiding a silent stall on first use.
 *
 * Uses the same env resolution as `configureLocalEmbeddingPlugin` (eliza.json
 * `embedding` + hardware tier). Warmup previously always used tier-only presets,
 * so a custom `embedding.model` caused a first download here and a *second*
 * download when the plugin looked for a different filename — nothing deleted
 * the first file; it was simply the wrong path/name.
 *
 * If the configured GGUF is **not** on disk but another known embedding file
 * already exists in `MODELS_DIR` (e.g. legacy bge-small after `eliza.json`
 * switched to the 7B E5 preset), we align `LOCAL_EMBEDDING_*` with that file
 * so we do not re-download multi‑GB models. Opt out:
 * `MILADY_EMBEDDING_WARMUP_NO_REUSE=1`.
 */
async function warmupEmbeddingModel(
  onProgress?: EmbeddingProgressCallback,
): Promise<void> {
  if (!shouldWarmupLocalEmbeddingModel()) {
    logger.info(
      "[milady] Skipping local embedding (GGUF) warmup — not needed for this configuration (e.g. Eliza Cloud embeddings, or local embeddings disabled).",
    );
    return;
  }

  const config = loadElizaConfig();
  upstreamConfigureLocalEmbeddingPlugin({} as Plugin, config);

  const preset = detectEmbeddingPreset();
  const modelsDir = process.env.MODELS_DIR ?? DEFAULT_MODELS_DIR;
  let model = process.env.LOCAL_EMBEDDING_MODEL?.trim() || preset.model;
  let modelRepo =
    process.env.LOCAL_EMBEDDING_MODEL_REPO?.trim() || preset.modelRepo;

  if (
    !isMiladyEmbeddingWarmupReuseDisabled() &&
    !embeddingGgufFilePresent(modelsDir, model)
  ) {
    const reuse = findExistingEmbeddingModelForWarmupReuse(modelsDir);
    if (reuse) {
      logger.info(
        `[milady] Embedding warmup: configured file "${model}" not found in MODELS_DIR — reusing existing ${reuse.model} to avoid a large re-download. ` +
          "Set LOCAL_EMBEDDING_MODEL or MILADY_EMBEDDING_WARMUP_NO_REUSE=1 to force the configured model.",
      );
      process.env.LOCAL_EMBEDDING_MODEL = reuse.model;
      process.env.LOCAL_EMBEDDING_MODEL_REPO = reuse.modelRepo;
      process.env.LOCAL_EMBEDDING_DIMENSIONS = String(reuse.dimensions);
      process.env.LOCAL_EMBEDDING_CONTEXT_SIZE = String(reuse.contextSize);
      process.env.LOCAL_EMBEDDING_GPU_LAYERS = reuse.gpuLayers;
      process.env.LOCAL_EMBEDDING_USE_MMAP =
        reuse.gpuLayers === "auto" ? "false" : "true";
      model = reuse.model;
      modelRepo = reuse.modelRepo;
    }
  }

  logger.info(
    `[milady] Local embedding warmup: ${model} (hardware tier preset: ${preset.label}). ` +
      "This file is for TEXT_EMBEDDING / memory only (not your conversation model).",
  );

  const progressCb: EmbeddingProgressCallback = (phase, detail) => {
    updateMiladyStartupEmbeddingProgress(phase, detail);
    // Always log to stdout for server/container monitoring
    if (phase === "downloading") {
      logger.info(`[milady] Embedding model: ${detail ?? "downloading..."}`);
    } else if (phase === "loading") {
      logger.info(`[milady] Embedding model: loading ${detail ?? ""}`);
    } else if (phase === "ready") {
      logger.info(`[milady] Embedding model: ready (${detail ?? ""})`);
    }
    // Forward to caller's callback (e.g. for TUI loading screen)
    onProgress?.(phase, detail);
  };

  try {
    await ensureModel(modelsDir, modelRepo, model, false, progressCb);
  } catch (err) {
    // Non-fatal: the plugin will attempt its own download on first use
    logger.warn(
      `[milady] Embedding model warmup failed (will retry on first use): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export interface BootElizaRuntimeOptionsExt extends BootElizaRuntimeOptions {
  /** Optional callback for embedding model download/init progress. */
  onEmbeddingProgress?: EmbeddingProgressCallback;
}

export async function bootElizaRuntime(
  opts: BootElizaRuntimeOptionsExt = {},
): Promise<Awaited<ReturnType<typeof upstreamBootElizaRuntime>>> {
  syncMiladyEnvToEliza();

  try {
    // Eagerly download the embedding model before the full runtime boot.
    // This way the TUI loading screen (or server logs) can show download
    // progress instead of the app silently stalling on first embedding call.
    await warmupEmbeddingModel(opts.onEmbeddingProgress);

    // Cap embedding dimension to 384 — plugin-sql's DIMENSION_MAP only
    // supports up to 3072, and the performance-tier E5-Mistral-7B model
    // outputs 4096-dim vectors which would silently fall back to 384 anyway.
    if (!process.env.EMBEDDING_DIMENSION) {
      process.env.EMBEDDING_DIMENSION = "384";
    }

    const runtime = await upstreamBootElizaRuntime(opts);
    return runtime ? await repairRuntimeAfterBoot(runtime) : runtime;
  } finally {
    syncElizaEnvToMilady();
  }
}

export interface StartElizaOptionsExt extends StartElizaOptions {
  /** Optional callback for embedding model download/init progress. */
  onEmbeddingProgress?: EmbeddingProgressCallback;
}

function collectErrorObjects(err: unknown): ErrorWithCause[] {
  const chain: ErrorWithCause[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;

  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      chain.push(current as ErrorWithCause);
      current = (current as ErrorWithCause).cause;
      continue;
    }
    if (typeof current === "object" && current !== null) {
      const candidate = current as ErrorWithCause;
      chain.push(candidate);
      current = candidate.cause;
      continue;
    }
    break;
  }

  return chain;
}

function getPgliteErrorCode(err: unknown): string | null {
  for (const current of collectErrorObjects(err)) {
    if (typeof current.code === "string" && current.code) {
      return current.code;
    }
  }
  return null;
}

function collectErrorMessages(err: unknown): string[] {
  const messages: string[] = [];

  for (const current of collectErrorObjects(err)) {
    if (typeof current.message === "string" && current.message) {
      messages.push(current.message);
    }
  }

  return messages;
}

function isMiladyManualResetPgliteError(err: unknown): boolean {
  if (getPgliteErrorCode(err) === MILADY_AUTO_RESET_PGLITE_ERROR_CODE) {
    return true;
  }

  return collectErrorMessages(err).some((message) =>
    message.includes("rename or delete only this directory before retrying"),
  );
}

function getPgliteDataDirFromError(err: unknown): string | null {
  for (const current of collectErrorObjects(err)) {
    if (typeof current.dataDir === "string" && current.dataDir.trim()) {
      return current.dataDir;
    }
  }

  for (const message of collectErrorMessages(err)) {
    const retryPathMatch = message.match(
      /before retrying:\s*([^\n]+?)(?:\s*$|\.)/,
    );
    if (retryPathMatch?.[1]) {
      return retryPathMatch[1].trim();
    }

    const initPathMatch = message.match(
      /PGlite initialization failed for (.+?):/i,
    );
    if (initPathMatch?.[1]) {
      return initPathMatch[1].trim();
    }
  }

  return null;
}

function resolveMiladyManagedPgliteDataDir(): string | null {
  const envDataDir = process.env.PGLITE_DATA_DIR?.trim();
  if (envDataDir) {
    return resolveUserPath(envDataDir);
  }

  const config = loadElizaConfig();
  if ((config.database?.provider ?? "pglite") === "postgres") {
    return null;
  }

  const configuredDataDir = config.database?.pglite?.dataDir?.trim();
  if (configuredDataDir) {
    return resolveUserPath(configuredDataDir);
  }

  const workspaceDir =
    config.agents?.defaults?.workspace ?? resolveDefaultAgentWorkspaceDir();
  return path.join(resolveUserPath(workspaceDir), ".eliza", ".elizadb");
}

function isMiladyAutoResettablePgliteDir(
  dataDir: string | null,
): dataDir is string {
  return typeof dataDir === "string" && path.basename(dataDir) === ".elizadb";
}

async function resetPluginSqlPgliteSingleton(context: string): Promise<void> {
  const globalSymbols = globalThis as typeof globalThis &
    Record<symbol, PluginSqlGlobalSingletons | undefined>;
  const singletons = globalSymbols[PLUGIN_SQL_GLOBAL_SINGLETONS];
  const manager = singletons?.pgLiteClientManager;

  if (manager && typeof manager.close === "function") {
    let closeTimedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    try {
      await Promise.race([
        Promise.resolve(manager.close()),
        new Promise<void>((resolve) => {
          timeoutHandle = setTimeout(() => {
            closeTimedOut = true;
            resolve();
          }, 1_000);
        }),
      ]);
    } catch (err) {
      logger.warn(
        `[milady] ${context}: failed to close plugin-sql PGlite singleton: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }

    if (closeTimedOut) {
      logger.warn(
        `[milady] ${context}: plugin-sql PGlite singleton close timed out; continuing with a forced reset`,
      );
    }
  }

  if (singletons?.pgLiteClientManager) {
    delete singletons.pgLiteClientManager;
  }
}

async function quarantinePgliteDataDir(
  dataDir: string,
): Promise<string | null> {
  if (!existsSync(dataDir)) {
    return null;
  }

  const parentDir = path.dirname(dataDir);
  const baseName = path.basename(dataDir);
  let attempt = 0;

  while (attempt < 1000) {
    const suffix = attempt === 0 ? `${Date.now()}` : `${Date.now()}-${attempt}`;
    const backupDir = path.join(parentDir, `${baseName}.corrupt-${suffix}`);
    if (existsSync(backupDir)) {
      attempt += 1;
      continue;
    }
    await rename(dataDir, backupDir);
    return backupDir;
  }

  throw new Error(`Could not allocate a backup path for ${dataDir}`);
}

export async function attemptMiladyPgliteAutoReset(
  err: unknown,
): Promise<string | null> {
  if (!isMiladyManualResetPgliteError(err)) {
    return null;
  }

  const dataDir =
    getPgliteDataDirFromError(err) ?? resolveMiladyManagedPgliteDataDir();
  if (!isMiladyAutoResettablePgliteDir(dataDir)) {
    return null;
  }

  logger.warn(
    `[milady] PGlite startup failed for ${dataDir}. Quarantining the local database before retrying.`,
  );

  await resetPluginSqlPgliteSingleton("PGlite auto-reset");
  const backupDir = await quarantinePgliteDataDir(dataDir);

  if (backupDir) {
    logger.warn(`[milady] Moved the previous PGlite data dir to ${backupDir}`);
  }

  await resetPluginSqlPgliteSingleton("PGlite auto-reset retry");
  return backupDir;
}

export function getMiladyPgliteRecoveryRetrySkipPlugins(): string[] {
  return getLastFailedPluginNames();
}

export async function startEliza(
  options?: StartElizaOptionsExt,
): Promise<Awaited<ReturnType<typeof upstreamStartEliza>>> {
  syncMiladyEnvToEliza();

  try {
    // Eagerly download the embedding model with progress reporting
    await warmupEmbeddingModel(options?.onEmbeddingProgress);

    // Cap embedding dimension to 384 — see comment in bootElizaRuntime.
    if (!process.env.EMBEDDING_DIMENSION) {
      process.env.EMBEDDING_DIMENSION = "384";
    }

    if (options?.serverOnly) {
      let currentRuntime =
        (await upstreamStartEliza({
          ...options,
          headless: true,
          serverOnly: false,
        })) ?? undefined;

      currentRuntime = currentRuntime
        ? await repairRuntimeAfterBoot(currentRuntime)
        : currentRuntime;

      if (!currentRuntime) {
        return currentRuntime;
      }

      const { startApiServer } = await import("../api/server");
      const apiPort = resolveServerOnlyPort(process.env);
      const { port: actualApiPort } = await startApiServer({
        port: apiPort,
        runtime: currentRuntime,
        onRestart: async () => {
          if (!currentRuntime) {
            return null;
          }

          await upstreamShutdownRuntime(
            currentRuntime,
            "milady server-only restart",
          );

          const restarted =
            (await upstreamStartEliza({
              ...options,
              headless: true,
              serverOnly: false,
            })) ?? undefined;

          currentRuntime = restarted
            ? await repairRuntimeAfterBoot(restarted)
            : undefined;

          return currentRuntime ?? null;
        },
      });

      // WHY: `startApiServer` may bind a different port than requested (busy
      // socket, upstream policy). Shells, scripts, and follow-up code reading
      // env must match the real listener or health checks and user-facing URLs
      // disagree with `GET /api/health`.
      syncResolvedApiPort(process.env, actualApiPort, {
        overwriteUiPort: true,
      });
      // Invalidate cached CORS port set so the new port is allowed.
      try {
        const { invalidateCorsAllowedPorts } = await import(
          "../api/server-cors.js"
        );
        invalidateCorsAllowedPorts();
      } catch {}

      logger.info(
        `[milady] API server listening on http://localhost:${actualApiPort}`,
      );
      console.log(`[milady] Control UI: http://localhost:${actualApiPort}`);
      console.log("[milady] Server running. Press Ctrl+C to stop.");

      const keepAlive = setInterval(() => {}, 1 << 30);
      let isCleaningUp = false;
      const cleanup = async () => {
        if (isCleaningUp) {
          return;
        }
        isCleaningUp = true;
        clearInterval(keepAlive);
        // Force exit if graceful shutdown hangs for more than 10 seconds.
        const forceExitTimer = setTimeout(() => {
          logger.warn("[milady] Shutdown timed out after 10s — forcing exit");
          process.exit(1);
        }, 10_000);
        forceExitTimer.unref?.();
        // Stop Telegram bot if running (previously registered via separate process.once handlers)
        if (_miladyTelegramBot) {
          try {
            _miladyTelegramBot.stop("SIGINT");
          } catch {
            /* ignore */
          }
        }
        if (currentRuntime) {
          await upstreamShutdownRuntime(currentRuntime, "server-only shutdown");
        }
        process.exit(0);
      };

      if (!signalHandlersRegistered) {
        signalHandlersRegistered = true;
        process.on("SIGINT", () => void cleanup());
        process.on("SIGTERM", () => void cleanup());
      }
      return currentRuntime;
    }

    const runtime = await upstreamStartEliza(options);
    return runtime ? await repairRuntimeAfterBoot(runtime) : runtime;
  } finally {
    syncElizaEnvToMilady();
  }
}

function isDirectRuntimeRun(): boolean {
  const scriptArg = process.argv[1];
  if (!scriptArg) {
    return false;
  }
  return import.meta.url === pathToFileURL(path.resolve(scriptArg)).href;
}

function printDirectRuntimeHelp(): void {
  console.log(`milady runtime

Usage:
  bun packages/app-core/src/runtime/eliza.ts
  bun run start:eliza

Flags:
  --help, -h       Show this help
  --version, -v    Show the app-core package version

For full CLI help, run:
  bun run milady --help`);
}

function printDirectRuntimeVersion(): void {
  const pkg = require("../../package.json") as { version?: string };
  console.log(pkg.version ?? "unknown");
}

if (isDirectRuntimeRun()) {
  const command = process.argv[2];
  if (DIRECT_HELP_FLAGS.has(command ?? "")) {
    printDirectRuntimeHelp();
  } else if (DIRECT_VERSION_FLAGS.has(command ?? "")) {
    printDirectRuntimeVersion();
  } else {
    startEliza().catch((err) => {
      console.error(
        "[milady] Fatal error:",
        err instanceof Error ? (err.stack ?? err.message) : err,
      );
      process.exit(1);
    });
  }
}
