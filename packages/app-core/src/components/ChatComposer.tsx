import { Button, Textarea } from "@miladyai/ui";
import { Mic, Paperclip, Send, Square, Volume2, VolumeX } from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  DESKTOP_CONTROL_SURFACE_ACCENT_CLASSNAME,
  DESKTOP_CONTROL_SURFACE_CLASSNAME,
  DESKTOP_CONTROL_SURFACE_DESTRUCTIVE_CLASSNAME,
  DESKTOP_INPUT_SHELL_CLASSNAME,
} from "./desktop-surface-primitives";

type ChatComposerVariant = "default" | "game-modal";

interface ChatComposerVoiceState {
  supported: boolean;
  isListening: boolean;
  captureMode: "idle" | "compose" | "push-to-talk";
  interimTranscript: string;
  isSpeaking: boolean;
  toggleListening: () => void;
  startListening: (mode?: "compose" | "push-to-talk") => void | Promise<void>;
  stopListening: (options?: { submit?: boolean }) => void | Promise<void>;
}

interface ChatComposerProps {
  variant: ChatComposerVariant;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  chatInput: string;
  chatPendingImagesCount: number;
  isComposerLocked: boolean;
  isAgentStarting: boolean;
  chatSending: boolean;
  voice: ChatComposerVoiceState;
  agentVoiceEnabled: boolean;
  showAgentVoiceToggle?: boolean;
  t: (key: string) => string;
  onAttachImage: () => void;
  onChatInputChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onStop: () => void;
  onStopSpeaking: () => void;
  onToggleAgentVoice: () => void;
}

const COMPOSER_CONTROL_HEIGHT_CLASSNAME = "h-[46px]";
const COMPOSER_ICON_BUTTON_CLASSNAME = `${COMPOSER_CONTROL_HEIGHT_CLASSNAME} w-[46px] shrink-0`;
const COMPOSER_ACTION_BUTTON_CLASSNAME = `ml-1 flex items-center justify-center rounded-full transition-all duration-300 select-none active:scale-95 ${COMPOSER_ICON_BUTTON_CLASSNAME}`;
const COMMON_TEXTAREA_CLASSNAME = `w-full min-w-0 min-h-0 ${COMPOSER_CONTROL_HEIGHT_CLASSNAME} resize-none overflow-y-hidden max-h-[200px] outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 font-[var(--font-chat)] disabled:opacity-50`;
const COMPOSER_SURFACE_BUTTON_CLASSNAME = DESKTOP_CONTROL_SURFACE_CLASSNAME;
const COMPOSER_EMPHASIZED_BUTTON_CLASSNAME =
  DESKTOP_CONTROL_SURFACE_ACCENT_CLASSNAME;
const COMPOSER_DESTRUCTIVE_BUTTON_CLASSNAME =
  DESKTOP_CONTROL_SURFACE_DESTRUCTIVE_CLASSNAME;
const COMPOSER_GAME_BUTTON_CLASSNAME =
  "select-none rounded-full border border-[color:var(--onboarding-card-border)] bg-[image:linear-gradient(180deg,color-mix(in_srgb,var(--onboarding-card-bg)_72%,rgba(255,255,255,0.12)),color-mix(in_srgb,var(--onboarding-card-bg)_92%,rgba(0,0,0,0.04)))] text-[color:var(--onboarding-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_14px_34px_rgba(0,0,0,0.16)] ring-1 ring-inset ring-white/8 backdrop-blur-xl transition-[border-color,background-color,color,transform,box-shadow] duration-300 hover:border-[color:var(--onboarding-card-border-strong)] hover:bg-[image:linear-gradient(180deg,color-mix(in_srgb,var(--onboarding-card-bg-hover)_76%,rgba(255,255,255,0.14)),color-mix(in_srgb,var(--onboarding-card-bg-hover)_94%,rgba(0,0,0,0.05)))] hover:text-[color:var(--onboarding-text-strong)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_18px_40px_rgba(0,0,0,0.18)] active:scale-95";
