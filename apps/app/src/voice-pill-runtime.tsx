import { client } from "@elizaos/app-core";
import { resolveApiUrl } from "@elizaos/app-core/utils";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import "./voice-pill-runtime.css";

export interface VoicePillMessage {
  id: string;
  role: "agent" | "user";
  text: string;
}

export interface VoicePillProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  recording?: boolean;
  onRecordingChange?: (recording: boolean) => void;
  messages?: VoicePillMessage[];
  placeholder?: string;
  onSubmit?: (text: string) => void;
  onAdd?: () => void;
  ariaLabel?: string;
  className?: string;
}

type VoiceCaptureBackend = "local-inference" | "browser";
type VoiceCaptureProvider =
  | VoiceCaptureBackend
  | "eliza-cloud"
  | "elevenlabs"
  | "openai";

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
  asrProvider?: VoiceCaptureProvider;
  lang?: string;
}

export interface VoiceCaptureHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): void;
  isActive(): boolean;
}

interface LocalAsrRecorder {
  stop(): Promise<Uint8Array>;
  cancel(): void;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionResultEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: {
    isFinal: boolean;
    0: { transcript: string; confidence: number };
  };
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;
type AudioContextConstructor = typeof AudioContext;
type WindowWithVoiceApis = Window & {
  AudioContext?: AudioContextConstructor;
  webkitAudioContext?: AudioContextConstructor;
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

const DEFAULT_PLACEHOLDER = "Ask Eliza...";
const DEFAULT_ARIA_LABEL = "Eliza";

function useControllable<T>(
  controlled: T | undefined,
  initial: T,
  onChange: ((next: T) => void) | undefined,
): [T, (next: T) => void] {
  const [internal, setInternal] = useState<T>(initial);
  const isControlled = controlled !== undefined;
  const value = isControlled ? (controlled as T) : internal;
  const setValue = useCallback(
    (next: T) => {
      if (!isControlled) {
        setInternal(next);
      }
      onChange?.(next);
    },
    [isControlled, onChange],
  );
  return [value, setValue];
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 12l16-8-6 16-3-7-7-1z" />
    </svg>
  );
}

export function VoicePill(props: VoicePillProps) {
  const {
    open: openProp,
    onOpenChange,
    recording: recordingProp,
    onRecordingChange,
    messages,
    placeholder = DEFAULT_PLACEHOLDER,
    onSubmit,
    onAdd,
    ariaLabel = DEFAULT_ARIA_LABEL,
    className,
  } = props;

  const [open, setOpen] = useControllable(openProp, false, onOpenChange);
  const [recording, setRecording] = useControllable(
    recordingProp,
    false,
    onRecordingChange,
  );
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const toggleOpen = useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  const handleHitClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (
        chatRef.current &&
        event.target instanceof Node &&
        chatRef.current.contains(event.target)
      ) {
        return;
      }
      toggleOpen();
    },
    [toggleOpen],
  );

  const handleHitKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleOpen();
      }
    },
    [toggleOpen],
  );

  const send = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onSubmit?.(trimmed);
    setInputValue("");
  }, [inputValue, onSubmit]);

  const stopPointer = useCallback(
    (event: MouseEvent<HTMLInputElement> | PointerEvent<HTMLInputElement>) => {
      event.stopPropagation();
    },
    [],
  );

  const wrapperClassName = className
    ? `elizaos-voice-pill ${className}`
    : "elizaos-voice-pill";
  const pillClassName = recording
    ? "elizaos-voice-pill__pill elizaos-voice-pill__pill--recording"
    : "elizaos-voice-pill__pill";
  const chatClassName = open
    ? "elizaos-voice-pill__chat"
    : "elizaos-voice-pill__chat elizaos-voice-pill__chat--collapsed";
  const micClassName = recording
    ? "elizaos-voice-pill__ctrl elizaos-voice-pill__ctrl--recording"
    : "elizaos-voice-pill__ctrl";

  return (
    <div className={wrapperClassName}>
      {/* biome-ignore lint/a11y/useSemanticElements: this hit area contains nested composer controls, so it cannot be a native button. */}
      <div
        className="elizaos-voice-pill__hit"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={handleHitClick}
        onKeyDown={handleHitKeyDown}
      >
        <div className={pillClassName} aria-hidden="true" />
        <div className={chatClassName} ref={chatRef}>
          {messages && messages.length > 0 ? (
            <div className="elizaos-voice-pill__messages">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "elizaos-voice-pill__msg elizaos-voice-pill__msg--user"
                      : "elizaos-voice-pill__msg elizaos-voice-pill__msg--agent"
                  }
                >
                  {message.text}
                </div>
              ))}
            </div>
          ) : null}
          <div className="elizaos-voice-pill__composer">
            <button
              type="button"
              className="elizaos-voice-pill__ctrl"
              aria-label="Add"
              onClick={(event) => {
                event.stopPropagation();
                onAdd?.();
              }}
            >
              <PlusIcon />
            </button>
            <button
              type="button"
              className={micClassName}
              aria-label={recording ? "Stop recording" : "Start recording"}
              aria-pressed={recording}
              onClick={(event) => {
                event.stopPropagation();
                setRecording(!recording);
              }}
            >
              <MicIcon />
            </button>
            <input
              ref={inputRef}
              className="elizaos-voice-pill__input"
              value={inputValue}
              placeholder={placeholder}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setInputValue(event.target.value)
              }
              onClick={stopPointer}
              onPointerDown={stopPointer}
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                event.stopPropagation();
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="button"
              className="elizaos-voice-pill__send"
              aria-label="Send"
              onClick={(event) => {
                event.stopPropagation();
                send();
              }}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getAudioContextCtor(): AudioContextConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const win = window as WindowWithVoiceApis;
  return win.AudioContext ?? win.webkitAudioContext;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const win = window as WindowWithVoiceApis;
  return win.SpeechRecognition ?? win.webkitSpeechRecognition;
}

function isLocalAsrCaptureSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    !!getAudioContextCtor()
  );
}

function resolveBackend(
  preferred: VoiceCaptureProvider | undefined,
): VoiceCaptureBackend {
  if (preferred === "browser") return "browser";
  if (preferred === "local-inference" || preferred === undefined) {
    if (isLocalAsrCaptureSupported()) return "local-inference";
  }
  return "browser";
}

function concatPcm(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeMonoPcm16Wav(
  pcm: Float32Array,
  sampleRateHz: number,
): Uint8Array {
  const sampleRate = Math.max(1, Math.round(sampleRateHz));
  const bytesPerSample = 2;
  const dataBytes = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (const sample of pcm) {
    const clamped = Math.max(
      -1,
      Math.min(1, Number.isFinite(sample) ? sample : 0),
    );
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, Math.round(int16), true);
    offset += bytesPerSample;
  }

  return new Uint8Array(buffer);
}

async function startLocalAsrRecorder(): Promise<LocalAsrRecorder> {
  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) {
    throw new Error("AudioContext is not available for local ASR capture");
  }
  if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
    throw new Error("Microphone capture is not available for local ASR");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const context = new AudioContextCtor();
  if (context.state === "suspended") {
    await context.resume().catch(() => {});
  }

  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let stopped = false;

  processor.onaudioprocess = (event) => {
    if (stopped) return;
    const input = event.inputBuffer;
    const frameCount = input.length;
    const channelCount = Math.max(1, input.numberOfChannels);
    const mono = new Float32Array(frameCount);

    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = input.getChannelData(channel);
      for (let index = 0; index < frameCount; index += 1) {
        mono[index] = (mono[index] ?? 0) + (data[index] ?? 0) / channelCount;
      }
    }
    chunks.push(mono);
  };

  source.connect(processor);
  processor.connect(context.destination);

  const cleanup = async () => {
    stopped = true;
    processor.onaudioprocess = null;
    try {
      source.disconnect();
    } catch {
      // already disconnected
    }
    try {
      processor.disconnect();
    } catch {
      // already disconnected
    }
    for (const track of stream.getTracks()) {
      track.stop();
    }
    await context.close().catch(() => {});
  };

  return {
    async stop() {
      const sampleRate = context.sampleRate;
      await cleanup();
      const pcm = concatPcm(chunks);
      if (pcm.length === 0) {
        throw new Error("No microphone audio was captured for local ASR");
      }
      return encodeMonoPcm16Wav(pcm, sampleRate);
    },
    cancel() {
      void cleanup();
    },
  };
}

