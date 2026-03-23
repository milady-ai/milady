import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@miladyai/ui";
import { PencilLine, X } from "lucide-react";
import type React from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { getLocalizedConversationTitle } from "./conversation-utils";

interface ConversationListItemProps {
  conv: { id: string; title: string; updatedAt: string };
  isActive: boolean;
  isUnread: boolean;
  isGameModal: boolean;
  confirmDeleteId: string | null;
  deletingId: string | null;
  t: (
    key: string,
    vars?: Record<string, string | number | boolean | null | undefined>,
  ) => string;
  mobile: boolean;
  onSelect: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onRequestDeleteConfirm: (id: string) => void;
  onRequestRename: (conv: { id: string; title: string }) => void;
  onOpenActions: (
    event:
      | React.MouseEvent<HTMLButtonElement | HTMLDivElement>
      | React.TouchEvent<HTMLButtonElement | HTMLDivElement>,
    conv: { id: string; title: string },
  ) => void;
}

/**
 * Ellipsis is CSS `truncate` driven by flex `min-w-0` (width-based), not a char cap.
 * We only wrap in Tooltip when scrollWidth > clientWidth so short titles stay quiet.
 * ResizeObserver + window resize re-run the check when the sidebar rail width changes.
 */
function TruncatingConversationTitle({
  displayTitle,
  isGameModal,
  isActive,
}: {
  displayTitle: string;
  isGameModal: boolean;
  isActive: boolean;
}) {
  const titleRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const measure = useCallback(() => {
    const el = titleRef.current;
    if (!el) return;
    setIsTruncated(el.scrollWidth > el.clientWidth + 1);
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = titleRef.current;
    if (!el) return;

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        measure();
      });
      ro.observe(el);
    }

    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, displayTitle]);

  const spanClass = isGameModal
    ? `block w-full min-w-0 max-w-full text-[13px] font-medium truncate leading-tight text-left transition-colors ${
        isActive
          ? "text-txt text-shadow-glow"
          : "text-white/90 group-hover:text-white"
      }`
    : "block min-w-0 max-w-full flex-1 font-medium truncate text-left text-txt";

  const span = (
    <span
      ref={titleRef}
      className={spanClass}
      {...(isTruncated ? { title: displayTitle } : {})}
    >
      {displayTitle}
    </span>
  );

  if (!isTruncated) {
    return span;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{span}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="start"
        sideOffset={10}
        collisionPadding={12}
        className="z-[200] max-w-[min(90vw,22rem)] whitespace-normal break-words px-3 py-2 text-[13px] leading-snug"
      >
        {displayTitle}
      </TooltipContent>
    </Tooltip>
  );
}

export function ConversationListItem({
  conv,
  isActive,
  isUnread,
  isGameModal,
  confirmDeleteId,
  deletingId,
  t,
  mobile,
  onSelect,
  onConfirmDelete,
  onCancelDelete,
  onRequestDeleteConfirm,
  onRequestRename,
  onOpenActions,
}: ConversationListItemProps) {
  const longPressTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLButtonElement>) => {
    if (!mobile) return;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = true;
      onOpenActions(event, conv);
      clearLongPressTimer();
    }, 450);
  };

  const handleTouchEnd = () => {
    clearLongPressTimer();
  };

  const rowActionVisibility = mobile
    ? "opacity-100"
    : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto";

  const displayTitle = getLocalizedConversationTitle(conv.title, t);

  return (
    <div
      key={conv.id}
      data-testid="conv-item"
      data-active={isActive || undefined}
      className={`min-w-0 w-full ${
        isGameModal
          ? "group relative flex items-start gap-2 sm:gap-3 w-full p-2.5 rounded-xl cursor-pointer transition-all border border-transparent"
          : "group flex items-center min-w-0 pl-3 pr-2 py-2 gap-1 cursor-pointer transition-colors border-l-[3px]"
      } ${
        isActive
          ? isGameModal
            ? "bg-accent/15 border-accent/30 shadow-[0_0_15px_rgba(240,178,50,0.1)]"
            : "bg-bg-hover border-l-accent"
          : isGameModal
            ? "hover:bg-white/5 hover:border-white/10"
            : "border-l-transparent hover:bg-bg-hover"
      }`}
    >
      <>
        <Button
          variant="ghost"
          size="sm"
          data-testid="conv-select"
          className={
            isGameModal
              ? "flex w-full min-w-0 flex-1 flex-col !items-start !justify-start !text-left cursor-pointer h-auto p-0 rounded-none bg-transparent border-none overflow-hidden"
              : "flex min-w-0 flex-1 items-center gap-2 overflow-hidden bg-transparent border-0 p-0 m-0 text-left h-auto cursor-pointer rounded-none"
          }
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            onSelect(conv.id);
          }}
          onContextMenu={(event) => {
            if (mobile) return;
            onOpenActions(event, conv);
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onTouchMove={handleTouchEnd}
        >
          {isUnread && (
            <span
              className={
                isGameModal
                  ? "absolute top-3 left-3 z-[1] w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(240,178,50,0.8)] shrink-0"
                  : "w-2 h-2 rounded-full bg-accent shrink-0"
              }
            />
          )}

          <TruncatingConversationTitle
            displayTitle={displayTitle}
            isGameModal={isGameModal}
            isActive={isActive}
          />
        </Button>

        {confirmDeleteId !== conv.id ? (
          <button
            type="button"
            data-testid="conv-rename"
            aria-label={t("conversations.rename")}
            className={
              isGameModal
                ? `flex shrink-0 self-center h-7 w-7 items-center justify-center rounded-md border border-transparent text-white/50 transition-colors hover:border-white/15 hover:bg-white/10 hover:text-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${rowActionVisibility}`
                : `flex shrink-0 h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted transition-colors hover:border-border hover:bg-card hover:text-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${rowActionVisibility}`
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRequestRename(conv);
            }}
          >
            <PencilLine
              className="h-3.5 w-3.5"
              strokeWidth={2.25}
              aria-hidden
            />
          </button>
        ) : null}

        {confirmDeleteId !== conv.id ? (
          <button
            type="button"
            data-testid="conv-delete"
            aria-label={t("conversations.delete")}
            className={
              isGameModal
                ? `flex shrink-0 self-center h-7 w-7 items-center justify-center rounded-md border border-transparent text-white/50 transition-colors hover:border-white/15 hover:bg-white/10 hover:text-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${rowActionVisibility}`
                : `flex shrink-0 h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted transition-colors hover:border-border hover:bg-card hover:text-danger focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${rowActionVisibility}`
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRequestDeleteConfirm(conv.id);
            }}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </button>
        ) : null}

        {confirmDeleteId === conv.id ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-[10px] text-danger">
              {t("conversations.deleteConfirm")}
            </span>
            <Button
              variant="destructive"
              size="sm"
              className="h-6 px-1.5 py-0.5 text-[10px] text-white shadow-sm disabled:opacity-50"
              onClick={() => void onConfirmDelete(conv.id)}
              disabled={deletingId === conv.id}
            >
              {deletingId === conv.id ? "..." : t("conversations.deleteYes")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-1.5 py-0.5 text-[10px] text-muted shadow-sm hover:border-accent hover:text-txt disabled:opacity-50"
              onClick={() => onCancelDelete()}
              disabled={deletingId === conv.id}
            >
              {t("conversations.deleteNo")}
            </Button>
          </div>
        ) : null}
      </>
    </div>
  );
}
