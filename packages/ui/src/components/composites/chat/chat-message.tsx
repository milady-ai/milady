import type * as React from "react";

import {
  type KeyboardEvent,
  memo,
  type TouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";
import { ChatBubble } from "./chat-bubble";
import { ChatMessageActions } from "./chat-message-actions";
import type { ChatMessageData, ChatMessageLabels } from "./chat-types";

export interface ChatMessageProps {
  agentName?: string;
  children?: React.ReactNode;
  isGrouped?: boolean;
  labels?: ChatMessageLabels;
  message: ChatMessageData;
  onCopy?: (text: string) => void;
  onDelete?: (messageId: string) => void;
  onEdit?: (messageId: string, text: string) => Promise<boolean> | boolean;
  onSpeak?: (messageId: string, text: string) => void;
}

export const ChatMessage = memo(function ChatMessage({
  message,
  isGrouped = false,
  agentName = "Agent",
  children,
  labels = {},
  onCopy,
  onSpeak,
  onEdit,
  onDelete,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const canPlay = Boolean(
    !isUser && typeof onSpeak === "function" && message.text.trim(),
  );

  const handleCopy = useCallback(() => {
    onCopy?.(message.text);
    setCopied(true);
    if (copiedTimerRef.current !== null) {
      clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, 2000);
  }, [message.text, onCopy]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

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

  return (
    <article
      ref={articleRef}
      className={`flex items-start gap-2 sm:gap-3 ${isUser ? "justify-end" : "justify-start"} ${
        isGrouped ? "mt-1" : "mt-4"
      }`}
      data-testid="chat-message"
      data-role={message.role}
      onMouseEnter={supportsHover ? () => setShowActions(true) : undefined}
      onMouseLeave={supportsHover ? () => setShowActions(false) : undefined}
      onTouchEnd={handleTapReveal}
      aria-label={`${isUser ? "Your" : agentName} message`}
    >
      <div
        className={`max-w-[88%] min-w-0 sm:max-w-[80%] ${isUser ? "mr-1" : ""}`}
      >
        {!isUser && !isGrouped ? (
          <div className="mb-1 text-[12px] font-semibold text-accent">
            {agentName}
          </div>
        ) : null}
        <ChatBubble
          tone={isUser ? "user" : "assistant"}
          className={`relative group rounded-[18px] px-4 py-3 text-[15px] leading-[1.7] whitespace-pre-wrap break-words ${
            isUser ? "rounded-br-[6px]" : "rounded-bl-[6px]"
          }`}
          style={{ fontFamily: "var(--font-chat)" }}
        >
          {isEditing ? (
            <div className="space-y-3">
              <Textarea
                ref={editTextareaRef}
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                onKeyDown={handleEditKeyDown}
                className="min-h-[110px] w-full rounded-[14px] border border-border/28 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_86%,transparent),color-mix(in_srgb,var(--bg)_95%,transparent))] px-3 py-2.5 text-[15px] leading-[1.7] text-txt outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_14px_20px_-20px_rgba(15,23,42,0.1)] focus-visible:border-accent/28 focus-visible:ring-2 focus-visible:ring-accent/12"
                style={{ fontFamily: "var(--font-chat)" }}
                aria-label={labels.edit ?? "Edit message"}
                disabled={savingEdit}
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="surface"
                  size="sm"
                  onClick={handleCancelEditing}
                  disabled={savingEdit}
                  className="h-8 rounded-[11px] px-3 text-xs"
                >
                  {labels.cancel ?? "Cancel"}
                </Button>
                <Button
                  variant="surfaceAccent"
                  size="sm"
                  onClick={() => void handleSaveEdit()}
                  disabled={
                    savingEdit ||
                    !draftText.trim() ||
                    draftText.trim() === message.text.trim()
                  }
                  className="h-8 rounded-[11px] px-3 text-xs disabled:border-border/20 disabled:bg-bg-accent disabled:text-muted-strong"
                >
                  {savingEdit
                    ? (labels.saving ?? "Saving...")
                    : (labels.saveAndResend ?? "Save and resend")}
                </Button>
              </div>
            </div>
          ) : (
            (children ?? message.text)
          )}

          {!isUser && message.interrupted ? (
            <div className="mt-2 border-t border-danger/30 pt-2">
              <span className="inline-flex rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                {labels.responseInterrupted ?? "Response interrupted"}
              </span>
            </div>
          ) : null}

          {!isEditing ? (
            <div
              className={`absolute ${
                isUser ? "left-0 -translate-x-full" : "right-0 translate-x-full"
              } top-0 flex items-center gap-1 transition-opacity duration-200 ${
                actionsVisible ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <ChatMessageActions
                canDelete={Boolean(onDelete)}
                canEdit={canEdit}
                canPlay={canPlay}
                copied={copied}
                labels={labels}
                onCopy={handleCopy}
                onDelete={() => onDelete?.(message.id)}
                onEdit={handleStartEditing}
                onPlay={() => onSpeak?.(message.id, message.text)}
              />
            </div>
          ) : null}
        </ChatBubble>
      </div>
    </article>
  );
});
