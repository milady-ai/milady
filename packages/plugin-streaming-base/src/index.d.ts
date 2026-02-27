/**
 * Shared factory for RTMP streaming destination plugins.
 *
 * Both @milady/plugin-twitch-streaming and @milady/plugin-youtube-streaming
 * delegate to this factory to eliminate near-identical boilerplate for actions,
 * destination creation, and plugin wiring.
 */
import type { Plugin } from "@elizaos/core";
export interface StreamingDestination {
  id: string;
  name: string;
  getCredentials(): Promise<{
    rtmpUrl: string;
    rtmpKey: string;
  }>;
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
export declare function createStreamingDestination(
  cfg: StreamingPluginConfig,
  overrides?: {
    streamKey?: string;
    rtmpUrl?: string;
  },
): StreamingDestination;
/**
 * Build a complete ElizaOS Plugin for a streaming destination.
 *
 * Returns:
 *  - `plugin`  -- the Plugin object to register with ElizaOS
 *  - `createDestination` -- the destination factory (for the streaming pipeline)
 */
export declare function createStreamingPlugin(cfg: StreamingPluginConfig): {
  plugin: Plugin;
  createDestination: (overrides?: {
    streamKey?: string;
    rtmpUrl?: string;
  }) => StreamingDestination;
};
//# sourceMappingURL=index.d.ts.map
