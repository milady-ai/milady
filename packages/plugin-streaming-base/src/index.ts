/**
 * Shared factory for RTMP streaming destination plugins.
 *
 * Both @milady/plugin-twitch-streaming and @milady/plugin-youtube-streaming
 * delegate to this factory to eliminate near-identical boilerplate for actions,
 * destination creation, and plugin wiring.
 */

import type {
  Action,
  ActionExample,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  Plugin,
  State,
} from "@elizaos/core";

// ── Shared types ────────────────────────────────────────────────────────────
// Canonical definition — stream-routes.ts re-exports this interface.

export interface StreamingDestination {
  id: string;
  name: string;
  getCredentials(): Promise<{ rtmpUrl: string; rtmpKey: string }>;
  onStreamStart?(): Promise<void>;
  onStreamStop?(): Promise<void>;
}

export interface StreamingPluginConfig {
  /** Short lowercase identifier, e.g. "twitch" or "youtube" */
  platformId: string;
  /** Display name, e.g. "Twitch" or "YouTube" */
  platformName: string;
  /** Env var that holds the stream key, e.g. "TWITCH_STREAM_KEY" */
  streamKeyEnvVar: string;
  /** Default RTMP ingest URL for this platform */
  defaultRtmpUrl: string;
  /** Optional env var for a custom RTMP URL (YouTube supports this) */
  rtmpUrlEnvVar?: string;
  /** Override the ElizaOS plugin name (defaults to `${platformId}-streaming`) */
  pluginName?: string;
}

// ── Destination factory ─────────────────────────────────────────────────────

export function createStreamingDestination(
  cfg: StreamingPluginConfig,
  overrides?: { streamKey?: string; rtmpUrl?: string },
): StreamingDestination {
  return {
    id: cfg.platformId,
    name: cfg.platformName,

    async getCredentials() {
      const streamKey = (
        overrides?.streamKey ??
        process.env[cfg.streamKeyEnvVar] ??
        ""
      ).trim();
      if (!streamKey) {
        throw new Error(`${cfg.platformName} stream key not configured`);
      }

      const rtmpUrl = (
        overrides?.rtmpUrl ??
        (cfg.rtmpUrlEnvVar ? process.env[cfg.rtmpUrlEnvVar] : undefined) ??
        cfg.defaultRtmpUrl
      ).trim();

      return { rtmpUrl, rtmpKey: streamKey };
    },
    // Platforms detect stream automatically via RTMP ingest -- no API calls needed
  };
}

// ── Plugin factory ──────────────────────────────────────────────────────────

/**
 * Build a complete ElizaOS Plugin for a streaming destination.
 *
 * Returns:
 *  - `plugin`  -- the Plugin object to register with ElizaOS
 *  - `createDestination` -- the destination factory (for the streaming pipeline)
 */
