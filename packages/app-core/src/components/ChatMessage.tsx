/**
 * Enhanced chat message component with actions and better UX.
 */

import type { ConversationMessage } from "@miladyai/app-core/api";
import { useTimeout } from "@miladyai/app-core/hooks";
import { useApp } from "@miladyai/app-core/state";
import { Button, Textarea } from "@miladyai/ui";
import { Check, Copy, Pencil, Trash2, Volume2 } from "lucide-react";
import {
  type KeyboardEvent,
  memo,
  type TouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { MessageContent } from "./MessageContent";

interface ChatMessageProps {
  message: ConversationMessage;
  isGrouped?: boolean;
  agentName?: string;
  agentAvatarSrc?: string | null;
  onCopy?: (text: string) => void;
  onSpeak?: (messageId: string, text: string) => void;
  onEdit?: (messageId: string, text: string) => Promise<boolean> | boolean;
  onDelete?: (messageId: string) => void;
}

export const ChatMessage = memo(function ChatMessage({
  message,
  isGrouped = false,
  agentName = "Agent",
  onCopy,
  onSpeak,
  onEdit,
  onDelete,
}: ChatMessageProps) {
  const { setTimeout } = useTimeout();

  const { copyToClipboard, t } = useApp();
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [supportsHover, setSupportsHover] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(hover: hover) and (pointer: fine)").matches
      : true,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(message.text);
  const [savingEdit, setSavingEdit] = useState(false);
  const articleRef = useRef<HTMLElement | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isUser = message.role === "user";
  const canEdit =
    isUser &&
    typeof onEdit === "function" &&
    message.source !== "local_command" &&
    !message.id.startsWith("temp-");
  const canPlay =
    !isUser && typeof onSpeak === "function" && message.text.trim();

  const handleCopy = useCallback(() => {
    if (onCopy) {
      onCopy(message.text);
    } else {
      void copyToClipboard(message.text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [copyToClipboard, message.text, onCopy, setTimeout]);

  const handleStartEditing = useCallback(() => {
    if (!canEdit || savingEdit) return;
    setDraftText(message.text);
    setIsEditing(true);
  }, [canEdit, message.text, savingEdit]);

  const handleCancelEditing = useCallback(() => {
    if (savingEdit) return;
    setDraftText(message.text);
    setIsEditing(false);
  }, [message.text, savingEdit]);

  const handleSaveEdit = useCallback(async () => {
    if (!onEdit) return;
    const nextText = draftText.trim();
    if (!nextText) return;
    if (nextText === message.text.trim()) {
      setDraftText(message.text);
      setIsEditing(false);
      return;
    }

    setSavingEdit(true);
    try {
      const saved = await onEdit(message.id, nextText);
      if (saved !== false) {
        setIsEditing(false);
      }
    } finally {
      setSavingEdit(false);
    }
  }, [draftText, message.id, message.text, onEdit]);

  const handleTapReveal = useCallback(
    (event: TouchEvent<HTMLElement>) => {
      if (supportsHover || isEditing) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, textarea, input")) {
        return;
      }
      setShowActions((prev) => !prev);
    },
    [isEditing, supportsHover],
  );

  const handleEditKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCancelEditing();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void handleSaveEdit();
      }
    },
    [handleCancelEditing, handleSaveEdit],
  );

  useEffect(() => {
    if (!isEditing) {
      setDraftText(message.text);
      return;
    }
    const textarea = editTextareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [isEditing, message.text]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const syncSupportsHover = () => {
      setSupportsHover(mediaQuery.matches);
      if (mediaQuery.matches) {
        setShowActions(false);
      }
    };
    syncSupportsHover();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncSupportsHover);
      return () => mediaQuery.removeEventListener("change", syncSupportsHover);
    }

    mediaQuery.addListener(syncSupportsHover);
    return () => mediaQuery.removeListener(syncSupportsHover);
  }, []);

  useEffect(() => {
    if (supportsHover || !showActions || typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        setShowActions(false);
        return;
      }
      if (!articleRef.current?.contains(target)) {
        setShowActions(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [showActions, supportsHover]);

  const actionsVisible = showActions;
  const bubbleClassName = isUser
    ? "rounded-br-md border border-accent/35 bg-accent/16 text-txt shadow-sm"
    : "rounded-bl-md border border-border/70 bg-card/96 text-txt shadow-sm";
  const actionRailClassName =
    "top-1 rounded-xl border border-border/60 bg-card/96 p-1 shadow-sm backdrop-blur-sm";
  const actionButtonClassName =
    "h-8 w-8 rounded-lg border border-border/45 bg-card/92 text-muted-strong shadow-sm transition-[background-color,color,border-color,box-shadow] hover:border-border-strong hover:bg-bg-hover hover:text-txt";

  return (
    <article
      ref={articleRef}
      className={`flex items-start gap-2 sm:gap-3 ${isUser ? "justify-end" : "justify-start"} ${isGrouped ? "mt-1" : "mt-4"}`}
      data-testid="chat-message"
      data-role={message.role}
      onMouseEnter={supportsHover ? () => setShowActions(true) : undefined}
      onMouseLeave={supportsHover ? () => setShowActions(false) : undefined}
      onTouchEnd={handleTapReveal}
      aria-label={`${isUser ? "Your" : agentName} message`}
    >
      {/* Message Bubble */}
      <div
        className={`max-w-[88%] sm:max-w-[80%] min-w-0 ${isUser ? "mr-1" : ""}`}
      >
        {/* Message Content */}
        <div
          className={`relative group rounded-2xl px-4 py-2.5 text-[15px] leading-[1.7] whitespace-pre-wrap break-words ${bubbleClassName}`}
          style={{ fontFamily: "var(--font-chat)" }}
        >
          {isEditing ? (
            <div className="space-y-3">
              <Textarea
                ref={editTextareaRef}
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                onKeyDown={handleEditKeyDown}
                className="min-h-[110px] w-full rounded-xl border border-border-strong/70 bg-bg/80 px-3 py-2 text-[15px] leading-[1.7] text-txt outline-none shadow-inner focus-visible:border-accent/55 focus-visible:ring-2 focus-visible:ring-accent/20"
                style={{ fontFamily: "var(--font-chat)" }}
                aria-label={t("aria.editMessage")}
                disabled={savingEdit}
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelEditing}
                  disabled={savingEdit}
                  className="h-8 rounded-lg border border-border/45 px-3 text-xs text-muted-strong hover:border-border-strong hover:bg-bg-hover hover:text-txt"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSaveEdit()}
                  disabled={
                    savingEdit ||
                    !draftText.trim() ||
                    draftText.trim() === message.text.trim()
                  }
                  className="h-8 rounded-lg border-accent/35 bg-accent/12 px-3 text-xs text-accent-fg hover:border-accent/55 hover:bg-accent/18 disabled:border-border/50 disabled:bg-bg-accent disabled:text-muted-strong"
                >
                  {savingEdit ? "Saving..." : "Save and resend"}
                </Button>
              </div>
            </div>
          ) : (
            <MessageContent message={message} />
          )}

          {/* Stream interruption indicator */}
          {!isUser && message.interrupted && (
            <div className="mt-2 border-t border-danger/30 pt-2">
              <span className="inline-flex rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                {t("chatmessage.ResponseInterrupte")}
              </span>
            </div>
          )}

          {/* Message Actions */}
          {!isEditing && (
            <div
              className={`absolute ${isUser ? "left-0 -translate-x-full" : "right-0 translate-x-full"} top-0 flex items-center gap-1 transition-opacity duration-200 ${
                actionsVisible ? "opacity-100" : "pointer-events-none opacity-0"
              } ${actionRailClassName}`}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={(event) => {
                  event?.stopPropagation?.();
                  handleCopy();
                }}
                className={actionButtonClassName}
                title={copied ? "Copied!" : "Copy message"}
                aria-label={copied ? "Copied to clipboard" : "Copy message"}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-ok" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>

              {canPlay && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(event) => {
                    event?.stopPropagation?.();
                    onSpeak?.(message.id, message.text);
                  }}
                  className={actionButtonClassName}
                  title={t("aria.playMessage")}
                  aria-label={t("aria.playMessage")}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </Button>
              )}

              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(event) => {
                    event?.stopPropagation?.();
                    handleStartEditing();
                  }}
                  className={actionButtonClassName}
                  title={t("aria.editMessage")}
                  aria-label={t("aria.editMessage")}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              )}

              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(event) => {
                    event?.stopPropagation?.();
                    onDelete(message.id);
                  }}
                  className={`${actionButtonClassName} hover:border-danger/45 hover:bg-danger/10 hover:text-danger`}
                  title={t("chatmessage.DeleteMessage")}
                  aria-label={t("aria.deleteMessage")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
});

/* ── Typing Indicator ────────────────────────────────────────────────── */

export const TypingIndicator = memo(function TypingIndicator({
  agentName,
  agentAvatarSrc,
}: {
  agentName: string;
  agentAvatarSrc?: string | null;
}) {
  const agentInitial = agentName.trim().charAt(0).toUpperCase() || "A";

  return (
    <div className="flex items-start gap-2 sm:gap-3 mt-4">
      <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden border border-border bg-bg-hover shadow-sm">
        {agentAvatarSrc ? (
          <img
            src={agentAvatarSrc}
            alt={`${agentName} avatar`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-txt bg-accent-subtle">
            {agentInitial}
          </div>
        )}
      </div>

      <div className="max-w-[88%] sm:max-w-[80%] min-w-0">
        <div className="text-[12px] font-semibold text-txt mb-1">
          {agentName}
        </div>
        <div className="px-4 py-3 bg-bg-accent border border-border rounded-2xl rounded-bl-md">
          <div className="flex gap-1">
            <span
              className="w-2 h-2 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="w-2 h-2 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]"
              style={{ animationDelay: "200ms" }}
            />
            <span
              className="w-2 h-2 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]"
              style={{ animationDelay: "400ms" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

// ChatEmptyState removed
