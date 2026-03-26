import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TooltipProvider,
} from "@miladyai/ui";
import { PanelLeftClose, PanelLeftOpen, SquarePen, X } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../state";
import { ConversationListItem } from "./conversations/ConversationListItem";
import { ConversationRenameDialog } from "./conversations/ConversationRenameDialog";
import {
  DESKTOP_CONTROL_SURFACE_ACCENT_CLASSNAME,
  DESKTOP_CONTROL_SURFACE_CLASSNAME,
  DESKTOP_FLOATING_ACTION_RAIL_CLASSNAME,
} from "./desktop-surface-primitives";
import {
  APP_SIDEBAR_KICKER_CLASSNAME,
  APP_SIDEBAR_META_CLASSNAME,
  APP_SIDEBAR_PILL_CLASSNAME,
  APP_SIDEBAR_RAIL_CLASSNAME,
} from "./sidebar-shell-styles";

const DEFAULT_SIDEBAR_CLASS = "flex flex-col overflow-hidden text-[13px]";
const DEFAULT_SIDEBAR_DESKTOP_CLASS = `relative isolate h-full !w-[18.5rem] !min-w-[18.5rem] rounded-l-none rounded-tr-[26px] rounded-br-none border-y-0 border-l-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_-1px_0_0_rgba(255,255,255,0.05),0_20px_40px_-26px_rgba(15,23,42,0.18),12px_0_24px_-20px_rgba(15,23,42,0.1)] ring-1 ring-border/12 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.26),transparent)] after:pointer-events-none after:absolute after:bottom-0 after:right-0 after:top-[1.25rem] after:w-[2px] after:bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent_24%,transparent)] dark:ring-white/5 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_-1px_0_0_rgba(255,255,255,0.03),0_22px_42px_-28px_rgba(0,0,0,0.58),14px_0_24px_-18px_rgba(0,0,0,0.28),8px_-8px_16px_-24px_rgba(var(--accent-rgb),0.04)] dark:before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)] dark:after:bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_22%,transparent)] xl:!w-[20rem] xl:!min-w-[20rem] ${APP_SIDEBAR_RAIL_CLASSNAME}`;
const DEFAULT_SIDEBAR_DESKTOP_COLLAPSED_CLASS = `relative isolate h-full !w-[4.75rem] !min-w-[4.75rem] rounded-l-none rounded-tr-[24px] rounded-br-none border-y-0 border-l-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_-1px_0_0_rgba(255,255,255,0.04),0_16px_30px_-24px_rgba(15,23,42,0.16),9px_0_18px_-16px_rgba(15,23,42,0.08)] ring-1 ring-border/12 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)] after:pointer-events-none after:absolute after:bottom-0 after:right-0 after:top-[1rem] after:w-[2px] after:bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_24%,transparent)] dark:ring-white/5 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_-1px_0_0_rgba(255,255,255,0.025),0_18px_32px_-24px_rgba(0,0,0,0.5),10px_0_18px_-16px_rgba(0,0,0,0.24),6px_-6px_12px_-22px_rgba(var(--accent-rgb),0.035)] dark:before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)] dark:after:bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_22%,transparent)] ${APP_SIDEBAR_RAIL_CLASSNAME}`;
const DEFAULT_SIDEBAR_MOBILE_CLASS =
  "h-full w-full min-w-0 border-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_96%,transparent),color-mix(in_srgb,var(--bg)_92%,transparent))] shadow-none ring-0";
const GAME_MODAL_SIDEBAR_CLASS =
  "flex h-full flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,12,17,0.9),rgba(8,10,14,0.82))] shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl";
const DEFAULT_HEADER_PANEL_CLASS =
  "shrink-0 border-b border-border/25 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_34%,transparent),transparent)] px-3.5 pb-4 pt-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";
const GAME_MODAL_HEADER_PANEL_CLASS =
  "shrink-0 border-b border-white/10 bg-black/10 px-3.5 pb-3 pt-3.5";
const DEFAULT_MOBILE_HEADER_PANEL_CLASS =
  "sticky top-0 z-10 flex items-center justify-between border-b border-border/40 bg-card/88 px-3.5 py-2.5 backdrop-blur-md";