export function createStreamingPlugin(cfg: StreamingPluginConfig): {
  plugin: Plugin;
  createDestination: (overrides?: {
    streamKey?: string;
    rtmpUrl?: string;
  }) => StreamingDestination;
} {
  const LOCAL_API_PORT = Number(
    process.env.SERVER_PORT || process.env.PORT || "2138",
  );

  const UPPER = cfg.platformName.toUpperCase();
  const NAME = cfg.platformName;

  // -- helpers ----------------------------------------------------------------

  const validate = async (): Promise<boolean> => {
    const key = (process.env[cfg.streamKeyEnvVar] ?? "").trim();
    return !!key;
  };

  // -- actions ----------------------------------------------------------------

  const startAction: Action = {
    name: `START_${UPPER}_STREAM`,
    description: `Start streaming to ${NAME}. Initiates the RTMP pipeline with browser capture.`,
    similes: [
      `GO_LIVE_${UPPER}`,
      `START_${UPPER}`,
      `BEGIN_${UPPER}_STREAM`,
      `${UPPER}_GO_LIVE`,
    ],
    parameters: [],
    validate,

    handler: async (
      _runtime: IAgentRuntime,
      _message: Memory,
      _state: State | undefined,
      _options: Record<string, unknown> | undefined,
      callback?: HandlerCallback,
    ) => {
      try {
        const res = await fetch(
          `http://127.0.0.1:${LOCAL_API_PORT}/api/stream/live`,
          { method: "POST", signal: AbortSignal.timeout(30_000) },
        );
        const data = (await res.json()) as Record<string, unknown>;
        if (callback) {
          await callback({
            text: data.ok
              ? `${NAME} stream started successfully! We're live.`
              : `Failed to start ${NAME} stream: ${data.error ?? "unknown error"}`,
            actions: [],
          } as Content);
        }
        return { success: !!data.ok };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (callback) {
          await callback({
            text: `Error starting ${NAME} stream: ${msg}`,
            actions: [],
          } as Content);
        }
        return { success: false };
      }
    },

    examples: [
      [
        {
          name: "{{user1}}",
          content: { text: `Go live on ${NAME}` },
        } as ActionExample,
        {
          name: "{{agent}}",
          content: {
            text: `Starting the ${NAME} stream now.`,
            actions: [`START_${UPPER}_STREAM`],
          },
        } as ActionExample,
      ],
    ],
  };

  const stopAction: Action = {
    name: `STOP_${UPPER}_STREAM`,
    description: `Stop the active ${NAME} stream. Shuts down the FFmpeg pipeline.`,
    similes: [
      `GO_OFFLINE_${UPPER}`,
      `STOP_${UPPER}`,
      `END_${UPPER}_STREAM`,
      `${UPPER}_GO_OFFLINE`,
    ],
    parameters: [],
    validate,

    handler: async (
      _runtime: IAgentRuntime,
      _message: Memory,
      _state: State | undefined,
      _options: Record<string, unknown> | undefined,
      callback?: HandlerCallback,
    ) => {
      try {
        const res = await fetch(
          `http://127.0.0.1:${LOCAL_API_PORT}/api/stream/offline`,
          { method: "POST", signal: AbortSignal.timeout(15_000) },
        );
        const data = (await res.json()) as Record<string, unknown>;
        if (callback) {
          await callback({
            text: data.ok
              ? `${NAME} stream stopped. We're offline now.`
              : `Failed to stop ${NAME} stream: ${data.error ?? "unknown error"}`,
            actions: [],
          } as Content);
        }
        return { success: !!data.ok };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (callback) {
          await callback({
            text: `Error stopping ${NAME} stream: ${msg}`,
            actions: [],
          } as Content);
        }
        return { success: false };
      }
    },

    examples: [
      [
        {
          name: "{{user1}}",
          content: { text: `Stop the ${NAME} stream` },
        } as ActionExample,
        {
          name: "{{agent}}",
          content: {
            text: "Stopping the stream now.",
            actions: [`STOP_${UPPER}_STREAM`],
          },
        } as ActionExample,
      ],
    ],
  };

  const statusAction: Action = {
    name: `GET_${UPPER}_STREAM_STATUS`,
    description: `Check the current status of the ${NAME} stream (running, uptime, frame count, etc).`,
    similes: [
      `${UPPER}_STATUS`,
      `${UPPER}_STREAM_STATUS`,
      `IS_${UPPER}_LIVE`,
      `CHECK_${UPPER}_STREAM`,
    ],
    parameters: [],
    validate,

    handler: async (
      _runtime: IAgentRuntime,
      _message: Memory,
      _state: State | undefined,
      _options: Record<string, unknown> | undefined,
      callback?: HandlerCallback,
    ) => {
      try {
        const res = await fetch(
          `http://127.0.0.1:${LOCAL_API_PORT}/api/stream/status`,
          { signal: AbortSignal.timeout(10_000) },
        );
        const data = (await res.json()) as Record<string, unknown>;
        const status = data.running ? "LIVE" : "OFFLINE";
        const uptime = data.uptime
          ? `${Math.floor(Number(data.uptime) / 60)}m`
          : "n/a";
        if (callback) {
          await callback({
            text: `${NAME} stream status: ${status} | Uptime: ${uptime} | Destination: ${NAME}`,
            actions: [],
          } as Content);
        }
        return { success: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (callback) {
          await callback({
            text: `Error checking ${NAME} stream status: ${msg}`,
            actions: [],
          } as Content);
        }
        return { success: false };
      }
    },

    examples: [
      [
        {
          name: "{{user1}}",
          content: { text: `Is the ${NAME} stream live?` },
        } as ActionExample,
        {
          name: "{{agent}}",
          content: {
            text: "Let me check the stream status.",
            actions: [`GET_${UPPER}_STREAM_STATUS`],
          },
        } as ActionExample,
      ],
    ],
  };

  // -- config env vars --------------------------------------------------------

  const configEntries: Record<string, string | null> = {
    [cfg.streamKeyEnvVar]: process.env[cfg.streamKeyEnvVar] ?? null,
  };
  if (cfg.rtmpUrlEnvVar) {
    configEntries[cfg.rtmpUrlEnvVar] = process.env[cfg.rtmpUrlEnvVar] ?? null;
  }

  // -- plugin -----------------------------------------------------------------

  const plugin: Plugin = {
    name: cfg.pluginName ?? `${cfg.platformId}-streaming`,
    description: `${NAME} RTMP streaming destination with agent stream control actions`,

    get config() {
      return configEntries;
    },

    actions: [startAction, stopAction, statusAction],

    async init(_config: Record<string, string>, _runtime: IAgentRuntime) {
      const streamKey = (
        _config[cfg.streamKeyEnvVar] ??
        process.env[cfg.streamKeyEnvVar] ??
        ""
      ).trim();
      if (!streamKey) {
        // Plugin loaded but no stream key -- actions will fail validation gracefully
        return;
      }
    },
  };

  // -- public API -------------------------------------------------------------

  const createDestination = (overrides?: {
    streamKey?: string;
    rtmpUrl?: string;
  }) => createStreamingDestination(cfg, overrides);

  return { plugin, createDestination };
}
