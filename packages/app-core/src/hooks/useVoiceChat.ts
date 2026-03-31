/**
 * Bidirectional voice hook for chat + avatar lip sync.
 *
 * TTS providers (in priority order):
 *  1. ElevenLabs  — streaming endpoint; assistant replies enqueue text deltas as
 *     the stream grows (no sentence-boundary wait — lower time-to-first-audio).
 *  2. Browser SpeechSynthesis — fallback when ElevenLabs isn't configured.
 *
 * STT: Web Speech API (SpeechRecognition) for user voice input.
 */

import type { PluginListenerHandle } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { sanitizeSpeechText } from "@miladyai/shared/spoken-text";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import type { VoiceConfig, VoiceMode } from "../api/client";
import {
  getElectrobunRendererRpc,
  invokeDesktopBridgeRequest,
} from "../bridge/electrobun-rpc";
import {
  getTalkModePlugin,
  type TalkModeErrorEvent,
  type TalkModeStateEvent,
  type TalkModeTranscriptEvent,
} from "../bridge/native-plugins";
import { resolveApiUrl } from "../utils";
import { getElizaApiToken } from "../utils/eliza-globals";
import {
  isMiladyTtsDebugEnabled,
  miladyTtsDebug,
  miladyTtsDebugTextPreview,
} from "../utils/milady-tts-debug";
import { mergeStreamingText } from "../utils/streaming-text";
import { hasConfiguredApiKey } from "../voice";

// ── Speech Recognition types ──────────────────────────────────────────

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
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