const SECTION_EYEBROW_CLASS = APP_SIDEBAR_KICKER_CLASSNAME;
const DEFAULT_HEADER_ACTIONS_CLASS = `flex items-center gap-1.5 rounded-[14px] px-1.5 py-1 ${DESKTOP_FLOATING_ACTION_RAIL_CLASSNAME}`;
const COUNT_BADGE_CLASS = `${APP_SIDEBAR_PILL_CLASSNAME} min-w-[2rem] justify-center border-border/24 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_82%,transparent),color-mix(in_srgb,var(--bg)_92%,transparent))] px-2.5 text-[10px] font-semibold tabular-nums text-muted-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_16px_-16px_rgba(15,23,42,0.14)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_18px_-16px_rgba(0,0,0,0.28)]`;
const UNREAD_BADGE_CLASS =
  "inline-flex min-h-6 min-w-[2rem] items-center justify-center rounded-full border border-accent/24 bg-[linear-gradient(180deg,rgba(var(--accent-rgb),0.14),rgba(var(--accent-rgb),0.06))] px-2.5 py-1 text-[10px] font-semibold tabular-nums text-txt-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_18px_-16px_rgba(var(--accent-rgb),0.22)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_20px_-18px_rgba(var(--accent-rgb),0.2)]";
const DEFAULT_LIST_REGION_CLASS =
  "custom-scrollbar min-h-0 w-full min-w-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-3 pt-3 supports-[scrollbar-gutter:stable]:[scrollbar-gutter:stable]";
const GAME_MODAL_LIST_REGION_CLASS =
  "custom-scrollbar flex-1 min-h-0 w-full overflow-y-auto p-2.5";
const DEFAULT_LIST_PANEL_CLASS =
  "flex min-h-full flex-col gap-2 rounded-[20px] border border-border/12 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_16%,transparent),transparent_48%)] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]";
const GAME_MODAL_LIST_PANEL_CLASS =
  "flex min-h-full flex-col gap-1.5 rounded-[22px] border border-white/10 bg-black/12 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";
const EMPTY_STATE_CLASS =
  "rounded-[20px] border border-border/24 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_64%,transparent),color-mix(in_srgb,var(--bg)_92%,transparent))] px-4 py-8 text-center text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_16px_24px_-22px_rgba(15,23,42,0.16)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_26px_-22px_rgba(0,0,0,0.28)]";
const COLLAPSED_STORAGE_KEY = "milady:chat-sidebar-collapsed";

type ConversationsSidebarVariant = "default" | "game-modal";

interface ConversationsSidebarProps {
  mobile?: boolean;
  onClose?: () => void;
  variant?: ConversationsSidebarVariant;
}