const COMPOSER_GAME_BUTTON_ACTIVE_CLASSNAME =
  "select-none rounded-full border border-[color:var(--onboarding-accent-border)] bg-[image:linear-gradient(180deg,color-mix(in_srgb,var(--onboarding-accent-bg)_78%,rgba(255,255,255,0.12)),color-mix(in_srgb,var(--onboarding-accent-bg)_96%,rgba(0,0,0,0.02)))] text-[color:var(--onboarding-text-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_20px_rgba(207,175,90,0.18),0_14px_30px_rgba(0,0,0,0.16)] ring-1 ring-inset ring-white/10 backdrop-blur-xl transition-all duration-300 hover:border-[color:var(--onboarding-accent-border-hover)] hover:bg-[image:linear-gradient(180deg,color-mix(in_srgb,var(--onboarding-accent-bg-hover)_82%,rgba(255,255,255,0.14)),color-mix(in_srgb,var(--onboarding-accent-bg-hover)_98%,rgba(0,0,0,0.02)))] active:scale-95";

export function ChatComposer({
  variant,
  textareaRef,
  chatInput,
  chatPendingImagesCount,
  isComposerLocked,
  isAgentStarting,
  chatSending,
  voice,
  agentVoiceEnabled,
  showAgentVoiceToggle = true,
  t,
  onAttachImage,
  onChatInputChange,
  onKeyDown,
  onSend,
  onStop,
  onStopSpeaking,
  onToggleAgentVoice,
}: ChatComposerProps) {
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 310,
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 309px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const isGameModal = variant === "game-modal";
  const showVoiceButton = isGameModal || voice.supported;
  const defaultMicButtonClassName = voice.isListening
    ? `${COMPOSER_SURFACE_BUTTON_CLASSNAME} ${COMPOSER_EMPHASIZED_BUTTON_CLASSNAME}`
    : COMPOSER_SURFACE_BUTTON_CLASSNAME;
  const micIconClassName = isGameModal ? "w-5 h-5" : "w-4 h-4";
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushToTalkActiveRef = useRef(false);
  const suppressClickRef = useRef(false);
  const hasDraft = chatInput.trim().length > 0 || chatPendingImagesCount > 0;
  const shouldShowStopButton = chatSending && !hasDraft;
  const actionButtonTitle = shouldShowStopButton
    ? t("chat.stopGeneration")
    : isGameModal || !voice.isSpeaking || hasDraft
      ? isAgentStarting
        ? t("chat.agentStarting")
        : t("chat.send")
      : t("chat.stopSpeaking");
  const actionButtonLabel = isGameModal ? undefined : actionButtonTitle;
  const actionButtonClassName = isGameModal
    ? `${COMPOSER_ACTION_BUTTON_CLASSNAME} ${
        hasDraft
          ? COMPOSER_GAME_BUTTON_ACTIVE_CLASSNAME
          : `${COMPOSER_GAME_BUTTON_CLASSNAME} opacity-80`
      }`
    : `${COMPOSER_ACTION_BUTTON_CLASSNAME} ${DESKTOP_CONTROL_SURFACE_ACCENT_CLASSNAME} disabled:ring-0`;
  const inputPlaceholder = isNarrow ? "Message..." : t("chat.inputPlaceholder");
  const defaultTextareaPlaceholder = isAgentStarting
    ? t("chat.agentStarting")
    : voice.isListening
      ? voice.captureMode === "push-to-talk"
        ? t("chat.releaseToSend")
        : !chatInput.trim()
          ? t("chat.listening")
          : inputPlaceholder
      : inputPlaceholder;

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };
  }, []);

  const startPushToTalk = () => {
    if (isComposerLocked || voice.isListening) return;
    pushToTalkActiveRef.current = true;
    suppressClickRef.current = true;
    void voice.startListening("push-to-talk");
  };

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handleMicPointerDown = (_event: PointerEvent<HTMLButtonElement>) => {
    if (isComposerLocked || voice.isListening) return;
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      startPushToTalk();
    }, 180);
  };

  const handleMicPointerUp = () => {
    clearHoldTimer();
    if (!pushToTalkActiveRef.current) return;
    pushToTalkActiveRef.current = false;
    void voice.stopListening({ submit: true });
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const handleMicPointerCancel = () => {
    clearHoldTimer();
    if (!pushToTalkActiveRef.current) return;
    pushToTalkActiveRef.current = false;
    void voice.stopListening();
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const handleMicClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (isComposerLocked) return;
    if (voice.isListening && voice.captureMode === "compose") {
      void voice.stopListening();
      return;
    }
    if (voice.isListening) return;
    void voice.startListening("compose");
  };

  return (
    <div
      className={
        isGameModal
          ? "relative flex w-full items-end gap-2 max-[380px]:gap-1.5 transition-all"
          : "flex items-end gap-1.5 sm:gap-2"
      }
    >
      {!isGameModal && (
        <Button
          variant={chatPendingImagesCount > 0 ? "secondary" : "ghost"}
          size="icon"
          className={`${COMPOSER_ICON_BUTTON_CLASSNAME} ${
            chatPendingImagesCount > 0
              ? `${COMPOSER_SURFACE_BUTTON_CLASSNAME} ${COMPOSER_EMPHASIZED_BUTTON_CLASSNAME} ring-1 ring-inset ring-accent/25`
              : COMPOSER_SURFACE_BUTTON_CLASSNAME
          }`}
          onClick={onAttachImage}
          aria-label={t("aria.attachImage")}
          title={t("chatview.AttachImage")}
          disabled={isComposerLocked}
        >
          <Paperclip className="w-4 h-4" />
        </Button>
      )}

      {showVoiceButton && (
        <Button
          variant="ghost"
          size="icon"
          className={
            isGameModal
              ? `flex items-center justify-center ${COMPOSER_ICON_BUTTON_CLASSNAME} ${
                  voice.isListening
                    ? `animate-pulse ${COMPOSER_GAME_BUTTON_ACTIVE_CLASSNAME}`
                    : COMPOSER_GAME_BUTTON_CLASSNAME
                } ${isComposerLocked ? "opacity-50" : ""}`
              : `${COMPOSER_ICON_BUTTON_CLASSNAME} ${defaultMicButtonClassName}`
          }
          onClick={handleMicClick}
          onPointerDown={handleMicPointerDown}
          onPointerUp={handleMicPointerUp}
          onPointerCancel={handleMicPointerCancel}
          onPointerLeave={handleMicPointerCancel}
          aria-label={
            isAgentStarting
              ? t("chat.agentStarting")
              : voice.isListening
                ? voice.captureMode === "push-to-talk"
                  ? t("chat.releaseToSend")
                  : t("chat.stopListening")
                : t("chat.voiceInput")
          }
          aria-pressed={isGameModal ? undefined : voice.isListening}
          title={
            isAgentStarting
              ? t("chat.agentStarting")
              : voice.isListening
                ? voice.captureMode === "push-to-talk"
                  ? t("chat.releaseToSend")
                  : t("chat.stopListening")
                : t("chat.clickToDictate")
          }
          disabled={isComposerLocked}
        >
          <Mic className={micIconClassName} />
        </Button>
      )}

      <div
        className={
          isGameModal
            ? "relative flex min-h-[46px] min-w-0 flex-1 items-center overflow-hidden rounded-[26px] border border-[color:var(--onboarding-card-border)] bg-[image:linear-gradient(180deg,color-mix(in_srgb,var(--onboarding-card-bg)_72%,rgba(255,255,255,0.14)),color-mix(in_srgb,var(--onboarding-card-bg)_94%,rgba(0,0,0,0.04)))] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_20px_44px_rgba(0,0,0,0.16)] ring-1 ring-inset ring-white/8 backdrop-blur-2xl transition-[border-color,background-color,box-shadow] duration-300 before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.42),transparent)] focus-within:border-[color:var(--onboarding-card-border-strong)] focus-within:bg-[image:linear-gradient(180deg,color-mix(in_srgb,var(--onboarding-card-bg-hover)_78%,rgba(255,255,255,0.16)),color-mix(in_srgb,var(--onboarding-card-bg-hover)_96%,rgba(0,0,0,0.04)))] focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_24px_52px_rgba(0,0,0,0.18)]"
            : `flex min-h-[46px] min-w-0 flex-1 items-center rounded-[16px] ${DESKTOP_INPUT_SHELL_CLASSNAME}`
        }
      >
        <Textarea
          ref={textareaRef}
          data-testid="chat-composer-textarea"
          className={
            isGameModal
              ? `${COMMON_TEXTAREA_CLASSNAME} relative z-[1] max-h-[150px] border-none bg-transparent px-4 py-2.5 text-[15px] leading-relaxed text-[color:var(--onboarding-text-strong)] placeholder:text-[color:color-mix(in_srgb,var(--onboarding-text-muted)_88%,white_12%)] max-[380px]:px-3.5`
              : `${COMMON_TEXTAREA_CLASSNAME} px-3.5 py-2 bg-transparent border-none text-[15px] leading-[1.7] text-txt-strong placeholder:text-muted`
          }
          style={{ fontFamily: "var(--font-chat)" }}
          rows={1}
          aria-label="Chat message"
          placeholder={
            isGameModal
              ? isAgentStarting
                ? t("chat.agentStarting")
                : voice.isListening
                  ? voice.captureMode === "push-to-talk"
                    ? "Release to send..."
                    : t("chat.listening")
                  : inputPlaceholder
              : defaultTextareaPlaceholder
          }
          value={chatInput}
          onChange={(event) => onChatInputChange(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={isComposerLocked}
        />
      </div>

      {showAgentVoiceToggle && (
        <Button
          variant="ghost"
          size="icon"
          className={
            isGameModal
              ? `${COMPOSER_ICON_BUTTON_CLASSNAME} ${
                  agentVoiceEnabled
                    ? COMPOSER_GAME_BUTTON_ACTIVE_CLASSNAME
                    : COMPOSER_GAME_BUTTON_CLASSNAME
                }`
              : `${COMPOSER_ICON_BUTTON_CLASSNAME} ${agentVoiceEnabled ? `${COMPOSER_SURFACE_BUTTON_CLASSNAME} ${COMPOSER_EMPHASIZED_BUTTON_CLASSNAME}` : COMPOSER_SURFACE_BUTTON_CLASSNAME}`
          }
          onClick={onToggleAgentVoice}
          aria-label={
            agentVoiceEnabled ? t("aria.agentVoiceOn") : t("aria.agentVoiceOff")
          }
          aria-pressed={agentVoiceEnabled}
          title={
            agentVoiceEnabled ? t("aria.agentVoiceOn") : t("aria.agentVoiceOff")
          }
        >
          {agentVoiceEnabled ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
        </Button>
      )}

      {shouldShowStopButton ? (
        <Button
          variant="destructive"
          data-testid="chat-composer-action"
          className={`${COMPOSER_ACTION_BUTTON_CLASSNAME} ${COMPOSER_DESTRUCTIVE_BUTTON_CLASSNAME}`}
          onClick={onStop}
          size="icon"
          title={actionButtonLabel}
          aria-label={actionButtonLabel}
        >
          <Square className="w-4 h-4 fill-current" />
        </Button>
      ) : !isGameModal && voice.isSpeaking && !hasDraft ? (
        <Button
          variant="destructive"
          data-testid="chat-composer-action"
          className={`${COMPOSER_ACTION_BUTTON_CLASSNAME} ${COMPOSER_DESTRUCTIVE_BUTTON_CLASSNAME}`}
          onClick={onStopSpeaking}
          size="icon"
          title={actionButtonLabel}
          aria-label={actionButtonLabel}
        >
          <Square className="w-4 h-4 fill-current" />
        </Button>
      ) : (
        <Button
          variant="default"
          data-testid="chat-composer-action"
          size="icon"
          className={actionButtonClassName}
          onClick={onSend}
          disabled={isComposerLocked || !hasDraft}
          aria-label={actionButtonLabel}
          title={actionButtonLabel}
        >
          <Send className="w-5 h-5" />
        </Button>
      )}
    </div>
  );
}
