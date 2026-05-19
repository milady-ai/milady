export type VoiceCaptureBackend = "browser";

export interface VoiceCaptureTranscriptSegment {
  text: string;
  final: boolean;
  backend: VoiceCaptureBackend;
}

export type VoiceCaptureState =
  | "idle"
  | "starting"
  | "listening"
  | "stopped"
  | "error";

export interface VoiceCaptureFactoryOptions {
  onTranscript: (segment: VoiceCaptureTranscriptSegment) => void;
  onStateChange?: (state: VoiceCaptureState, error?: Error) => void;
}

export interface VoiceCaptureHandle {
  dispose: () => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error?: string; message?: string }) => void) | null;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<{
          0?: { transcript?: string };
          isFinal?: boolean;
        }>;
      }) => void)
    | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

function resolveSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as SpeechWindow;
  return (
    speechWindow.SpeechRecognition ??
    speechWindow.webkitSpeechRecognition ??
    null
  );
}

export function createVoiceCapture(
  options: VoiceCaptureFactoryOptions,
): VoiceCaptureHandle {
  let recognition: SpeechRecognitionLike | null = null;
  let disposed = false;

  function setState(state: VoiceCaptureState, error?: Error) {
    options.onStateChange?.(state, error);
  }

  function ensureRecognition(): SpeechRecognitionLike {
    if (disposed) {
      throw new Error("VoiceCapture handle has been disposed");
    }
    if (recognition) return recognition;

    const SpeechRecognition = resolveSpeechRecognition();
    if (!SpeechRecognition) {
      throw new Error("Browser speech recognition is not available");
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang =
      typeof navigator !== "undefined" && navigator.language
        ? navigator.language
        : "en-US";
    recognition.onresult = (event) => {
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index++
      ) {
        const result = event.results[index];
        const text = result?.[0]?.transcript?.trim() ?? "";
        if (!text) continue;
        options.onTranscript({
          backend: "browser",
          final: Boolean(result.isFinal),
          text,
        });
      }
    };
    recognition.onerror = (event) => {
      const detail = event.message ?? event.error ?? "speech recognition error";
      setState("error", new Error(detail));
    };
    recognition.onend = () => {
      setState("stopped");
    };
    return recognition;
  }

  return {
    dispose() {
      disposed = true;
      recognition?.stop();
      recognition = null;
      setState("idle");
    },
    async start() {
      setState("starting");
      try {
        ensureRecognition().start();
        setState("listening");
      } catch (error) {
        const normalized =
          error instanceof Error ? error : new Error(String(error));
        setState("error", normalized);
        throw normalized;
      }
    },
    async stop() {
      recognition?.stop();
      setState("stopped");
    },
  };
}
