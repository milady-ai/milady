import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TooltipProvider,
} from "@miladyai/ui";
import type React from "react";
import { useRef, useState } from "react";
import { useApp } from "../state";
import { ConversationListItem } from "./conversations/ConversationListItem";
import { ConversationRenameDialog } from "./conversations/ConversationRenameDialog";

const DEFAULT_SIDEBAR_CLASS = "flex flex-col overflow-hidden text-[13px]";
const DEFAULT_SIDEBAR_DESKTOP_CLASS =
  "w-[14.75rem] min-w-[14.75rem] rounded-2xl border border-border/60 bg-card/82 shadow-lg ring-1 ring-border/20 backdrop-blur-sm xl:w-[16.75rem] xl:min-w-[16.75rem]";
const DEFAULT_SIDEBAR_MOBILE_CLASS =
  "h-full w-full min-w-0 border-0 bg-card/96 shadow-none ring-0";
const GAME_MODAL_SIDEBAR_CLASS =
  "flex h-full flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,12,17,0.9),rgba(8,10,14,0.82))] shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl";
const DEFAULT_HEADER_PANEL_CLASS =
  "shrink-0 border-b border-border/40 bg-card/75 px-3.5 pb-3 pt-3.5 backdrop-blur-md";
const GAME_MODAL_HEADER_PANEL_CLASS =
  "shrink-0 border-b border-white/10 bg-black/10 px-3.5 pb-3 pt-3.5";
const DEFAULT_MOBILE_HEADER_PANEL_CLASS =
  "flex items-center justify-between border-b border-border/40 bg-card/88 px-3.5 py-2.5 backdrop-blur-md";
const SECTION_EYEBROW_CLASS =
  "text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/70";
const COUNT_BADGE_CLASS =
  "inline-flex min-h-6 items-center rounded-full border border-border/45 bg-bg/55 px-2.5 py-1 text-[11px] font-medium text-muted shadow-sm";
const UNREAD_BADGE_CLASS =
  "inline-flex min-h-6 items-center rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent shadow-sm";
const DEFAULT_LIST_REGION_CLASS =
  "min-h-0 w-full min-w-0 flex-1 overflow-y-auto px-2.5 pb-2.5 pt-2";
const GAME_MODAL_LIST_REGION_CLASS =
  "custom-scrollbar flex-1 min-h-0 w-full overflow-y-auto p-2.5";
const DEFAULT_LIST_PANEL_CLASS =
  "flex min-h-full flex-col gap-1.5 rounded-[22px] border border-border/35 bg-bg/18 p-2 shadow-sm";
const GAME_MODAL_LIST_PANEL_CLASS =
  "flex min-h-full flex-col gap-1.5 rounded-[22px] border border-white/10 bg-black/12 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";
const EMPTY_STATE_CLASS =
  "rounded-2xl border border-dashed px-4 py-8 text-center text-sm shadow-sm";

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
  const conversationCount = sortedConversations.length;
  const unreadCount = unreadConversations.size;
  const sidebarClassName = isGameModal
    ? GAME_MODAL_SIDEBAR_CLASS
    : `${DEFAULT_SIDEBAR_CLASS} ${
        mobile ? DEFAULT_SIDEBAR_MOBILE_CLASS : DEFAULT_SIDEBAR_DESKTOP_CLASS
      }`;
  const listRegionClassName = isGameModal
    ? GAME_MODAL_LIST_REGION_CLASS
    : DEFAULT_LIST_REGION_CLASS;
  const listPanelClassName = isGameModal
    ? GAME_MODAL_LIST_PANEL_CLASS
    : DEFAULT_LIST_PANEL_CLASS;

  return (
    <aside
      className={sidebarClassName}
      data-no-window-drag=""
      data-testid="conversations-sidebar"
      data-variant={variant}
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
              <div className="text-xs text-muted">{conversationCount}</div>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-xl"
              onClick={onClose}
              aria-label={t("conversations.closePanel")}
            >
              {t("bugreportmodal.Times")}
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
          <div className="mb-3 flex items-end justify-between gap-3">
            <div className="space-y-1">
              <div className={SECTION_EYEBROW_CLASS}>
                {t("conversations.chats")}
              </div>
              <div className="text-xs text-muted">{conversationCount}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className={COUNT_BADGE_CLASS}>{conversationCount}</div>
              {unreadCount > 0 ? (
                <div className={UNREAD_BADGE_CLASS}>{unreadCount}</div>
              ) : null}
            </div>
          </div>
          <Button
            variant="outline"
            className={
              isGameModal
                ? "h-11 w-full rounded-xl border-[color:var(--onboarding-accent-border)] bg-[color:var(--onboarding-accent-bg)] px-3 py-2 text-sm font-medium text-[color:var(--onboarding-text-strong)] shadow-[0_12px_28px_rgba(0,0,0,0.18)] hover:border-[color:var(--onboarding-accent-border-hover)] hover:bg-[color:var(--onboarding-accent-bg-hover)] active:scale-[0.98]"
                : "min-h-[44px] w-full rounded-xl border-accent/60 bg-accent/10 px-3 py-2.5 text-[12px] font-medium text-txt hover:bg-accent/15 hover:text-accent-fg"
            }
            onClick={() => {
              handleNewConversation();
              onClose?.();
            }}
          >
            {t("conversations.newChat")}
          </Button>
        </div>

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
      </TooltipProvider>
    </aside>
  );
}
