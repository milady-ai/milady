import { Mic, Plus, Send } from "lucide-react";
import { type KeyboardEvent, useState } from "react";

export function CharacterEditor(): null {
  return null;
}

export interface VoicePillMessage {
  id: string;
  role: "user" | "agent";
  text: string;
}

export interface VoicePillProps {
  ariaLabel?: string;
  className?: string;
  messages?: VoicePillMessage[];
  onAdd?: () => void;
  onOpenChange?: (open: boolean) => void;
  onRecordingChange?: (recording: boolean) => void;
  onSubmit?: (text: string) => void;
  open?: boolean;
  recording?: boolean;
}

export function VoicePill({
  ariaLabel = "Open voice chat",
  className,
  messages = [],
  onAdd,
  onOpenChange,
  onRecordingChange,
  onSubmit,
  open,
  recording: controlledRecording,
}: VoicePillProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [text, setText] = useState("");

  const isOpen = open ?? internalOpen;
  const isRecording = controlledRecording ?? recording;

  function setOpen(next: boolean) {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }

  function setRecordingState(next: boolean) {
    if (controlledRecording === undefined) setRecording(next);
    onRecordingChange?.(next);
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit?.(trimmed);
    setText("");
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    submit();
  }

  const rootClass = className
    ? `elizaos-voice-pill ${className}`
    : "elizaos-voice-pill";
  const pillClass = isRecording
    ? "elizaos-voice-pill__pill elizaos-voice-pill__pill--recording"
    : "elizaos-voice-pill__pill";
  const chatClass = isOpen
    ? "elizaos-voice-pill__chat"
    : "elizaos-voice-pill__chat elizaos-voice-pill__chat--collapsed";
  const recordClass = isRecording
    ? "elizaos-voice-pill__ctrl elizaos-voice-pill__ctrl--recording"
    : "elizaos-voice-pill__ctrl";

  return (
    <section className={rootClass}>
      <button
        aria-label={ariaLabel}
        className="elizaos-voice-pill__hit"
        onClick={() => setOpen(!isOpen)}
        type="button"
      >
        <span className={pillClass}>
          <Mic aria-hidden="true" size={18} />
        </span>
      </button>
      <div aria-hidden={!isOpen} className={chatClass}>
        {messages.length > 0 ? (
          <div className="elizaos-voice-pill__messages">
            {messages.map((message) => (
              <p
                className={
                  message.role === "user"
                    ? "elizaos-voice-pill__msg elizaos-voice-pill__msg--user"
                    : "elizaos-voice-pill__msg elizaos-voice-pill__msg--agent"
                }
                key={message.id}
              >
                {message.text}
              </p>
            ))}
          </div>
        ) : null}
        <div className="elizaos-voice-pill__composer">
          <button
            aria-label="Add"
            className="elizaos-voice-pill__ctrl"
            onClick={onAdd}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
          </button>
          <button
            aria-label={isRecording ? "Stop recording" : "Start recording"}
            className={recordClass}
            onClick={() => setRecordingState(!isRecording)}
            type="button"
          >
            <Mic aria-hidden="true" size={16} />
          </button>
          <input
            className="elizaos-voice-pill__input"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onComposerKeyDown}
            value={text}
          />
          <button
            aria-label="Send"
            className="elizaos-voice-pill__send"
            onClick={submit}
            type="button"
          >
            <Send aria-hidden="true" size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

export default VoicePill;