let sharedAudioCtx: AudioContext | null = null;

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface WindowWithSpeechRecognition extends Window {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

/** Access browser SpeechRecognition APIs which may live under a vendor prefix. */
function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  const w = window as WindowWithSpeechRecognition;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

// ── Public types ──────────────────────────────────────────────────────

type SpeechSegmentKind = "full" | "first-sentence" | "remainder";
type SpeechProviderKind = "elevenlabs" | "browser";
export type VoiceCaptureMode = "idle" | "compose" | "push-to-talk";

export interface VoicePlaybackStartEvent {
  text: string;
  segment: SpeechSegmentKind;
  provider: SpeechProviderKind;
  cached: boolean;
  startedAtMs: number;
}

export interface VoiceTranscriptPreviewEvent {
  mode: Exclude<VoiceCaptureMode, "idle">;
  isFinal: boolean;
}

export interface VoiceChatOptions {
  /** Called when a final transcript is ready to send */
  onTranscript: (text: string) => void;
  /** Called whenever the live transcript buffer changes */
  onTranscriptPreview?: (
    text: string,
    event: VoiceTranscriptPreviewEvent,
  ) => void;
  /** Called when playback of a speech segment starts */
  onPlaybackStart?: (event: VoicePlaybackStartEvent) => void;
  /** True when Eliza Cloud-managed voice access is available */
  cloudConnected?: boolean;
  /** Whether user speech should immediately interrupt assistant playback */
  interruptOnSpeech?: boolean;
  /** Language for speech recognition (default: "en-US") */
  lang?: string;
  /** Saved voice configuration — switches TTS provider when set */
  voiceConfig?: VoiceConfig | null;
}

export interface VoiceChatState {
  /** Whether voice input is currently active */
  isListening: boolean;
  /** Current mic capture mode */
  captureMode: VoiceCaptureMode;
  /** Whether the agent is currently speaking */
  isSpeaking: boolean;
  /** Current mouth openness (0-1) for lip sync */
  mouthOpen: number;
  /** Current interim transcript being recognized */
  interimTranscript: string;
  /** Whether Web Speech API is supported */
  supported: boolean;
  /** True when using real audio analysis (ElevenLabs) for mouth */
  usingAudioAnalysis: boolean;
  /** Toggle voice listening on/off */
  toggleListening: () => void;
  /** Begin voice capture in compose or push-to-talk mode */
  startListening: (mode?: Exclude<VoiceCaptureMode, "idle">) => Promise<void>;
  /** End voice capture and optionally submit the transcript */
  stopListening: (options?: { submit?: boolean }) => Promise<void>;
  /** Speak text aloud with mouth animation */
  speak: (text: string, options?: { append?: boolean }) => void;
  /** Progressively speak an assistant message while it streams */
  queueAssistantSpeech: (
    messageId: string,
    text: string,
    isFinal: boolean,
  ) => void;
  /** Stop any current speech */
  stopSpeaking: () => void;
  /** Increments when AudioContext is unlocked by a user gesture, allowing callers to retry speech that was silently blocked by autoplay policy. */
  voiceUnlockedGeneration: number;
  /**
   * Assistant reply TTS: `enhanced` = ElevenLabs path (own key, cloud proxy, or direct);
   * `standard` = browser / Edge voices or non-ElevenLabs provider.
   */
  assistantTtsQuality: "enhanced" | "standard";
}

interface SpeakTask {
  text: string;
  append: boolean;
  segment: SpeechSegmentKind;
  cacheKey?: string;
  /** Milady-only: sent as `x-milady-tts-*` headers on `/api/tts/*` when debug is on (never forwarded to Eliza Cloud). */
  debugUtteranceContext?: {
    messageId: string;
    fullAssistTextPreview: string;
  };
}

interface AssistantSpeechState {
  messageId: string;
  /** Speakable text already submitted to the playback queue (prefix of current stream). */
  queuedSpeakablePrefix: string;
  /** Latest speakable from the stream (debounce flush reads this). */
  latestSpeakable: string;
  finalQueued: boolean;
}

const DEFAULT_ELEVEN_MODEL = "eleven_flash_v2_5";
const DEFAULT_ELEVEN_VOICE = "EXAVITQu4vr4xnSDxMaL";
const MAX_SPOKEN_CHARS = 360;
const MAX_CACHED_SEGMENTS = 128;
/** First assistant clip: start synthesis after this much speakable text (avoids one-word TTS). */
const ASSISTANT_TTS_FIRST_FLUSH_CHARS = 24;
/** Later clips: batch for better prosody (avoid token-thin slices). */
const ASSISTANT_TTS_MIN_CHUNK_CHARS = 88;
/** Merge rapid stream deltas into one request after a short pause. */
const ASSISTANT_TTS_DEBOUNCE_MS = 170;
/**
 * Temporary safety switch:
 * only speak assistant replies once the final text has arrived.
 *
 * This avoids garbled overlap when cloud text streaming and speech playback
 * race each other on partial chunks.
 */
const ASSISTANT_TTS_FINAL_ONLY = true;
const TALKMODE_STOP_SETTLE_MS = 120;
const REDACTED_SECRET = "[REDACTED]";
const MOUTH_OPEN_STEP = 0.02;

const globalAudioCache = new Map<string, Uint8Array>();

function resolveVoiceMode(
  mode: VoiceMode | undefined,
  _cloudConnected: boolean,
  _apiKey?: string | null,
): VoiceMode {
  if (mode) return mode;
  // Always use the ElevenLabs proxy path ("own-key") — the server aliases the
  // cloud API key to ELEVENLABS_API_KEY at startup so upstream Eliza can use
  // it.  The "cloud" path converts ElevenLabs voice IDs to OpenAI-style names
  // (nova, alloy, etc.) which produces wrong audio (default sample clips).
  return "own-key";
}

function resolveVoiceProxyEndpoint(mode: VoiceMode): string {
  return resolveApiUrl(
    mode === "cloud" ? "/api/tts/cloud" : "/api/tts/elevenlabs",
  );
}

/** For MILADY_TTS_DEBUG: shows whether cloud TTS hits the API or the wrong (page) origin. */
function describeTtsCloudFetchTargetForDebug(): string {
  const target = resolveApiUrl("/api/tts/cloud");
  if (/^https?:\/\//i.test(target)) {
    try {
      return `${new URL(target).origin} (absolute)`;
    } catch {
      return target.slice(0, 120);
    }
  }
  const origin =
    typeof window !== "undefined" ? window.location.origin : "(no-window)";
  const path = target.startsWith("/") ? target : `/${target}`;
  return `${origin}${path} — relative URL (TTS fetch goes to the UI host, not the Milady API). Set __MILADY_API_BASE__ / session milady_api_base / boot apiBase to http://127.0.0.1:<apiPort>`;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out.buffer;
}

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function normalizeTranscriptWord(word: string): string {
  return word
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function mergeTranscriptWindows(existing: string, incoming: string): string {
  const left = collapseWhitespace(existing);
  const right = collapseWhitespace(incoming);

  if (!left) return right;
  if (!right) return left;

  const exactMerged = mergeStreamingText(left, right);
  if (
    exactMerged === right ||
    exactMerged === left ||
    exactMerged === `${left}${right}`
  ) {
    const leftWords = left.split(" ");
    const rightWords = right.split(" ");
    const maxOverlap = Math.min(leftWords.length, rightWords.length);

    for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
      let matches = true;
      for (let index = 0; index < overlap; index += 1) {
        const leftWord = normalizeTranscriptWord(
          leftWords[leftWords.length - overlap + index] ?? "",
        );
        const rightWord = normalizeTranscriptWord(rightWords[index] ?? "");
        if (!leftWord || !rightWord || leftWord !== rightWord) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;

      if (overlap === rightWords.length) {
        return left;
      }
      return [...leftWords, ...rightWords.slice(overlap)].join(" ");
    }
  }

  return exactMerged;
}

function normalizeMouthOpen(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  const stepped = Math.round(clamped / MOUTH_OPEN_STEP) * MOUTH_OPEN_STEP;
  return stepped < MOUTH_OPEN_STEP ? 0 : Math.min(1, stepped);
}

export function nextIdleMouthOpen(currentValue: number): number {
  const current = normalizeMouthOpen(currentValue);
  if (current <= MOUTH_OPEN_STEP) {
    return 0;
  }
  return Math.max(0, Math.min(current * 0.85, current - MOUTH_OPEN_STEP));
}

function normalizeCacheText(input: string): string {
  // Preserve punctuation while normalizing spacing/casing.
  return collapseWhitespace(input.normalize("NFKC")).toLowerCase();
}

function isRedactedSecret(value: unknown): boolean {
  return (
    typeof value === "string" && value.trim().toUpperCase() === REDACTED_SECRET
  );
}

function capSpeechLength(input: string): string {
  if (input.length <= MAX_SPOKEN_CHARS) return input;
  const clipped = input.slice(0, MAX_SPOKEN_CHARS);
  const splitAt = clipped.lastIndexOf(" ");
  const body = splitAt > 120 ? clipped.slice(0, splitAt) : clipped;
  return `${body.trim()}...`;
}

/**
 * Hidden XML block tags whose content should never be spoken.  During
 * streaming the closing tag may not have arrived yet, so we strip from
 * the opening tag to end-of-string (matching the display path's
 * `HIDDEN_XML_BLOCK_RE` which uses `(?:</tag>|$)`).
 *
 * The upstream `sanitizeSpeechText` only strips *closed* `<think>` blocks,
 * so an in-progress `<think>reasoning so far` leaks "reasoning so far"
 * into the voice output.  We handle it here before sanitization.
 */
const HIDDEN_VOICE_BLOCK_RE =
  /<(think|thought|analysis|reasoning|scratchpad|tool_calls?|tools?)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/gi;

function extractVoiceText(input: string): string {
  let text = input;

  // Extract <text> content from <response> wrappers the same way the display
  // path does — otherwise the voice may try to speak tag names like "response".
  if (text.includes("<response>")) {
    const openTag = "<text>";
    const closeTag = "</text>";
    const start = text.indexOf(openTag);
    if (start >= 0) {
      const contentStart = start + openTag.length;
      const end = text.indexOf(closeTag, contentStart);
      text =
        end >= 0 ? text.slice(contentStart, end) : text.slice(contentStart);
    } else {
      // <response> present but no <text> yet — nothing speakable.
      return "";
    }
  }

  // Strip hidden blocks (think, thought, analysis, etc.) even when unclosed
  // during streaming — prevents the voice from speaking internal LLM reasoning.
  text = text.replace(HIDDEN_VOICE_BLOCK_RE, " ");

  // Strip elizaOS action/params blocks.
  text = text.replace(/\s*<actions>[\s\S]*?(?:<\/actions>|$)\s*/g, " ");
  text = text.replace(/\s*<params>[\s\S]*?(?:<\/params>|$)\s*/g, " ");

  // Strip incomplete XML tags at the end of a streaming chunk (e.g. "<thi",
  // "</respon") so partial tags don't become spoken words.
  text = text.replace(/<\/?[a-zA-Z][^>]*$|<\/?$/s, "");

  return text;
}

function toSpeakableText(input: string): string {
  const extracted = extractVoiceText(input);
  if (!extracted) return "";
  const normalized = sanitizeSpeechText(extracted);
  if (!normalized) return "";
  return capSpeechLength(normalized);
}

/** Common abbreviations that end with a period but are not sentence endings. */
const ABBREV_RE =
  /(?:Mr|Mrs|Ms|Dr|Jr|Sr|St|vs|etc|approx|Prof|Rev|Gen|Sgt|Lt|Col|Maj|Capt|Corp|Pvt|Ave|Blvd|dept|est|govt|assn)$/;

/**
 * Replace URLs with placeholders so their internal dots are not treated as
 * sentence boundaries.  Returns the cleaned string and a restore function.
 */
function shelterUrls(input: string): {
  text: string;
  restore: (s: string) => string;
} {
  const urls: string[] = [];
  const text = input.replace(/https?:\/\/\S+/g, (m) => {
    urls.push(m);
    return `__URL${urls.length - 1}__`;
  });
  return {
    text,
    restore: (s: string) =>
      s.replace(/__URL(\d+)__/g, (_, i) => urls[Number(i)] ?? _),
  };
}

/**
 * Test whether a period match at `index` inside `value` is a real sentence
 * boundary (not an abbreviation or decimal).
 */
function isRealSentenceEnd(value: string, matchIndex: number): boolean {
  // Decimal: digit immediately before the period → not a sentence end.
  if (matchIndex > 0 && /\d/.test(value[matchIndex - 1]!)) {
    // Check if a digit also follows the period (e.g. "3.14")
    if (matchIndex + 1 < value.length && /\d/.test(value[matchIndex + 1]!)) {
      return false;
    }
  }

  // Known abbreviation before the period.
  const before = value.slice(0, matchIndex);
  if (ABBREV_RE.test(before)) return false;

  return true;
}

function splitFirstSentence(text: string): {
  complete: boolean;
  firstSentence: string;
  remainder: string;
} {
  const value = collapseWhitespace(text);
  if (!value) return { complete: false, firstSentence: "", remainder: "" };

  // Shelter URLs so their dots don't trigger splits.
  const { text: sheltered, restore } = shelterUrls(value);

  // Match sentence-ending punctuation (. ! ?) with optional closing quotes/brackets.
  const boundary = /([.!?]+(?:["')\]]+)?)(?:\s|$)/g;
  let match: RegExpExecArray | null = null;
  while (true) {
    match = boundary.exec(sheltered);
    if (!match || typeof match.index !== "number") break;

    const punctChar = match[1]?.[0];

    // For periods, apply extra heuristics to skip abbreviations, decimals,
    // and ellipses.
    if (punctChar === ".") {
      // Ellipsis ("...") is a mid-sentence pause, not a sentence boundary.
      if (match[1]?.length >= 3) continue;
      // Single period: skip abbreviations and decimals.
      if (!isRealSentenceEnd(sheltered, match.index)) continue;
    }

    const endIndex = match.index + match[0].length;
    const firstSentence = restore(sheltered.slice(0, endIndex).trim());
    const remainder = restore(sheltered.slice(endIndex).trim());
    if (firstSentence.length > 0) {
      return { complete: true, firstSentence, remainder };
    }
  }

  // Fallback for long content with no punctuation yet.
  if (value.length >= 180) {
    const window = value.slice(0, 180);
    const splitAt = window.lastIndexOf(" ");
    if (splitAt > 100) {
      return {
        complete: true,
        firstSentence: window.slice(0, splitAt).trim(),
        remainder: value.slice(splitAt).trim(),
      };
    }
  }

  return { complete: false, firstSentence: value, remainder: "" };
}

function remainderAfter(fullText: string, firstSentence: string): string {
  const full = collapseWhitespace(fullText);
  const first = collapseWhitespace(firstSentence);
  if (!full || !first) return full;
  if (full.startsWith(first)) return full.slice(first.length).trim();

  const lowerFull = full.toLowerCase();
  const lowerFirst = first.toLowerCase();
  if (lowerFull.startsWith(lowerFirst)) {
    return full.slice(first.length).trim();
  }

  const idx = lowerFull.indexOf(lowerFirst);
  if (idx >= 0) {
    return full.slice(idx + first.length).trim();
  }

  return "";
}

function queueableSpeechPrefix(text: string, isFinal: boolean): string {
  const value = collapseWhitespace(text);
  if (!value) return "";
  if (isFinal) return value;

  const { text: sheltered, restore } = shelterUrls(value);

  let lastSentenceEnd = 0;
  const boundary = /([.!?]+(?:["')\]]+)?)(?:\s|$)/g;
  let match: RegExpExecArray | null = null;
  while (true) {
    match = boundary.exec(sheltered);
    if (!match || typeof match.index !== "number") break;

    const punctChar = match[1]?.[0];
    if (punctChar === ".") {
      if (match[1]?.length >= 3) continue; // Ellipsis — not a sentence boundary.
      if (!isRealSentenceEnd(sheltered, match.index)) continue;
    }

    lastSentenceEnd = match.index + match[0].length;
  }
  if (lastSentenceEnd > 0) {
    return restore(sheltered.slice(0, lastSentenceEnd).trim());
  }

  // Fallback for long content with no punctuation yet.
  if (value.length >= 180) {
    const window = value.slice(0, 180);
    const splitAt = window.lastIndexOf(" ");
    if (splitAt > 100) {
      return window.slice(0, splitAt).trim();
    }
  }
  return "";
}

function cloneVoiceConfig(
  config:
    | (VoiceConfig & {
        provider?: VoiceConfig["provider"] | "openai";
        openai?: {
          apiKey?: string;
          voice?: string;
          model?: string;
        };
      })
    | null
    | undefined,
):
  | (VoiceConfig & {
      provider?: VoiceConfig["provider"] | "openai";
      openai?: {
        apiKey?: string;
        voice?: string;
        model?: string;
      };
    })
  | null {
  if (!config) return null;
  return {
    ...config,
    elevenlabs: config.elevenlabs ? { ...config.elevenlabs } : undefined,
    edge: config.edge ? { ...config.edge } : undefined,
    openai: config.openai ? { ...config.openai } : undefined,
  };
}

function resolveEffectiveVoiceConfig(
  config:
    | (VoiceConfig & {
        provider?: VoiceConfig["provider"] | "openai";
        openai?: {
          apiKey?: string;
          voice?: string;
          model?: string;
        };
      })
    | null
    | undefined,
  options?: { cloudConnected?: boolean },
):
  | (VoiceConfig & {
      provider?: VoiceConfig["provider"] | "openai";
      openai?: {
        apiKey?: string;
        voice?: string;
        model?: string;
      };
    })
  | null {
  const cloudConnected = options?.cloudConnected === true;
  const base = cloneVoiceConfig(config) ?? {};
  const rawProvider = base.provider as
    | VoiceConfig["provider"]
    | "openai"
    | undefined;
  const hasLegacyOpenAiProvider = rawProvider === "openai";
  let provider: VoiceConfig["provider"] | undefined =
    (hasLegacyOpenAiProvider ? undefined : rawProvider) ??
    (base.elevenlabs ? "elevenlabs" : base.edge ? "edge" : undefined) ??
    (cloudConnected ? "elevenlabs" : undefined);

  // Saved characters often use browser/local TTS (`edge`, `simple-voice`, or
  // legacy `openai`), which skips the ElevenLabs fetch path. When Eliza Cloud
  // is available for voice, prefer cloud-backed synthesis instead of Web Speech
  // (often labeled Microsoft / Edge in the OS).
  if (
    cloudConnected &&
    (provider === "edge" ||
      hasLegacyOpenAiProvider ||
      provider === "simple-voice")
  ) {
    miladyTtsDebug("voiceConfig:upgrade_provider_for_cloud", {
      fromProvider: hasLegacyOpenAiProvider ? "openai" : provider,
    });
    provider = "elevenlabs";
  }

  if (!provider) return null;
  if (provider !== "elevenlabs") {
    return { ...base, provider };
  }

  const currentElevenLabs = base.elevenlabs ?? {};
  const mode = resolveVoiceMode(
    base.mode,
    cloudConnected,
    currentElevenLabs.apiKey,
  );
  const elevenlabs: NonNullable<VoiceConfig["elevenlabs"]> = {
    ...currentElevenLabs,
    voiceId: currentElevenLabs.voiceId ?? DEFAULT_ELEVEN_VOICE,
    modelId: currentElevenLabs.modelId ?? DEFAULT_ELEVEN_MODEL,
    stability:
      typeof currentElevenLabs.stability === "number"
        ? currentElevenLabs.stability
        : 0.5,
    similarityBoost:
      typeof currentElevenLabs.similarityBoost === "number"
        ? currentElevenLabs.similarityBoost
        : 0.75,
    speed:
      typeof currentElevenLabs.speed === "number"
        ? currentElevenLabs.speed
        : 1.0,
  };
  const apiKey =
    typeof currentElevenLabs.apiKey === "string"
      ? currentElevenLabs.apiKey.trim()
      : "";

  if (mode === "own-key" && apiKey && !isRedactedSecret(apiKey)) {
    elevenlabs.apiKey = currentElevenLabs.apiKey;
  } else {
    delete elevenlabs.apiKey;
  }

  return {
    ...base,
    provider,
    mode,
    elevenlabs,
  };
}

export const __voiceChatInternals = {
  splitFirstSentence,
  remainderAfter,
  queueableSpeechPrefix,
  resolveEffectiveVoiceConfig,
  resolveVoiceMode,
  resolveVoiceProxyEndpoint,
  toSpeakableText,
  mergeTranscriptWindows,
  webSpeechVoiceDebugFields,
  ASSISTANT_TTS_FINAL_ONLY,
  ASSISTANT_TTS_FIRST_FLUSH_CHARS,
  ASSISTANT_TTS_MIN_CHUNK_CHARS,
};

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

function shouldPreferNativeTalkMode(): boolean {
  if (typeof window === "undefined") return false;
  if (getElectrobunRendererRpc()) return true;
  return Capacitor.isNativePlatform();
}

/** MILADY_TTS_DEBUG fields for OS/browser SpeechSynthesis (often Microsoft Edge on Windows). */
function webSpeechVoiceDebugFields(
  voice: SpeechSynthesisVoice | undefined,
): Record<string, string | boolean | undefined> {
  if (!voice) {
    return {
      voiceName: "(engine default)",
      voiceURI: "(none)",
      engineGuess: "unknown",
    };
  }
  const blob = `${voice.voiceURI} ${voice.name}`.toLowerCase();
  let engineGuess = "unknown";
  if (
    blob.includes("microsoft") ||
    blob.includes("msedge") ||
    blob.includes("edge-tts")
  ) {
    engineGuess = "microsoft-edge-family";
  } else if (blob.includes("com.apple")) {
    engineGuess = "apple-webkit";
  } else if (blob.includes("google")) {
    engineGuess = "google";
  }
  const extended = voice as SpeechSynthesisVoice & { localService?: boolean };
  return {
    voiceName: voice.name,
    voiceURI: voice.voiceURI,
    voiceLang: voice.lang,
    voiceDefault: voice.default,
    voiceLocalService:
      typeof extended.localService === "boolean"
        ? extended.localService
        : undefined,
    engineGuess,
  };
}

function normalizeSpeechLocale(input: string | undefined): string {
  const trimmed = input?.trim();
  return trimmed || "en-US";
}

function localePrefix(locale: string): string {
  return locale.toLowerCase().split("-")[0] || "en";
}

function matchesVoiceLocale(
  voice: SpeechSynthesisVoice,
  targetLocale: string,
): boolean {
  const target = targetLocale.toLowerCase();
  const voiceLang = voice.lang.toLowerCase();
  if (voiceLang === target) return true;
  const base = localePrefix(targetLocale);
  return voiceLang.startsWith(`${base}-`) || voiceLang === base;
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useVoiceChat(options: VoiceChatOptions): VoiceChatState {
  const [isListening, setIsListening] = useState(false);
  const [captureMode, setCaptureMode] = useState<VoiceCaptureMode>("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [supported, setSupported] = useState(false);
  const [usingAudioAnalysis, setUsingAudioAnalysis] = useState(false);
  const [voiceUnlockedGeneration, setVoiceUnlockedGeneration] = useState(0);

  // Refs — stable across renders, read from animation loop & callbacks
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const sttBackendRef = useRef<"browser" | "talkmode" | null>(null);
  const talkModeHandlesRef = useRef<PluginListenerHandle[]>([]);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const animFrameRef = useRef<number>(0);
  const speakingStartRef = useRef<number>(0);
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(false);
  const listeningModeRef = useRef<VoiceCaptureMode>("idle");
  const transcriptBufferRef = useRef("");
  const emitTranscript = useEffectEvent((text: string) => {
    options.onTranscript(text);
  });
  const emitTranscriptPreview = useEffectEvent(
    (text: string, event: VoiceTranscriptPreviewEvent) => {
      options.onTranscriptPreview?.(text, event);
    },
  );
  const emitPlaybackStart = useEffectEvent((event: VoicePlaybackStartEvent) => {
    options.onPlaybackStart?.(event);
  });

  const effectiveVoiceConfig = useMemo(
    () =>
      resolveEffectiveVoiceConfig(options.voiceConfig, {
        cloudConnected: options.cloudConnected,
      }),
    [options.cloudConnected, options.voiceConfig],
  );

  const assistantTtsQuality = useMemo((): "enhanced" | "standard" => {
    return effectiveVoiceConfig?.provider === "elevenlabs"
      ? "enhanced"
      : "standard";
  }, [effectiveVoiceConfig?.provider]);

  const ttsDebugConfigKeyRef = useRef("");
  useEffect(() => {
    const key = JSON.stringify({
      c: options.cloudConnected,
      p: effectiveVoiceConfig?.provider,
      m: effectiveVoiceConfig?.mode,
      v: effectiveVoiceConfig?.elevenlabs?.voiceId,
      q: assistantTtsQuality,
    });
    if (ttsDebugConfigKeyRef.current === key) return;
    ttsDebugConfigKeyRef.current = key;
    miladyTtsDebug("useVoiceChat:config", {
      cloudConnected: options.cloudConnected,
      provider: effectiveVoiceConfig?.provider,
      mode: effectiveVoiceConfig?.mode,
      voiceId: effectiveVoiceConfig?.elevenlabs?.voiceId,
      assistantTtsQuality,
      ttsCloudUrl: resolveApiUrl("/api/tts/cloud"),
    });
  }, [
    assistantTtsQuality,
    effectiveVoiceConfig?.elevenlabs?.voiceId,
    effectiveVoiceConfig?.mode,
    effectiveVoiceConfig?.provider,
    options.cloudConnected,
  ]);

  // Voice config ref (latest value always available to callbacks)
  const voiceConfigRef = useRef<VoiceConfig | null>(effectiveVoiceConfig);
  voiceConfigRef.current = effectiveVoiceConfig;
  const interruptOnSpeechRef = useRef(options.interruptOnSpeech ?? true);
  interruptOnSpeechRef.current = options.interruptOnSpeech ?? true;
  const interruptSpeechRef = useRef<() => void>(() => {});

  // ── ElevenLabs Web Audio refs ──────────────────────────────────────
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const timeDomainDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const usingAudioAnalysisRef = useRef(false);
  const mouthOpenRef = useRef(0);
  mouthOpenRef.current = mouthOpen;

  // ── Progressive speech queue state ────────────────────────────────
  const queueRef = useRef<SpeakTask[]>([]);
  const queueWorkerRunningRef = useRef(false);
  const generationRef = useRef(0);
  const activeTaskFinishRef = useRef<(() => void) | null>(null);
  const activeFetchAbortRef = useRef<AbortController | null>(null);
  const assistantSpeechRef = useRef<AssistantSpeechState | null>(null);
  const assistantTtsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearSpeechTimers = useCallback(() => {
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
  }, []);

  const rememberCachedSegment = useCallback(
    (key: string, bytes: Uint8Array) => {
      globalAudioCache.delete(key);
      globalAudioCache.set(key, bytes);
      if (globalAudioCache.size <= MAX_CACHED_SEGMENTS) return;
      const oldest = globalAudioCache.keys().next().value;
      if (oldest) globalAudioCache.delete(oldest);
    },
    [],
  );

  const makeElevenCacheKey = useCallback(
    (text: string, config: NonNullable<VoiceConfig["elevenlabs"]>) => {
      const voiceId = config.voiceId ?? DEFAULT_ELEVEN_VOICE;
      const modelId = config.modelId ?? DEFAULT_ELEVEN_MODEL;
      const stability =
        typeof config.stability === "number"
          ? config.stability.toFixed(2)
          : "0.50";
      const similarity =
        typeof config.similarityBoost === "number"
          ? config.similarityBoost.toFixed(2)
          : "0.75";
      const speed =
        typeof config.speed === "number" ? config.speed.toFixed(2) : "1.00";
      return [
        "elevenlabs",
        voiceId,
        modelId,
        stability,
        similarity,
        speed,
        normalizeCacheText(text),
      ].join("|");
    },
    [],
  );

  const updateMouthOpen = useCallback(
    (value: number | ((previousValue: number) => number)) => {
      const previousValue = mouthOpenRef.current;
      const resolvedValue =
        typeof value === "function" ? value(previousValue) : value;
      const nextValue = normalizeMouthOpen(resolvedValue);
      if (nextValue === previousValue) {
        return;
      }
      mouthOpenRef.current = nextValue;
      setMouthOpen(nextValue);
    },
    [],
  );

  // ── Init ──────────────────────────────────────────────────────────

  useEffect(() => {
    const SpeechRecognitionAPI = getSpeechRecognitionCtor();
    void (
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function"
    );
    // On Electrobun/native platforms, always show the mic button — the
    // native TalkMode (Whisper) plugin handles STT even when the browser
    // doesn't expose SpeechRecognition or getUserMedia.
    setSupported(shouldPreferNativeTalkMode() ? true : !!SpeechRecognitionAPI);
    synthRef.current = window.speechSynthesis ?? null;
  }, []);

  // ── Mouth animation loop ──────────────────────────────────────────

  useEffect(() => {
    let frameId = 0;

    const animate = () => {
      if (!isSpeaking) {
        const nextMouthOpen = nextIdleMouthOpen(mouthOpenRef.current);
        updateMouthOpen(nextMouthOpen);
        if (nextMouthOpen > 0) {
          frameId = requestAnimationFrame(animate);
          animFrameRef.current = frameId;
        } else {
          animFrameRef.current = 0;
        }
        return;
      }

      // ── ElevenLabs: real audio volume analysis ────────────────────
      if (usingAudioAnalysisRef.current) {
        const analyser = analyserRef.current;
        const data = timeDomainDataRef.current;
        if (analyser && data) {
          analyser.getFloatTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = data[i] ?? 0;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          const volume = Math.max(
            0,
            Math.min(1, 1 / (1 + Math.exp(-(rms * 30 - 2)))),
          );
          updateMouthOpen(volume);
        }
        frameId = requestAnimationFrame(animate);
        animFrameRef.current = frameId;
        return;
      }

      // ── Browser TTS: sine-wave mouth + safety check ──────────────
      const sinceStart = Date.now() - speakingStartRef.current;
      if (
        sinceStart > 500 &&
        synthRef.current &&
        !synthRef.current.speaking &&
        !synthRef.current.pending
      ) {
        utteranceRef.current = null;
        setIsSpeaking(false);
        return;
      }

      const elapsed = sinceStart / 1000;
      const base = Math.sin(elapsed * 12) * 0.3 + 0.4;
      const detail = Math.sin(elapsed * 18.7) * 0.15;
      const slow = Math.sin(elapsed * 4.2) * 0.1;
      updateMouthOpen(Math.max(0, Math.min(1, base + detail + slow)));
      frameId = requestAnimationFrame(animate);
      animFrameRef.current = frameId;
    };

    if (isSpeaking || mouthOpenRef.current > 0) {
      frameId = requestAnimationFrame(animate);
      animFrameRef.current = frameId;
    } else {
      animFrameRef.current = 0;
    }

    return () => {
      cancelAnimationFrame(frameId);
      if (animFrameRef.current === frameId) {
        animFrameRef.current = 0;
      }
    };
  }, [isSpeaking, updateMouthOpen]);

  // ── STT (Speech Recognition) ──────────────────────────────────────

  const applyTranscriptUpdate = useCallback(
    (transcript: string, isFinal: boolean) => {
      const mode = listeningModeRef.current;
      if (mode === "idle") return;

      const normalized = collapseWhitespace(transcript);
      if (!normalized) return;

      const nextText = mergeTranscriptWindows(
        transcriptBufferRef.current,
        normalized,
      );
      if (nextText === transcriptBufferRef.current) return;

      transcriptBufferRef.current = nextText;
      setInterimTranscript(nextText);
      emitTranscriptPreview(nextText, {
        mode,
        isFinal,
      });

      if (interruptOnSpeechRef.current) {
        interruptSpeechRef.current();
      }
    },
    [],
  );

  const removeTalkModeListeners = useCallback(async () => {
    const handles = talkModeHandlesRef.current;
    talkModeHandlesRef.current = [];
    await Promise.all(
      handles.map((handle) =>
        handle.remove().catch(() => {
          /* ignore */
        }),
      ),
    );
  }, []);

  const ensureTalkModeListeners = useCallback(async () => {
    if (talkModeHandlesRef.current.length > 0) return;

    const talkMode = getTalkModePlugin();

    const transcriptHandle = await talkMode.addListener(
      "transcript",
      (event: TalkModeTranscriptEvent) => {
        applyTranscriptUpdate(event.transcript ?? "", event.isFinal === true);
      },
    );
    const errorHandle = await talkMode.addListener(
      "error",
      (event: TalkModeErrorEvent) => {
        if (
          event.code === "not-allowed" ||
          event.code === "service-not-allowed"
        ) {
          enabledRef.current = false;
          listeningModeRef.current = "idle";
          sttBackendRef.current = null;
          setCaptureMode("idle");
          setIsListening(false);
        }
      },
    );
    const stateHandle = await talkMode.addListener(
      "stateChange",
      (event: TalkModeStateEvent) => {
        if (event.state === "error" || event.state === "idle") {
          if (!enabledRef.current) {
            setIsListening(false);
            setCaptureMode("idle");
          }
        }
      },
    );
    talkModeHandlesRef.current = [transcriptHandle, errorHandle, stateHandle];
  }, [applyTranscriptUpdate]);

  const startBrowserRecognition = useCallback(
    (mode: Exclude<VoiceCaptureMode, "idle">) => {
      const SpeechRecognitionAPI = getSpeechRecognitionCtor();
      if (!SpeechRecognitionAPI) return false;

      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = options.lang ?? "en-US";

      recognition.onresult = (event: SpeechRecognitionResultEvent) => {
        let transcript = "";
        let isFinal = false;

        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const chunk = result?.[0]?.transcript ?? "";
          if (chunk) {
            transcript = transcript ? `${transcript} ${chunk}` : chunk;
          }
          if (result?.isFinal) {
            isFinal = true;
          }
        }

        applyTranscriptUpdate(transcript, isFinal);
      };

      recognition.onerror = (event: { error: string }) => {
        if (
          event.error === "not-allowed" ||
          event.error === "service-not-allowed"
        ) {
          enabledRef.current = false;
          listeningModeRef.current = "idle";
          sttBackendRef.current = null;
          setCaptureMode("idle");
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        if (enabledRef.current && listeningModeRef.current === mode) {
          try {
            recognition.start();
          } catch {
            /* already started */
          }
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
        sttBackendRef.current = "browser";
        enabledRef.current = true;
        listeningModeRef.current = mode;
        setCaptureMode(mode);
        setIsListening(true);
        return true;
      } catch {
        recognitionRef.current = null;
        return false;
      }
    },
    [applyTranscriptUpdate, options.lang],
  );

  const startTalkModeRecognition = useCallback(
    async (mode: Exclude<VoiceCaptureMode, "idle">) => {
      await ensureTalkModeListeners();

      try {
        const talkMode = getTalkModePlugin();
        const permissions = await talkMode.checkPermissions().catch(() => null);
        if (permissions?.microphone === "prompt") {
          await talkMode.requestPermissions().catch(() => {
            /* ignore */
          });
        }

        const directRpc = getElectrobunRendererRpc();
        const result = await talkMode.start({
          config: {
            stt: {
              ...(directRpc ? { engine: "whisper" as const } : {}),
              language: options.lang ?? "en-US",
              modelSize: "base",
              sampleRate: 16000,
            },
            silenceWindowMs: 350,
            interruptOnSpeech: true,
          },
        });
        if (!result.started) {
          return false;
        }

        enabledRef.current = true;
        listeningModeRef.current = mode;
        sttBackendRef.current = "talkmode";
        setCaptureMode(mode);
        setIsListening(true);
        return true;
      } catch {
        return false;
      }
    },
    [ensureTalkModeListeners, options.lang],
  );

  const finalizeRecognition = useCallback((submit: boolean) => {
    const transcript = collapseWhitespace(transcriptBufferRef.current);
    if (submit && transcript) {
      emitTranscript(transcript);
    }

    transcriptBufferRef.current = "";
    recognitionRef.current = null;
    sttBackendRef.current = null;
    enabledRef.current = false;
    listeningModeRef.current = "idle";
    setIsListening(false);
    setCaptureMode("idle");
    setInterimTranscript("");
  }, []);

  const startListening = useCallback(
    async (mode: Exclude<VoiceCaptureMode, "idle"> = "compose") => {
      if (enabledRef.current) return;

      transcriptBufferRef.current = "";
      setInterimTranscript("");
      if (interruptOnSpeechRef.current) {
        interruptSpeechRef.current();
      }

      if (shouldPreferNativeTalkMode()) {
        const started = await startTalkModeRecognition(mode);
        if (started) {
          return;
        }
      }

      startBrowserRecognition(mode);
    },
    [startBrowserRecognition, startTalkModeRecognition],
  );

  const stopListening = useCallback(
    async (options?: { submit?: boolean }) => {
      const mode = listeningModeRef.current;
      if (mode === "idle") return;

      const submit = options?.submit === true;
      enabledRef.current = false;

      if (sttBackendRef.current === "talkmode") {
        await getTalkModePlugin()
          .stop()
          .catch(() => {
            /* ignore */
          });
        await new Promise((resolve) =>
          window.setTimeout(resolve, TALKMODE_STOP_SETTLE_MS),
        );
      } else {
        recognitionRef.current?.stop();
        await new Promise((resolve) =>
          window.setTimeout(resolve, TALKMODE_STOP_SETTLE_MS),
        );
      }

      finalizeRecognition(submit);
    },
    [finalizeRecognition],
  );

  const toggleListening = useCallback(() => {
    if (enabledRef.current && listeningModeRef.current === "compose") {
      void stopListening();
      return;
    }
    if (enabledRef.current) return;
    void startListening("compose");
  }, [startListening, stopListening]);

  // ── Cancel helpers ────────────────────────────────────────────────

  /** Stop all in-progress speech playback/requests but keep assistant queue state. */
  const cancelPlayback = useCallback(() => {
    generationRef.current += 1;
    queueRef.current = [];

    activeFetchAbortRef.current?.abort();
    activeFetchAbortRef.current = null;

    activeTaskFinishRef.current?.();
    activeTaskFinishRef.current = null;

    // Browser TTS
    synthRef.current?.cancel();
    utteranceRef.current = null;

    // ElevenLabs audio
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch {
        /* ok */
      }
      try {
        audioSourceRef.current.disconnect();
      } catch {
        /* ok */
      }
      audioSourceRef.current = null;
    }

    clearSpeechTimers();
    usingAudioAnalysisRef.current = false;
    setUsingAudioAnalysis(false);
  }, [clearSpeechTimers]);

  const stopSpeaking = useCallback(() => {
    if (assistantTtsDebounceRef.current != null) {
      clearTimeout(assistantTtsDebounceRef.current);
      assistantTtsDebounceRef.current = null;
    }
    assistantSpeechRef.current = null;
    cancelPlayback();
    setIsSpeaking(false);
    setUsingAudioAnalysis(false);
  }, [cancelPlayback]);
  interruptSpeechRef.current = stopSpeaking;

  // ── ElevenLabs TTS ────────────────────────────────────────────────

  const speakElevenLabs = useCallback(
    async (
      text: string,
      elConfig: NonNullable<VoiceConfig["elevenlabs"]>,
      task: SpeakTask,
      generation: number,
    ) => {
      let ctx = sharedAudioCtx;
      if (!ctx) {
        ctx = new AudioContext();
        sharedAudioCtx = ctx;
      }
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          // Force a fresh context if resume fails
          ctx.close().catch((err: unknown) => {
            console.warn("[useVoiceChat] AudioContext.close() failed", err);
          });
          ctx = new AudioContext();
          sharedAudioCtx = ctx;
        }
      }

      const voiceId = elConfig.voiceId ?? DEFAULT_ELEVEN_VOICE;
      const modelId = elConfig.modelId ?? DEFAULT_ELEVEN_MODEL;

      const cacheKey = task.cacheKey ?? makeElevenCacheKey(text, elConfig);
      const cachedBytes = globalAudioCache.get(cacheKey);
      let audioBytes: Uint8Array | null = null;
      let cached = false;

      if (cachedBytes) {
        rememberCachedSegment(cacheKey, cachedBytes);
        audioBytes = cachedBytes.slice();
        cached = true;
      }

      if (!audioBytes) {
        const controller = new AbortController();
        activeFetchAbortRef.current = controller;

        const requestBody = {
          text,
          model_id: modelId,
          apply_text_normalization: "auto",
          voice_settings: {
            stability: elConfig.stability ?? 0.5,
            similarity_boost: elConfig.similarityBoost ?? 0.75,
            speed: elConfig.speed ?? 1.0,
          },
        };
        const apiToken = getElizaApiToken()?.trim() ?? "";

        /**
         * Server-side TTS when the browser has no `xi-api-key`.
         * Always try Eliza Cloud (`/api/tts/cloud`) first — that is where a
         * persisted Eliza Cloud API key is used. `voiceMode` may still be
         * `own-key` when the UI has not yet marked cloud as connected (e.g.
         * disconnect preference, status poll race), which previously routed
         * here to `/api/tts/elevenlabs` only; Milady does not implement that
         * path, so chat fell back to browser (Edge) TTS. If cloud rejects
         * (no key), fall back to the upstream ElevenLabs proxy.
         */
        const fetchViaProxy = async (): Promise<Response> => {
          const dbg = task.debugUtteranceContext;
          const init: RequestInit = {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
              ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
              ...(isMiladyTtsDebugEnabled() && dbg
                ? {
                    "x-milady-tts-message-id": encodeURIComponent(
                      dbg.messageId,
                    ),
                    "x-milady-tts-clip-segment": encodeURIComponent(
                      task.segment,
                    ),
                    "x-milady-tts-full-preview": encodeURIComponent(
                      dbg.fullAssistTextPreview,
                    ),
                  }
                : {}),
            },
            body: JSON.stringify({
              ...requestBody,
              voiceId,
              modelId,
              outputFormat: "mp3_44100_128",
            }),
            signal: controller.signal,
          };

          let res = await fetch(resolveApiUrl("/api/tts/cloud"), init);
          if (!res.ok) {
            const fallback = await fetch(
              resolveApiUrl("/api/tts/elevenlabs"),
              init,
            );
            if (fallback.ok) res = fallback;
          }
          return res;
        };

        const trimmedApiKey =
          typeof elConfig.apiKey === "string" ? elConfig.apiKey.trim() : "";
        const hasDirectKey = hasConfiguredApiKey(trimmedApiKey);

        let res: Response;
        if (hasDirectKey) {
          try {
            const url = new URL(
              `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`,
            );
            url.searchParams.set("output_format", "mp3_44100_128");
            res = await fetch(url.toString(), {
              method: "POST",
              headers: {
                "xi-api-key": trimmedApiKey,
                "Content-Type": "application/json",
                Accept: "audio/mpeg",
              },
              body: JSON.stringify(requestBody),
              signal: controller.signal,
            });
          } catch {
            res = await fetchViaProxy();
          }

          // If the locally-available key is stale, fall back to server-side key.
          if (!res.ok && (res.status === 401 || res.status === 403)) {
            const proxyRes = await fetchViaProxy();
            if (proxyRes.ok) {
              res = proxyRes;
            }
          }
        } else {
          res = await fetchViaProxy();
        }

        if (activeFetchAbortRef.current === controller) {
          activeFetchAbortRef.current = null;
        }

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          miladyTtsDebug("useVoiceChat:elevenlabs-http-error", {
            status: res.status,
            ttsTarget: describeTtsCloudFetchTargetForDebug(),
            hadBearer: Boolean(apiToken),
            bodyPreview: body.slice(0, 120),
          });
          throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 200)}`);
        }

        const audioData = await res.arrayBuffer();
        audioBytes = new Uint8Array(audioData);
        rememberCachedSegment(cacheKey, audioBytes.slice());
      }

      if (generation !== generationRef.current) return;
      const audioBuffer = await ctx.decodeAudioData(toArrayBuffer(audioBytes));
      if (generation !== generationRef.current) return;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      timeDomainDataRef.current = new Float32Array(
        new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT),
      );

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioSourceRef.current = source;

      await new Promise<void>((resolve) => {
        let finished = false;
        const playStartMs = performance.now();
        let wrappedFinish: (() => void) | null = null;

        const finish = () => {
          if (finished) return;
          finished = true;
          if (wrappedFinish && activeTaskFinishRef.current === wrappedFinish) {
            activeTaskFinishRef.current = null;
          }
          if (audioSourceRef.current === source) {
            audioSourceRef.current = null;
          }
          source.onended = null;
          try {
            source.disconnect();
          } catch {
            /* ok */
          }
          try {
            analyser.disconnect();
          } catch {
            /* ok */
          }
          clearSpeechTimers();
          resolve();
        };

        wrappedFinish = () => {
          miladyTtsDebug("play:web-audio:end", {
            segment: task.segment,
            elapsedMs: Math.round(performance.now() - playStartMs),
          });
          finish();
        };

        miladyTtsDebug("play:web-audio:start", {
          segment: task.segment,
          append: task.append,
          cached,
          textChars: text.length,
          preview: miladyTtsDebugTextPreview(text),
          durationSecApprox: Math.round(audioBuffer.duration * 100) / 100,
        });

        activeTaskFinishRef.current = wrappedFinish;
        source.onended = wrappedFinish;
        speechTimeoutRef.current = setTimeout(
          wrappedFinish,
          Math.max(2500, Math.ceil(audioBuffer.duration * 1000) + 1200),
        );

        source.start(0);
        emitPlaybackStart({
          text,
          segment: task.segment,
          provider: "elevenlabs",
          cached,
          startedAtMs: playStartMs,
        });
      });
    },
    [clearSpeechTimers, makeElevenCacheKey, rememberCachedSegment],
  );

  // ── Browser SpeechSynthesis TTS ───────────────────────────────────

  const speakBrowser = useCallback(
    (text: string, task: SpeakTask, generation: number) => {
      const config = voiceConfigRef.current;
      const synth = synthRef.current;
      const requestedLocale = normalizeSpeechLocale(options.lang);
      const words = text.trim().split(/\s+/).length;
      const estimatedMs = Math.max(1200, (words / 3) * 1000);
      const useTalkModeTts = !synth && Boolean(getElectrobunRendererRpc());

      miladyTtsDebug("speakBrowser:enter", {
        path: synth
          ? "speechSynthesis"
          : useTalkModeTts
            ? "talkmode-bridge"
            : "no-synth-timer-only",
        segment: task.segment,
        append: task.append,
        textChars: text.trim().length,
        preview: miladyTtsDebugTextPreview(text),
        voiceConfigProvider: config?.provider ?? null,
        ...(config?.provider === "edge" && config.edge?.voice
          ? { edgeVoiceSetting: config.edge.voice }
          : {}),
      });

      return new Promise<void>((resolve) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          if (activeTaskFinishRef.current === finish) {
            activeTaskFinishRef.current = null;
          }
          clearSpeechTimers();
          utteranceRef.current = null;
          resolve();
        };

        activeTaskFinishRef.current = finish;

        if (!synth) {
          if (getElectrobunRendererRpc()) {
            miladyTtsDebug("play:talkmode:dispatch", {
              segment: task.segment,
              append: task.append,
              textChars: text.trim().length,
              preview: miladyTtsDebugTextPreview(text),
              engine: "native-talkmode-bridge",
              note: "No window.speechSynthesis — routing TTS to main-process talkmodeSpeak",
            });
            void invokeDesktopBridgeRequest<void>({
              rpcMethod: "talkmodeSpeak",
              ipcChannel: "talkmode:speak",
              params: { text: text.trim() },
            }).catch((err: unknown) => {
              miladyTtsDebug("play:talkmode:speak-failed", {
                segment: task.segment,
                preview: miladyTtsDebugTextPreview(text),
                err:
                  err instanceof Error
                    ? `${err.name}: ${err.message.slice(0, 200)}`
                    : String(err).slice(0, 200),
              });
              console.warn("[useVoiceChat] Desktop speech bridge failed:", err);
            });
          } else {
            miladyTtsDebug("play:browser:no-synth", {
              segment: task.segment,
              textChars: text.trim().length,
              preview: miladyTtsDebugTextPreview(text),
              engine: "none",
              note: "No SpeechSynthesis — playback may be silent until Talk Mode or synth is available",
            });
          }
          emitPlaybackStart({
            text,
            segment: task.segment,
            provider: "browser",
            cached: false,
            startedAtMs: performance.now(),
          });
          speechTimeoutRef.current = setTimeout(finish, estimatedMs);
          return;
        }

        const utterance = new SpeechSynthesisUtterance(text.trim());
        utterance.lang = requestedLocale;
        utteranceRef.current = utterance;

        let selectedVoice: SpeechSynthesisVoice | undefined;
        if (synth?.getVoices) {
          const voices = synth.getVoices();

          if (config?.provider === "edge" && config.edge?.voice) {
            const edgeVoiceName = config.edge.voice;
            selectedVoice = voices.find(
              (v) => v.voiceURI === edgeVoiceName || v.name === edgeVoiceName,
            );

            if (!selectedVoice) {
              const isMale =
                edgeVoiceName.toLowerCase().includes("guy") ||
                edgeVoiceName.toLowerCase().includes("male");
              selectedVoice = voices.find((v) => {
                if (!matchesVoiceLocale(v, requestedLocale)) return false;
                const nameLower = v.name.toLowerCase();
                if (isMale) {
                  return (
                    nameLower.includes("male") ||
                    nameLower.includes("alex") ||
                    nameLower.includes("david") ||
                    nameLower.includes("daniel")
                  );
                } else {
                  return (
                    nameLower.includes("female") ||
                    nameLower.includes("samantha") ||
                    nameLower.includes("victoria") ||
                    nameLower.includes("zira") ||
                    nameLower.includes("karen")
                  );
                }
              });
            }
          }

          if (!selectedVoice) {
            if (localePrefix(requestedLocale) === "en") {
              selectedVoice =
                voices.find(
                  (v) =>
                    matchesVoiceLocale(v, requestedLocale) &&
                    !v.name.toLowerCase().includes("alex") &&
                    !v.name.toLowerCase().includes("david"),
                ) || voices.find((v) => matchesVoiceLocale(v, requestedLocale));
            } else {
              selectedVoice = voices.find((v) =>
                matchesVoiceLocale(v, requestedLocale),
              );
            }
          }

          if (selectedVoice) {
            utterance.voice = selectedVoice;
            utterance.lang = selectedVoice.lang || requestedLocale;
          }
        }

        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        miladyTtsDebug("play:browser:web-speech:enqueued", {
          segment: task.segment,
          append: task.append,
          textChars: text.trim().length,
          preview: miladyTtsDebugTextPreview(text),
          requestedLocale,
          engine: "speechSynthesis",
          ...webSpeechVoiceDebugFields(selectedVoice),
        });

        const browserPlayStartMsRef = { value: 0 };
        utterance.onstart = () => {
          if (generation !== generationRef.current) return;
          browserPlayStartMsRef.value = performance.now();
          miladyTtsDebug("play:browser:speechSynthesis:start", {
            segment: task.segment,
            append: task.append,
            textChars: text.trim().length,
            preview: miladyTtsDebugTextPreview(text),
            requestedLocale,
            engine: "speechSynthesis-utterance-onstart",
            ...webSpeechVoiceDebugFields(selectedVoice),
          });
          emitPlaybackStart({
            text,
            segment: task.segment,
            provider: "browser",
            cached: false,
            startedAtMs: browserPlayStartMsRef.value,
          });
        };
        const endBrowserUtterance = () => {
          if (browserPlayStartMsRef.value > 0) {
            miladyTtsDebug("play:browser:speechSynthesis:end", {
              segment: task.segment,
              elapsedMs: Math.round(
                performance.now() - browserPlayStartMsRef.value,
              ),
            });
          }
          finish();
        };
        utterance.onend = endBrowserUtterance;
        utterance.onerror = (ev) => {
          const errEv = ev as SpeechSynthesisErrorEvent;
          miladyTtsDebug("play:browser:speechSynthesis:error", {
            segment: task.segment,
            synthesisError: errEv.error ?? "unknown",
            preview: miladyTtsDebugTextPreview(text),
            requestedLocale,
            ...webSpeechVoiceDebugFields(selectedVoice),
          });
          endBrowserUtterance();
        };
        synth.speak(utterance);

        speechTimeoutRef.current = setTimeout(finish, estimatedMs + 5000);
      });
    },
    [clearSpeechTimers, options.lang],
  );

  const processQueue = useCallback(() => {
    if (queueWorkerRunningRef.current) return;
    queueWorkerRunningRef.current = true;
    const workerGeneration = generationRef.current;

    void (async () => {
      try {
        while (queueRef.current.length > 0) {
          if (workerGeneration !== generationRef.current) break;
          const task = queueRef.current.shift();
          if (!task) break;

          const config = voiceConfigRef.current;
          const elConfig = config?.elevenlabs;
          const useElevenLabs = config?.provider === "elevenlabs";

          miladyTtsDebug("processQueue:task", {
            useElevenLabs,
            hasElConfig: Boolean(elConfig),
            segment: task.segment,
            append: task.append,
            textChars: task.text.length,
            preview: miladyTtsDebugTextPreview(task.text),
            ...(task.debugUtteranceContext
              ? {
                  messageId: task.debugUtteranceContext.messageId,
                  hearingFull: task.debugUtteranceContext.fullAssistTextPreview,
                }
              : {}),
          });

          if (useElevenLabs && elConfig) {
            usingAudioAnalysisRef.current = true;
            setUsingAudioAnalysis(true);
            try {
              await speakElevenLabs(
                task.text,
                elConfig,
                task,
                workerGeneration,
              );
              continue;
            } catch (error) {
              if (
                workerGeneration !== generationRef.current ||
                isAbortError(error)
              ) {
                break;
              }
              console.warn(
                "[useVoiceChat] ElevenLabs TTS failed, falling back to browser:",
                error instanceof Error
                  ? `${error.name}: ${error.message}`
                  : error,
              );
              miladyTtsDebug("useVoiceChat:elevenlabs-fallback-to-browser", {
                err:
                  error instanceof Error
                    ? `${error.name}: ${error.message.slice(0, 200)}`
                    : String(error).slice(0, 200),
                ttsTarget: describeTtsCloudFetchTargetForDebug(),
                hadBearer: Boolean(getElizaApiToken()?.trim()),
                nextPath:
                  "speakBrowser (Web Speech / Microsoft Edge voice or talkmode bridge)",
              });
              usingAudioAnalysisRef.current = false;
              setUsingAudioAnalysis(false);
            }
          } else {
            usingAudioAnalysisRef.current = false;
            setUsingAudioAnalysis(false);
            miladyTtsDebug("processQueue:browser-tts-direct", {
              reason: elConfig
                ? "provider_not_elevenlabs"
                : "missing_elevenlabs_config",
              provider: config?.provider ?? null,
              nextPath:
                "speakBrowser — OS Web Speech (often msedge/Microsoft) or Electrobun talkmode",
            });
          }

          await speakBrowser(task.text, task, workerGeneration);
        }
      } finally {
        queueWorkerRunningRef.current = false;
      }
      if (workerGeneration !== generationRef.current) return;
      if (queueRef.current.length > 0) {
        processQueue();
        return;
      }
      usingAudioAnalysisRef.current = false;
      setUsingAudioAnalysis(false);
      setIsSpeaking(false);
    })();
  }, [speakBrowser, speakElevenLabs]);

  const enqueueSpeech = useCallback(
    (task: SpeakTask) => {
      const speakable = toSpeakableText(task.text);
      if (!speakable) return;

      if (!task.append) {
        cancelPlayback();
      }

      queueRef.current.push({ ...task, text: speakable });
      miladyTtsDebug("enqueueSpeech", {
        segment: task.segment,
        append: task.append,
        textChars: speakable.length,
        preview: miladyTtsDebugTextPreview(speakable),
        queueLen: queueRef.current.length,
      });
      speakingStartRef.current = Date.now();
      setIsSpeaking(true);
      processQueue();
    },
    [cancelPlayback, processQueue],
  );

  // ── Public speak APIs ─────────────────────────────────────────────

  const speak = useCallback(
    (text: string, speakOptions?: { append?: boolean }) => {
      if (assistantTtsDebounceRef.current != null) {
        clearTimeout(assistantTtsDebounceRef.current);
        assistantTtsDebounceRef.current = null;
      }
      assistantSpeechRef.current = null;
      enqueueSpeech({
        text,
        append: Boolean(speakOptions?.append),
        segment: "full",
      });
    },
    [enqueueSpeech],
  );

  const clearAssistantTtsDebounce = useCallback(() => {
    if (assistantTtsDebounceRef.current != null) {
      clearTimeout(assistantTtsDebounceRef.current);
      assistantTtsDebounceRef.current = null;
    }
  }, []);

  const flushPendingAssistantTts = useCallback(() => {
    assistantTtsDebounceRef.current = null;
    const state = assistantSpeechRef.current;
    if (!state || state.finalQueued) return;

    const latest = state.latestSpeakable;
    if (!latest) return;

    const unsent = remainderAfter(latest, state.queuedSpeakablePrefix);
    if (!unsent) return;

    const elConfig = voiceConfigRef.current?.elevenlabs;
    const cacheKey =
      voiceConfigRef.current?.provider === "elevenlabs" && elConfig
        ? makeElevenCacheKey(unsent, elConfig)
        : undefined;

    const dbgUtterance = isMiladyTtsDebugEnabled()
      ? {
          messageId: state.messageId,
          fullAssistTextPreview: miladyTtsDebugTextPreview(latest, 220),
        }
      : undefined;

    const isFirstClip = state.queuedSpeakablePrefix.length === 0;
    enqueueSpeech({
      text: unsent,
      append: !isFirstClip,
      segment: isFirstClip ? "full" : "remainder",
      cacheKey,
      debugUtteranceContext: dbgUtterance,
    });

    state.queuedSpeakablePrefix = latest;
  }, [enqueueSpeech, makeElevenCacheKey]);

  const queueAssistantSpeech = useCallback(
    (messageId: string, text: string, isFinal: boolean) => {
      if (!messageId) return;

      const speakable = toSpeakableText(text);
      if (!speakable) {
        miladyTtsDebug("queueAssistantSpeech:skip-empty", { messageId });
        return;
      }
      miladyTtsDebug("queueAssistantSpeech", {
        messageId,
        isFinal,
        speakableChars: speakable.length,
        preview: miladyTtsDebugTextPreview(speakable),
      });

      const current = assistantSpeechRef.current;
      if (!current || current.messageId !== messageId) {
        clearAssistantTtsDebounce();
        assistantSpeechRef.current = {
          messageId,
          queuedSpeakablePrefix: "",
          latestSpeakable: "",
          finalQueued: false,
        };
      }

      const state = assistantSpeechRef.current;
      if (!state) return;

      state.latestSpeakable = speakable;

      if (ASSISTANT_TTS_FINAL_ONLY && !isFinal) {
        // Band-aid mode: never speak partial stream chunks.
        return;
      }

      if (ASSISTANT_TTS_FINAL_ONLY) {
        if (state.finalQueued) return;
        clearAssistantTtsDebounce();

        const elConfig = voiceConfigRef.current?.elevenlabs;
        const cacheKey =
          voiceConfigRef.current?.provider === "elevenlabs" && elConfig
            ? makeElevenCacheKey(speakable, elConfig)
            : undefined;
        const dbgUtterance = isMiladyTtsDebugEnabled()
          ? {
              messageId,
              fullAssistTextPreview: miladyTtsDebugTextPreview(speakable, 220),
            }
          : undefined;

        // Final-only means one utterance per assistant message.
        enqueueSpeech({
          text: speakable,
          append: false,
          segment: "full",
          cacheKey,
          debugUtteranceContext: dbgUtterance,
        });
        state.queuedSpeakablePrefix = speakable;
        state.finalQueued = true;
        return;
      }

      if (
        speakable === state.queuedSpeakablePrefix &&
        (!isFinal || state.finalQueued)
      ) {
        return;
      }

      if (speakable === state.queuedSpeakablePrefix && isFinal) {
        clearAssistantTtsDebounce();
        state.finalQueued = true;
        return;
      }

      const unsent = remainderAfter(speakable, state.queuedSpeakablePrefix);
      if (!unsent) {
        if (isFinal) {
          clearAssistantTtsDebounce();
          state.finalQueued = true;
        }
        return;
      }

      const isFirstClip = state.queuedSpeakablePrefix.length === 0;
      const flushNow =
        isFinal ||
        (isFirstClip && unsent.length >= ASSISTANT_TTS_FIRST_FLUSH_CHARS) ||
        (!isFirstClip && unsent.length >= ASSISTANT_TTS_MIN_CHUNK_CHARS);

      if (flushNow) {
        clearAssistantTtsDebounce();
        const elConfig = voiceConfigRef.current?.elevenlabs;
        const cacheKey =
          voiceConfigRef.current?.provider === "elevenlabs" && elConfig
            ? makeElevenCacheKey(unsent, elConfig)
            : undefined;
        const dbgUtterance = isMiladyTtsDebugEnabled()
          ? {
              messageId,
              fullAssistTextPreview: miladyTtsDebugTextPreview(speakable, 220),
            }
          : undefined;
        enqueueSpeech({
          text: unsent,
          append: !isFirstClip,
          segment: isFirstClip ? "full" : "remainder",
          cacheKey,
          debugUtteranceContext: dbgUtterance,
        });
        state.queuedSpeakablePrefix = speakable;
        if (isFinal) state.finalQueued = true;
        return;
      }

      clearAssistantTtsDebounce();
      assistantTtsDebounceRef.current = setTimeout(() => {
        flushPendingAssistantTts();
      }, ASSISTANT_TTS_DEBOUNCE_MS);
    },
    [
      clearAssistantTtsDebounce,
      enqueueSpeech,
      flushPendingAssistantTts,
      makeElevenCacheKey,
    ],
  );

  // ── Unlock audio on first user gesture ─────────────────────────────
  // Browsers block AudioContext and SpeechSynthesis until a user gesture.
  // On the first interaction we warm AudioContext (for ElevenLabs) and
  // bump voiceUnlockedGeneration so the auto-speak effect retries any
  // greeting that was silently dropped by autoplay policy.

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleUserGesture = () => {
      window.removeEventListener("pointerdown", handleUserGesture, true);
      window.removeEventListener("keydown", handleUserGesture, true);

      // Warm AudioContext for ElevenLabs
      if (!sharedAudioCtx) {
        sharedAudioCtx = new AudioContext();
      }
      void sharedAudioCtx.resume().catch(() => {});

      // Signal that audio is now unlocked so callers can retry speech
      // that was silently blocked by browser autoplay policy.
      setVoiceUnlockedGeneration((g) => g + 1);
    };

    window.addEventListener("pointerdown", handleUserGesture, true);
    window.addEventListener("keydown", handleUserGesture, true);

    return () => {
      window.removeEventListener("pointerdown", handleUserGesture, true);
      window.removeEventListener("keydown", handleUserGesture, true);
    };
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────

  useEffect(() => {
    return () => {
      void stopListening();
      void removeTalkModeListeners();
      stopSpeaking();
    };
  }, [removeTalkModeListeners, stopListening, stopSpeaking]);

  return {
    isListening,
    captureMode,
    isSpeaking,
    mouthOpen,
    interimTranscript,
    supported,
    usingAudioAnalysis,
    toggleListening,
    startListening,
    stopListening,
    speak,
    queueAssistantSpeech,
    stopSpeaking,
    voiceUnlockedGeneration,
    assistantTtsQuality,
  };
}
