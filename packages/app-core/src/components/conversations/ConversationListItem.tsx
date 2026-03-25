import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@miladyai/ui";
import { PencilLine, X } from "lucide-react";
import type React from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  APP_SIDEBAR_CARD_ACTIVE_CLASSNAME,
  APP_SIDEBAR_CARD_INACTIVE_CLASSNAME,
} from "../sidebar-shell-styles";
import {
  formatRelativeTime,
  getLocalizedConversationTitle,
} from "./conversation-utils";

const GAME_MODAL_ROW_BASE_CLASSNAME =
  "group relative flex w-full items-start gap-2 rounded-xl border p-2.5 transition-all sm:gap-3";
const GAME_MODAL_ROW_ACTIVE_CLASSNAME =
  "border-[color:var(--onboarding-accent-border)] bg-[color:var(--onboarding-accent-bg)] shadow-[0_14px_28px_rgba(0,0,0,0.2)]";
const GAME_MODAL_ROW_INACTIVE_CLASSNAME =
  "border-transparent bg-transparent hover:border-white/10 hover:bg-white/5";
const GAME_MODAL_ROW_ACTION_CLASSNAME =
  "h-8 w-8 shrink-0 self-center rounded-lg border border-white/10 bg-black/20 text-[color:var(--onboarding-text-muted)] shadow-sm transition-[border-color,background-color,color,opacity] hover:border-[color:var(--onboarding-accent-border)] hover:bg-[color:var(--onboarding-accent-bg)] hover:text-[color:var(--onboarding-text-strong)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent";
const DEFAULT_ROW_ACTION_CLASSNAME =
  "h-8 w-8 shrink-0 rounded-lg border border-border/40 bg-card/80 text-muted-strong shadow-sm transition-[border-color,background-color,color,opacity] hover:border-border-strong hover:bg-bg-hover hover:text-txt focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent";
const DEFAULT_ROW_BASE_CLASSNAME =
  "group relative flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 transition-all duration-150 focus-within:ring-2 focus-within:ring-accent/35";
const DEFAULT_ROW_ACTIVE_CLASSNAME = APP_SIDEBAR_CARD_ACTIVE_CLASSNAME;
const DEFAULT_ROW_INACTIVE_CLASSNAME = APP_SIDEBAR_CARD_INACTIVE_CLASSNAME;

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
  }, [measure]);

  const spanClass = isGameModal
    ? `block w-full min-w-0 max-w-full text-[13px] font-medium truncate leading-tight text-left transition-colors ${
        isActive
          ? "text-txt text-shadow-glow"
          : "text-white/90 group-hover:text-white"
      }`
    : `block min-w-0 max-w-full flex-1 truncate text-left text-[13px] font-semibold leading-[1.2] tracking-[-0.01em] transition-colors ${
        isActive
          ? "text-txt"
          : "text-[color:color-mix(in_srgb,var(--text-strong)_88%,var(--text)_12%)] group-hover:text-txt"
      }`;

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
  const updatedLabel = formatRelativeTime(conv.updatedAt, t);

  return (
    <div
      key={conv.id}
      data-testid="conv-item"
      data-active={isActive || undefined}
      className={`min-w-0 w-full ${
        isGameModal ? GAME_MODAL_ROW_BASE_CLASSNAME : DEFAULT_ROW_BASE_CLASSNAME
      } ${
        isActive
          ? isGameModal
            ? GAME_MODAL_ROW_ACTIVE_CLASSNAME
            : DEFAULT_ROW_ACTIVE_CLASSNAME
          : isGameModal
            ? GAME_MODAL_ROW_INACTIVE_CLASSNAME
            : DEFAULT_ROW_INACTIVE_CLASSNAME
      }`}
    >
      <Button
        variant="ghost"
        size="sm"
        data-testid="conv-select"
        className={
          isGameModal
            ? "flex w-full min-w-0 flex-1 flex-col !items-start !justify-start !text-left cursor-pointer h-auto p-0 rounded-none bg-transparent border-none overflow-hidden"
            : "flex min-w-0 flex-1 items-start gap-3 overflow-hidden bg-transparent border-0 p-0 m-0 text-left h-auto cursor-pointer rounded-none"
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
                ? "absolute left-3 top-3 z-[1] h-2 w-2 shrink-0 rounded-full bg-accent animate-pulse shadow-[0_0_10px_rgba(var(--accent),0.6)]"
                : "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent shadow-[0_0_8px_rgba(var(--accent),0.35)]"
            }
          />
        )}

        <div className="min-w-0 flex-1">
          <TruncatingConversationTitle
            displayTitle={displayTitle}
            isGameModal={isGameModal}
            isActive={isActive}
          />
          {!isGameModal ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium leading-none text-muted/78 [font-variant-numeric:tabular-nums]">
              <span>{updatedLabel}</span>
              {isUnread ? (
                <span className="rounded-full border border-accent/20 bg-accent/8 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.02em] text-accent-fg">
                  New
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </Button>

      {confirmDeleteId !== conv.id ? (
        <Button
          size="icon"
          variant="ghost"
          data-testid="conv-rename"
          aria-label={t("conversations.rename")}
          className={
            isGameModal
              ? `${GAME_MODAL_ROW_ACTION_CLASSNAME} ${rowActionVisibility}`
              : `${DEFAULT_ROW_ACTION_CLASSNAME} ${rowActionVisibility} hover:text-accent`
          }
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRequestRename(conv);
          }}
        >
          <PencilLine className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </Button>
      ) : null}

      {confirmDeleteId !== conv.id ? (
        <Button
          size="icon"
          variant="ghost"
          data-testid="conv-delete"
          aria-label={t("conversations.delete")}
          className={
            isGameModal
              ? `${GAME_MODAL_ROW_ACTION_CLASSNAME} ${rowActionVisibility} hover:text-danger`
              : `${DEFAULT_ROW_ACTION_CLASSNAME} ${rowActionVisibility} hover:text-danger`
          }
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRequestDeleteConfirm(conv.id);
          }}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </Button>
      ) : null}

      {confirmDeleteId === conv.id ? (
        <div className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-danger/25 bg-danger/8 px-2 py-1 shadow-sm">
          <span className="text-[10px] font-medium text-danger">
            {t("conversations.deleteConfirm")}
          </span>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 rounded-md px-2 py-0.5 text-[10px] shadow-sm disabled:opacity-50"
            onClick={() => void onConfirmDelete(conv.id)}
            disabled={deletingId === conv.id}
          >
            {deletingId === conv.id ? "..." : t("conversations.deleteYes")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-md px-2 py-0.5 text-[10px] text-muted-strong shadow-sm hover:border-accent/40 hover:text-txt disabled:opacity-50"
            onClick={() => onCancelDelete()}
            disabled={deletingId === conv.id}
          >
            {t("conversations.deleteNo")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
