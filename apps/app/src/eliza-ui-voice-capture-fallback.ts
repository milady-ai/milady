export type VoiceCaptureBackend = "browser";

export type VoiceCaptureState =
  | "idle"
  | "starting"
  | "listening"
  | "stopped"
  | "error";

export interface VoiceCaptureTranscriptSegment {
  text: string;
  final: boolean;
  backend: VoiceCaptureBackend;
}

export interface VoiceCaptureFactoryOptions {
  onTranscript: (segment: VoiceCaptureTranscriptSegment) => void;
  onStateChange?: (state: VoiceCaptureState, error?: Error) => void;
  lang?: string;
}

export interface VoiceCaptureHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): void;
  isActive(): boolean;
}

type BrowserSpeechRecognitionAlternative = {
  transcript?: string;
};

type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  0?: BrowserSpeechRecognitionAlternative;
};

type BrowserSpeechRecognitionResultEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: BrowserSpeechRecognitionResult | undefined;
  };
};

type BrowserSpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognitionInstance;

function getSpeechRecognitionCtor(): BrowserSpeechRecognitionCtor | null {
  const host = globalThis as typeof globalThis & {
    SpeechRecognition?: BrowserSpeechRecognitionCtor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

export function createVoiceCapture(
  options: VoiceCaptureFactoryOptions,
): VoiceCaptureHandle {
  const { onTranscript, onStateChange, lang = "en-US" } = options;
  let state: VoiceCaptureState = "idle";
  let active = false;
  let disposed = false;
  let recognition: BrowserSpeechRecognitionInstance | null = null;
  let stopWait: Promise<void> | null = null;
  let resolveStop: (() => void) | null = null;

  function setState(next: VoiceCaptureState, error?: Error): void {
    if (state === next) return;
    state = next;
    onStateChange?.(next, error);
  }

  async function start(): Promise<void> {
    if (disposed) {
      throw new Error("VoiceCapture handle has been disposed");
    }
    if (active) return;
    setState("starting");
    try {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        throw new Error(
          "Browser SpeechRecognition API is not available in this renderer",
        );
      }
      const instance = new Ctor();
      instance.continuous = true;
      instance.interimResults = true;
      instance.lang = lang;
      instance.onresult = (event) => {
        for (
          let index = event.resultIndex;
          index < event.results.length;
          index += 1
        ) {
          const result = event.results[index];
          const text = result?.[0]?.transcript?.trim() ?? "";
          if (!result || !text) continue;
          onTranscript({ text, final: result.isFinal, backend: "browser" });
        }
      };
      instance.onerror = (event) => {
        setState("error", new Error(`SpeechRecognition error: ${event.error}`));
      };
      instance.onend = () => {
        active = false;
        if (resolveStop) {
          const resolve = resolveStop;
          resolveStop = null;
          stopWait = null;
          resolve();
        }
      };
      recognition = instance;
      instance.start();
      active = true;
      setState("listening");
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState("error", error);
      throw error;
    }
  }

  async function stop(): Promise<void> {
    if (!active && state !== "starting") return;
    const instance = recognition;
    if (!instance) {
      active = false;
      setState("stopped");
      return;
    }
    stopWait = new Promise<void>((resolve) => {
      resolveStop = resolve;
    });
    instance.stop();
    await stopWait;
    recognition = null;
    setState("stopped");
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (recognition) {
      try {
        recognition.abort();
      } finally {
        recognition = null;
      }
    }
    active = false;
    if (resolveStop) {
      const resolve = resolveStop;
      resolveStop = null;
      stopWait = null;
      resolve();
    }
    setState("idle");
  }

  return {
    start,
    stop,
    dispose,
    isActive: () => active,
  };
}
