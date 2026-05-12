// Llama wrapper that the @elizaos/plugin-ios-bun-bridge imports. Shapes
// match the LocalInferenceLoader contract that @elizaos/app-core expects.

import { getBridge } from "./bridge.js";

export interface IosLlamaLoadOpts {
  modelPath: string;
  contextSize?: number;
  useGpu?: boolean;
  threads?: number;
}

export interface IosLlamaGenerateOpts {
  contextId: number;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  onToken?: (token: string, isLast: boolean) => void;
}

export interface IosLlamaGenerateResult {
  text: string;
  promptTokens: number;
  outputTokens: number;
  durationMs: number;
}

export interface IosLlamaHandle {
  contextId: number;
  generate(opts: Omit<IosLlamaGenerateOpts, "contextId">): Promise<IosLlamaGenerateResult>;
  cancel(): void;
  free(): void;
}

export interface IosLlamaHardwareInfo {
  backend: "metal" | "cpu";
  totalRamGb: number;
  availableRamGb: number;
  cpuCores: number;
  isSimulator: boolean;
  metalSupported: boolean;
}

let _streamTokenSeq = 0;

export async function loadLlama(opts: IosLlamaLoadOpts): Promise<IosLlamaHandle> {
  const result = await getBridge().llama_load_model({
    path: opts.modelPath,
    context_size: opts.contextSize,
    use_gpu: opts.useGpu,
    threads: opts.threads,
  });
  if ("error" in result) throw new Error(result.error);
  const contextId = result.context_id;

  return {
    contextId,
    async generate(g: Omit<IosLlamaGenerateOpts, "contextId">): Promise<IosLlamaGenerateResult> {
      let streamToken: string | undefined;
      if (g.onToken) {
        streamToken = `llama-stream-${++_streamTokenSeq}`;
        getBridge().llama_register_stream_callback(streamToken, (tok, isLast) => {
          g.onToken!(tok, isLast);
        });
      }
      const res = await getBridge().llama_generate({
        context_id: contextId,
        prompt: g.prompt,
        max_tokens: g.maxTokens,
        temperature: g.temperature,
        top_p: g.topP,
        stop: g.stop,
        stream_callback_token: streamToken,
      });
      if ("error" in res) throw new Error(res.error);
      return {
        text: res.text,
        promptTokens: res.prompt_tokens,
        outputTokens: res.output_tokens,
        durationMs: res.duration_ms,
      };
    },
    cancel(): void {
      getBridge().llama_cancel(contextId);
    },
    free(): void {
      getBridge().llama_free(contextId);
    },
  };
}

export function llamaHardwareInfo(): IosLlamaHardwareInfo {
  const info = getBridge().llama_hardware_info();
  return {
    backend: info.backend,
    totalRamGb: info.total_ram_gb,
    availableRamGb: info.available_ram_gb,
    cpuCores: info.cpu_cores,
    isSimulator: info.is_simulator,
    metalSupported: info.metal_supported,
  };
}

// Adapter to the @elizaos/app-core LocalInferenceLoader shape. The app-core
// loader expects: `load(modelPath, opts) -> Engine` where Engine has
// `generate(prompt, opts) -> { text, ... }`. We re-package.
export interface AppCoreEngine {
  generate(prompt: string, opts?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stop?: string[];
    onToken?: (token: string, isLast: boolean) => void;
  }): Promise<{ text: string; promptTokens: number; outputTokens: number; durationMs: number }>;
  cancel(): void;
  free(): void;
}

export async function createAppCoreEngine(
  modelPath: string,
  opts: Omit<IosLlamaLoadOpts, "modelPath"> = {},
): Promise<AppCoreEngine> {
  const handle = await loadLlama({ modelPath, ...opts });
  return {
    generate(prompt: string, gopts) {
      return handle.generate({
        prompt,
        maxTokens: gopts?.maxTokens,
        temperature: gopts?.temperature,
        topP: gopts?.topP,
        stop: gopts?.stop,
        onToken: gopts?.onToken,
      });
    },
    cancel: () => handle.cancel(),
    free: () => handle.free(),
  };
}

export default {
  loadLlama,
  llamaHardwareInfo,
  createAppCoreEngine,
};
