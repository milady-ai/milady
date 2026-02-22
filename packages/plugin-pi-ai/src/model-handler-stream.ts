import type {
  GenerateTextParams,
  IAgentRuntime,
  JsonValue,
  TextStreamResult,
  TokenUsage,
} from "@elizaos/core";
import {
  type Api,
  type Context,
  type Model,
  stream,
} from "@mariozechner/pi-ai";
import type {
  PiAiHandlerConfig,
  StreamEventCallback,
} from "./model-handler-types.js";

function elizaParamsToPiAiContext(params: GenerateTextParams): Context {
  return {
    systemPrompt: "",
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: params.prompt }],
        timestamp: Date.now(),
      },
    ],
  };
}

function usageToEliza(usage: {
  input: number;
  output: number;
  totalTokens: number;
}): TokenUsage {
  return {
    promptTokens: usage.input,
    completionTokens: usage.output,
    totalTokens: usage.totalTokens,
  };
}

function toStreamEventUsage(usage: {
  input: number;
  output: number;
  totalTokens: number;
}): { inputTokens: number; outputTokens: number; totalTokens: number } {
  return {
    inputTokens: usage.input,
    outputTokens: usage.output,
    totalTokens: usage.totalTokens,
  };
}

function extractAbortSignal(
  params: Record<string, JsonValue | object>,
  getAbortSignal?: () => AbortSignal | undefined,
): AbortSignal | undefined {
  const fromGetter = getAbortSignal?.();
  if (fromGetter) return fromGetter;

  const maybe = (params as unknown as { abortSignal?: AbortSignal })
    .abortSignal;
  return maybe;
}

function isAbortedReason(reason: string | undefined): boolean {
  return reason === "aborted";
}

function emitToken(
  onStreamEvent: StreamEventCallback | undefined,
  text: string,
): void {
  onStreamEvent?.({ type: "token", text });
}

function emitThinking(
  onStreamEvent: StreamEventCallback | undefined,
  text: string,
): void {
  onStreamEvent?.({ type: "thinking", text });
}

function emitUsage(
  onStreamEvent: StreamEventCallback | undefined,
  usage: { input: number; output: number; totalTokens: number },
): void {
  onStreamEvent?.({ type: "usage", usage: toStreamEventUsage(usage) });
}

function emitDone(
  onStreamEvent: StreamEventCallback | undefined,
  reason?: string,
): void {
  onStreamEvent?.({ type: "done", reason });
}

function emitError(
  onStreamEvent: StreamEventCallback | undefined,
  error: string,
  reason?: string,
): void {
  onStreamEvent?.({ type: "error", error, reason });
}

function formatStreamFailure(
  model: Model<Api>,
  apiKey: string | undefined,
  err: unknown,
): Error {
  const msg = err instanceof Error ? err.message : String(err);
  return new Error(
    `pi-ai stream() failed (provider=${model.provider}, model=${model.id}, apiKey=${apiKey ? "set" : "missing"}): ${msg}`,
  );
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

type PiAiModelHandler = (
  runtime: IAgentRuntime,
  params: Record<string, JsonValue | object>,
) => Promise<JsonValue | object>;

export function createPiAiHandler(
  getModel: () => Model<Api>,
  config: PiAiHandlerConfig,
  streamImpl: typeof stream = stream,
): PiAiModelHandler {
  return async (
    _runtime: IAgentRuntime,
    params: Record<string, JsonValue | object>,
  ): Promise<JsonValue | object> => {
    const p = params as unknown as GenerateTextParams;
    const model = getModel();
    const context = elizaParamsToPiAiContext(p);

    const signal = extractAbortSignal(params, config.getAbortSignal);
    const apiKey = await config.getApiKey?.(model.provider);

    const wantsTextStreamResult =
      Boolean(p.stream) && config.returnTextStreamResult === true;
    const streamRequested = typeof p.onStreamChunk === "function";
    const hasTuiListener = typeof config.onStreamEvent === "function";
    const shouldStream =
      config.forceStreaming === true ||
      wantsTextStreamResult ||
      streamRequested ||
      hasTuiListener;

    const makeStream = () =>
      streamImpl(model, context, {
        temperature: p.temperature,
        maxTokens: p.maxTokens,
        signal,
        ...(apiKey ? { apiKey } : {}),
      });

    if (!shouldStream) {
      let fullText = "";

      try {
        for await (const event of makeStream()) {
          switch (event.type) {
            case "text_delta":
              fullText += event.delta;
              break;
            case "error": {
              if (isAbortedReason(event.reason)) return fullText;
              throw new Error(event.error.errorMessage ?? "Model stream error");
            }
          }
        }
      } catch (err) {
        throw formatStreamFailure(model, apiKey, err);
      }

      return fullText;
    }

    if (p.stream && config.returnTextStreamResult) {
      let fullText = "";
      let resolvedUsage: TokenUsage | undefined;
      let finishReason: string | undefined;

      const text = createDeferred<string>();
      const usage = createDeferred<TokenUsage | undefined>();
      const finishReasonDeferred = createDeferred<string | undefined>();

      async function* textStreamGenerator() {
        try {
          for await (const event of makeStream()) {
            switch (event.type) {
              case "text_delta": {
                const delta = event.delta;
                fullText += delta;
                if (p.onStreamChunk) {
                  await p.onStreamChunk(delta);
                }
                emitToken(config.onStreamEvent, delta);
                yield delta;
                break;
              }
              case "thinking_delta": {
                emitThinking(config.onStreamEvent, event.delta);
                break;
              }
              case "done": {
                finishReason = event.reason;
                resolvedUsage = usageToEliza(event.message.usage);
                emitUsage(config.onStreamEvent, event.message.usage);
                emitDone(config.onStreamEvent);
                break;
              }
              case "error": {
                finishReason = event.reason;

                if (isAbortedReason(event.reason)) {
                  emitDone(config.onStreamEvent, event.reason);
                } else {
                  emitError(
                    config.onStreamEvent,
                    event.error.errorMessage ?? "Model stream error",
                    event.reason,
                  );
                }

                break;
              }
            }
          }
        } finally {
          text.resolve(fullText);
          usage.resolve(resolvedUsage);
          finishReasonDeferred.resolve(finishReason);
        }
      }

      const result: TextStreamResult = {
        textStream: textStreamGenerator(),
        text: text.promise,
        usage: usage.promise,
        finishReason: finishReasonDeferred.promise,
      };

      return result;
    }

    let fullText = "";

    try {
      for await (const event of makeStream()) {
        switch (event.type) {
          case "text_delta": {
            const delta = event.delta;
            fullText += delta;
            if (p.onStreamChunk) {
              await p.onStreamChunk(delta);
            }
            emitToken(config.onStreamEvent, delta);
            break;
          }
          case "thinking_delta": {
            emitThinking(config.onStreamEvent, event.delta);
            break;
          }
          case "done": {
            emitUsage(config.onStreamEvent, event.message.usage);
            emitDone(config.onStreamEvent);
            break;
          }
          case "error": {
            const errText = event.error.errorMessage ?? "Model stream error";

            if (isAbortedReason(event.reason)) {
              emitDone(config.onStreamEvent, event.reason);
              break;
            }

            emitError(config.onStreamEvent, errText, event.reason);

            if (!p.onStreamChunk && !config.onStreamEvent) {
              throw new Error(errText);
            }

            break;
          }
        }
      }
    } catch (err) {
      throw formatStreamFailure(model, apiKey, err);
    }

    return fullText;
  };
}