export function ConversationsSidebar({
  mobile = false,
  onClose,
  variant = "default",
}: ConversationsSidebarProps) {
  const {
    conversations,
    activeConversationId,
    unreadConversations,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    t,
  } = useApp();

  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuConversation, setMenuConversation] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const menuAnchorRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const sortedConversations = [...conversations].sort((a, b) => {
    const aTime = new Date(a.updatedAt).getTime();
    const bTime = new Date(b.updatedAt).getTime();
    return bTime - aTime;
  });

  const openRenameDialog = (conv: { id: string; title: string }) => {
    setConfirmDeleteId(null);
    setMenuConversation(null);
    setRenameTarget({ id: conv.id, title: conv.title });
  };

  const openActionsMenu = (
    event: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>,
    conv: { id: string; title: string },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setConfirmDeleteId(null);
    setMenuConversation(conv);
    if ("touches" in event) {
      const touch = event.touches[0] ?? event.changedTouches[0];
      setMenuPosition({ x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 });
      return;
    }
    setMenuPosition({ x: event.clientX, y: event.clientY });
  };

  const handleConfirmDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await handleDeleteConversation(id);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId((current) => (current === id ? null : current));
    }
  };

  const isGameModal = variant === "game-modal";
  const canCollapse = !mobile && !isGameModal;
  const isCollapsed = canCollapse && collapsed;
  const conversationCount = sortedConversations.length;
  const unreadCount = unreadConversations.size;
  const sidebarClassName = isGameModal
    ? GAME_MODAL_SIDEBAR_CLASS
    : `${DEFAULT_SIDEBAR_CLASS} ${
        mobile
          ? DEFAULT_SIDEBAR_MOBILE_CLASS
          : isCollapsed
            ? DEFAULT_SIDEBAR_DESKTOP_COLLAPSED_CLASS
            : DEFAULT_SIDEBAR_DESKTOP_CLASS
      }`;
  const listRegionClassName = isGameModal
    ? GAME_MODAL_LIST_REGION_CLASS
    : DEFAULT_LIST_REGION_CLASS;
  const listPanelClassName = isGameModal
    ? GAME_MODAL_LIST_PANEL_CLASS
    : DEFAULT_LIST_PANEL_CLASS;

  useEffect(() => {
    if (!canCollapse || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
    } catch {
      /* ignore persistence failures */
    }
  }, [canCollapse, collapsed]);

  return (
    <aside
      className={sidebarClassName}
      data-no-window-drag=""
      data-testid="conversations-sidebar"
      data-collapsed={isCollapsed || undefined}
      data-variant={variant}
      aria-label={t("conversations.chats")}
      onPointerDown={() => setMenuConversation(null)}
    >
      <TooltipProvider delayDuration={280} skipDelayDuration={120}>
        <ConversationRenameDialog
          open={renameTarget !== null}
          conversationId={renameTarget?.id ?? null}
          initialTitle={renameTarget?.title ?? ""}
          onClose={() => setRenameTarget(null)}
        />

        <DropdownMenu
          open={menuConversation !== null}
          onOpenChange={(open) => {
            if (!open) setMenuConversation(null);
          }}
        >
          <DropdownMenuTrigger asChild>
            <div
              ref={menuAnchorRef}
              aria-hidden
              className="fixed pointer-events-none h-0 w-0"
              style={{
                left: menuPosition.x,
                top: menuPosition.y,
              }}
            />
          </DropdownMenuTrigger>
          {menuConversation ? (
            <DropdownMenuContent
              sideOffset={6}
              align="start"
              className="w-40"
              onCloseAutoFocus={(event) => event.preventDefault()}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerDownOutside={() => setMenuConversation(null)}
              onInteractOutside={() => setMenuConversation(null)}
              avoidCollisions
              collisionPadding={12}
            >
              <DropdownMenuItem
                data-testid="conv-menu-edit"
                onClick={() => {
                  if (!menuConversation) return;
                  openRenameDialog(menuConversation);
                }}
              >
                {t("conversations.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="conv-menu-delete"
                className="text-danger focus:text-danger"
                onClick={() => {
                  if (!menuConversation) return;
                  setRenameTarget(null);
                  setConfirmDeleteId(menuConversation.id);
                  setMenuConversation(null);
                }}
              >
                {t("conversations.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          ) : null}
        </DropdownMenu>

        {!isGameModal && mobile && (
          <div className={DEFAULT_MOBILE_HEADER_PANEL_CLASS}>
            <div className="space-y-1">
              <div className={SECTION_EYEBROW_CLASS}>
                {t("conversations.chats")}
              </div>
              <div className={APP_SIDEBAR_META_CLASSNAME}>
                {conversationCount}
              </div>
            </div>
            <Button
              variant="outline"
              size="icon"
              data-testid="conversations-mobile-close"
              className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-xl"
              onClick={onClose}
              aria-label={t("conversations.closePanel")}
              title={t("conversations.closePanel")}
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}

        <div
          className={
            isGameModal
              ? GAME_MODAL_HEADER_PANEL_CLASS
              : DEFAULT_HEADER_PANEL_CLASS
          }
        >
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-3 py-1">
              <Button
                variant="outline"
                size="icon"
                data-testid="chat-sidebar-expand-toggle"
                className={`h-11 w-11 rounded-[14px] ${DESKTOP_CONTROL_SURFACE_CLASSNAME}`}
                aria-label="Expand chats panel"
                onClick={() => setCollapsed(false)}
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className={`h-11 w-11 rounded-[14px] ${DESKTOP_CONTROL_SURFACE_ACCENT_CLASSNAME}`}
                aria-label={t("conversations.newChat")}
                onClick={() => {
                  handleNewConversation();
                  onClose?.();
                }}
              >
                <SquarePen className="h-4 w-4" />
              </Button>
              <div className="flex flex-col items-center gap-2 pt-1">
                <div className={COUNT_BADGE_CLASS}>{conversationCount}</div>
                {unreadCount > 0 ? (
                  <div className={UNREAD_BADGE_CLASS}>{unreadCount}</div>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <div className={SECTION_EYEBROW_CLASS}>
                    {t("conversations.chats")}
                  </div>
                  <div
                    className={`${APP_SIDEBAR_META_CLASSNAME} max-w-[19ch] text-[13px] leading-[1.55] text-muted/84`}
                  >
                    Recent threads and unread replies.
                  </div>
                </div>
                <div className={DEFAULT_HEADER_ACTIONS_CLASS}>
                  <div className={COUNT_BADGE_CLASS}>{conversationCount}</div>
                  {unreadCount > 0 ? (
                    <div className={UNREAD_BADGE_CLASS}>{unreadCount}</div>
                  ) : null}
                  {canCollapse ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid="chat-sidebar-collapse-toggle"
                      className={`h-9 w-9 rounded-[11px] ${DESKTOP_CONTROL_SURFACE_CLASSNAME}`}
                      aria-label={t("conversations.closePanel")}
                      onClick={() => setCollapsed(true)}
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
              <Button
                variant="outline"
                className={
                  isGameModal
                    ? "h-11 w-full rounded-xl border-[color:var(--onboarding-accent-border)] bg-[color:var(--onboarding-accent-bg)] px-3 py-2 text-sm font-medium text-[color:var(--onboarding-text-strong)] shadow-[0_12px_28px_rgba(0,0,0,0.18)] hover:border-[color:var(--onboarding-accent-border-hover)] hover:bg-[color:var(--onboarding-accent-bg-hover)] active:scale-[0.98]"
                    : `min-h-[44px] w-full rounded-[14px] px-3 py-2.5 text-[12px] font-medium ${DESKTOP_CONTROL_SURFACE_ACCENT_CLASSNAME}`
                }
                onClick={() => {
                  handleNewConversation();
                  onClose?.();
                }}
              >
                {t("conversations.newChat")}
              </Button>
            </>
          )}
        </div>

        {!isCollapsed ? (
          <div className={listRegionClassName}>
            <div className={listPanelClassName}>
              {sortedConversations.length === 0 ? (
                <div
                  className={`${EMPTY_STATE_CLASS} ${
                    isGameModal
                      ? "border-white/10 bg-black/15 font-medium italic text-[color:var(--onboarding-text-muted)]"
                      : "border-border/50 bg-bg/35 text-muted"
                  }`}
                >
                  {t("conversations.none")}
                </div>
              ) : (
                sortedConversations.map((conv) => (
                  <ConversationListItem
                    key={conv.id}
                    conv={conv}
                    isActive={conv.id === activeConversationId}
                    isUnread={unreadConversations.has(conv.id)}
                    isGameModal={isGameModal}
                    confirmDeleteId={confirmDeleteId}
                    deletingId={deletingId}
                    t={t}
                    mobile={mobile}
                    onSelect={(id) => {
                      setConfirmDeleteId(null);
                      setMenuConversation(null);
                      void handleSelectConversation(id);
                      onClose?.();
                    }}
                    onConfirmDelete={(id) => void handleConfirmDelete(id)}
                    onCancelDelete={() => setConfirmDeleteId(null)}
                    onRequestDeleteConfirm={(id) => {
                      setMenuConversation(null);
                      setRenameTarget(null);
                      setConfirmDeleteId(id);
                    }}
                    onRequestRename={(c) => openRenameDialog(c)}
                    onOpenActions={openActionsMenu}
                  />
                ))
              )}
            </div>
          </div>
        ) : null}
      </TooltipProvider>
    </aside>
  );
}