async function transcribeLocalInferenceWav(audio: Uint8Array): Promise<string> {
  const audioBody = new ArrayBuffer(audio.byteLength);
  new Uint8Array(audioBody).set(audio);
  const headers: Record<string, string> = {
    "Content-Type": "audio/wav",
    Accept: "application/json",
  };
  const token = (
    client as {
      getRestAuthToken?: () => string | null;
    }
  ).getRestAuthToken?.();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(resolveApiUrl("/api/asr/local-inference"), {
    method: "POST",
    headers,
    body: audioBody,
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Local inference ASR ${res.status}: ${body.slice(0, 200)}`);
  }
  const parsed = (await res.json().catch(() => null)) as {
    text?: unknown;
  } | null;
  const text = typeof parsed?.text === "string" ? parsed.text.trim() : "";
  if (!text) {
    throw new Error("Local inference ASR returned an empty transcript");
  }
  return text;
}

export function createVoiceCapture(
  options: VoiceCaptureFactoryOptions,
): VoiceCaptureHandle {
  const { onTranscript, onStateChange, asrProvider, lang = "en-US" } = options;
  const backend = resolveBackend(asrProvider);
  let state: VoiceCaptureState = "idle";
  let active = false;
  let disposed = false;
  let recorder: LocalAsrRecorder | null = null;
  let recognition: SpeechRecognitionInstance | null = null;
  let browserStopWait: Promise<void> | null = null;
  let resolveBrowserStop: (() => void) | null = null;

  function setState(next: VoiceCaptureState, error?: Error): void {
    if (state === next) return;
    state = next;
    onStateChange?.(next, error);
  }

  async function startLocalInference(): Promise<void> {
    recorder = await startLocalAsrRecorder();
    active = true;
    setState("listening");
  }

  function startBrowser(): void {
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
    instance.onresult = (event: SpeechRecognitionResultEvent) => {
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];
        const text = result?.[0]?.transcript?.trim() ?? "";
        if (!text) continue;
        onTranscript({ text, final: result.isFinal, backend: "browser" });
      }
    };
    instance.onerror = (event: { error: string }) => {
      setState("error", new Error(`SpeechRecognition error: ${event.error}`));
    };
    instance.onend = () => {
      active = false;
      if (resolveBrowserStop) {
        const resolve = resolveBrowserStop;
        resolveBrowserStop = null;
        browserStopWait = null;
        resolve();
      }
    };

    recognition = instance;
    instance.start();
    active = true;
    setState("listening");
  }

  async function start(): Promise<void> {
    if (disposed) {
      throw new Error("VoiceCapture handle has been disposed");
    }
    if (active) return;
    setState("starting");
    try {
      if (backend === "local-inference") {
        await startLocalInference();
      } else {
        startBrowser();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState("error", error);
      throw error;
    }
  }

  async function stop(): Promise<void> {
    if (!active && state !== "starting") return;

    if (backend === "local-inference") {
      const current = recorder;
      recorder = null;
      active = false;
      if (!current) {
        setState("stopped");
        return;
      }
      try {
        const wav = await current.stop();
        const text = await transcribeLocalInferenceWav(wav);
        onTranscript({ text, final: true, backend: "local-inference" });
        setState("stopped");
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setState("error", error);
        throw error;
      }
      return;
    }

    const instance = recognition;
    if (!instance) {
      active = false;
      setState("stopped");
      return;
    }
    browserStopWait = new Promise<void>((resolve) => {
      resolveBrowserStop = resolve;
    });
    instance.stop();
    await browserStopWait;
    recognition = null;
    setState("stopped");
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (recorder) {
      recorder.cancel();
      recorder = null;
    }
    if (recognition) {
      try {
        recognition.abort();
      } finally {
        recognition = null;
      }
    }
    active = false;
    if (resolveBrowserStop) {
      const resolve = resolveBrowserStop;
      resolveBrowserStop = null;
      browserStopWait = null;
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
