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
    placeholder = "Ask Eliza...",
    onSubmit,
    onAdd,
    ariaLabel = "Eliza",
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

  const stopPropagation = useCallback(
    (event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>) => {
      event.stopPropagation();
    },
    [],
  );

  const handleMicClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      setRecording(!recording);
    },
    [recording, setRecording],
  );

  const handleAddClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onAdd?.();
    },
    [onAdd],
  );

  const handleSendClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      send();
    },
    [send],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setInputValue(event.target.value);
    },
    [],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        send();
      }
    },
    [send],
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
      {/* biome-ignore lint/a11y/useSemanticElements: this wrapper contains nested chat input controls. */}
      <div
        className="elizaos-voice-pill__hit"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={handleHitClick}
        onKeyDown={handleHitKeyDown}
      >
        <div ref={chatRef} className={chatClassName} aria-hidden={!open}>
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
              onClick={handleAddClick}
              tabIndex={open ? 0 : -1}
            >
              <PlusIcon />
            </button>
            <input
              ref={inputRef}
              type="text"
              className="elizaos-voice-pill__input"
              placeholder={placeholder}
              aria-label="Message Eliza"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              onClick={stopPropagation}
              onMouseDown={stopPropagation}
              tabIndex={open ? 0 : -1}
            />
            <button
              type="button"
              className={micClassName}
              aria-label="Audio"
              aria-pressed={recording}
              onClick={handleMicClick}
              tabIndex={open ? 0 : -1}
            >
              <MicIcon />
            </button>
            <button
              type="button"
              className="elizaos-voice-pill__send"
              aria-label="Send"
              onClick={handleSendClick}
              tabIndex={open ? 0 : -1}
            >
              <SendIcon />
            </button>
          </div>
        </div>
        <span className={pillClassName} aria-hidden="true" />
      </div>
    </div>
  );
}

VoicePill.displayName = "VoicePill";

export default VoicePill;
