import type { Api, Model } from "@mariozechner/pi-ai";

export interface StreamEvent {
  type: "token" | "thinking" | "done" | "error" | "usage";
  text?: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  error?: string;
  reason?: string;
}

export type StreamEventCallback = (event: StreamEvent) => void;

export interface PiAiConfig {
  /** pi-ai model for TEXT_LARGE */
  largeModel: Model<Api>;
  /** pi-ai model for TEXT_SMALL */
  smallModel: Model<Api>;
  /** Optional: callback for streaming events (for TUI display) */
  onStreamEvent?: StreamEventCallback;
  /** Optional: signal provider for aborting in-flight requests */
  getAbortSignal?: () => AbortSignal | undefined;
  /**
   * Optional API key resolver.
   *
   * This is important for OAuth-backed providers (e.g. openai-codex) where
   * the token is not available via process.env.
   */
  getApiKey?: (
    provider: string,
  ) => Promise<string | undefined> | string | undefined;
  /**
   * Whether to return an ElizaOS TextStreamResult object when params.stream === true.
   */
  returnTextStreamResult?: boolean;
  /**
   * Force using pi-ai's streaming API internally (stream()) even when ElizaOS
   * did not explicitly request streaming.
   */
  forceStreaming?: boolean;
  /** Provider label in ElizaOS model registry */
  providerName?: string;
  /** Additional provider aliases to register under. */
  providerAliases?: string[];
  /** Priority used by ElizaOS when multiple handlers are registered */
  priority?: number;
}

export interface PiAiModelHandlerController {
  getLargeModel(): Model<Api>;
  setLargeModel(model: Model<Api>): void;
  getSmallModel(): Model<Api>;
  setSmallModel(model: Model<Api>): void;
}

export type PiAiHandlerConfig = Pick<
  PiAiConfig,
  | "onStreamEvent"
  | "getAbortSignal"
  | "getApiKey"
  | "returnTextStreamResult"
  | "forceStreaming"
>;
