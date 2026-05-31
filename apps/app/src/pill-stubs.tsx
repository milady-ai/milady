// Local stubs for the Electrobun "pill" overlay window.
//
// The pill renderer (PillRoot in main.tsx) imports VoicePill,
// createVoiceCapture, plus the Conversation / ConversationMessage shapes
// from upstream packages. None of those symbols are published in the current
// `alpha` dist-tag of @elizaos/ui yet, and the source-of-truth lives in
// eliza/packages/ui/src/voice/* + eliza/packages/ui/src/components/voice-pill/*
// which is gitignored on CI. To keep package-mode builds (CI, Cloud image,
// Electrobun release) green, we ship minimal local implementations here and
// route the pill window through them.
//
// In `bun run eliza:local` mode the Vite alias auto-detect can be extended to
// resolve these from the upstream source instead — but for now the pill
// surface is a desktop-only early-stage feature, so the local rendition is
// sufficient. Delete this file once @elizaos/ui ships the symbols on alpha.

import { type ReactElement, useEffect, useRef, useState } from "react";

export interface ConversationMessage {
  id: string;
  role: string;
  text: string;
  timestamp?: number;
  [key: string]: unknown;
}

export interface VoicePillMessage {
  id: string;
  role: "user" | "agent";
  text: string;
}

export interface VoiceCaptureSegment {
  text: string;
  final: boolean;
}

export type VoiceCaptureState = "idle" | "starting" | "recording" | "stopping";

export interface VoiceCaptureOptions {
  onTranscript: (segment: VoiceCaptureSegment) => void;
  onStateChange?: (state: VoiceCaptureState, error?: Error) => void;
}

export interface VoiceCaptureHandle {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  dispose: () => void;
}

// Placeholder voice-capture factory. Real capture (local ASR via
// eliza/packages/ui/src/voice/local-asr-capture.ts + voice-chat-recording.ts)
// is gated on upstream symbols not yet published. Until then, start/stop is
// a no-op that surfaces state transitions so the pill UI behaves correctly.
export function createVoiceCapture(
  options: VoiceCaptureOptions,
): VoiceCaptureHandle {
  let disposed = false;
  return {
    async start() {
      if (disposed) return;
      options.onStateChange?.("starting");
      options.onStateChange?.("recording");
    },
    async stop() {
      if (disposed) return;
      options.onStateChange?.("stopping");
      options.onStateChange?.("idle");
    },
    dispose() {
      disposed = true;
    },
  };
}

// Pulls the fields the pill cares about off whatever shape the server
// returned. Tolerant of both the upstream ConversationMessage interface and
// the looser server payload shape used by the WebSocket proactive-message
// event.
export function normalizePillMessage(raw: unknown): ConversationMessage {
  if (!raw || typeof raw !== "object") {
    return { id: "", role: "assistant", text: "" };
  }
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  const role = typeof r.role === "string" ? r.role : "assistant";
  const text = typeof r.text === "string" ? r.text : "";
  const timestamp = typeof r.timestamp === "number" ? r.timestamp : undefined;
  const out: ConversationMessage = { id, role, text };
  if (timestamp !== undefined) out.timestamp = timestamp;
  return out;
}

export interface VoicePillProps {
  messages: VoicePillMessage[];
  onSubmit: (text: string) => void;
  onRecordingChange?: (recording: boolean) => void;
}

// Minimal pill renderer. Upstream eliza/packages/ui/src/components/voice-pill
// has the polished version (animations, mic VAD viz, settings popover); this
// local rendition gives the desktop pill window a working composer + mic
// toggle so the build path stays unblocked.
export function VoicePill(props: VoicePillProps): ReactElement {
  const { messages, onSubmit, onRecordingChange } = props;
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onRecordingChange?.(recording);
  }, [recording, onRecordingChange]);

  const submit = (): void => {
    const text = draft.trim();
    if (!text) return;
    onSubmit(text);
    setDraft("");
    inputRef.current?.focus();
  };

  return (
    <div className="elizaos-voice-pill">
      <div className="elizaos-voice-pill__chat">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`elizaos-voice-pill__msg elizaos-voice-pill__msg--${m.role}`}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div className="elizaos-voice-pill__composer">
        <button
          type="button"
          className="elizaos-voice-pill__ctrl"
          aria-pressed={recording}
          onClick={() => setRecording((r) => !r)}
        >
          {recording ? "Stop" : "Rec"}
        </button>
        <input
          ref={inputRef}
          className="elizaos-voice-pill__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Message…"
        />
        <button
          type="button"
          className="elizaos-voice-pill__send"
          onClick={submit}
        >
          Send
        </button>
      </div>
    </div>
  );
}
