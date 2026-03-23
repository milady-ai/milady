import {
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

  return (
    <aside
      className={
        isGameModal
          ? "flex flex-col h-full bg-black/20 backdrop-blur-md"
          : `${mobile ? "w-full min-w-0 h-full" : "w-48 min-w-48 xl:w-60 xl:min-w-60 border-r"} border-border bg-bg flex flex-col overflow-y-auto text-[13px]`
      }
      data-no-window-drag=""
      data-testid="conversations-sidebar"
      data-variant={variant}
      onPointerDown={() => setMenuConversation(null)}
    >
      {/*
        Radix Tooltip requires TooltipProvider above any Tooltip. One provider
        for the whole sidebar avoids N providers per row. Delays keep tooltips
        from flashing on accidental pointer passes across narrow list items.
      */}
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
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted">
            {t("conversations.chats")}
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center w-7 h-7 border border-border bg-card text-sm text-muted cursor-pointer hover:border-accent hover:text-txt transition-colors"
            onClick={onClose}
            aria-label={t("conversations.closePanel")}
          >
            {t("bugreportmodal.Times")}
          </button>
        </div>
      )}

      <div
        className={
          isGameModal
            ? "p-3 border-b border-white/10 shrink-0"
            : "p-3 border-b border-border"
        }
      >
        <button
          type="button"
          className={
            isGameModal
              ? "w-full py-2 px-3 rounded-lg border border-accent/60 bg-accent/10 text-txt font-medium text-sm transition-all hover:bg-accent/20 hover:border-accent hover:shadow-[0_0_15px_rgba(240,178,50,0.15)] active:scale-[0.98]"
              : "w-full px-3 py-1.5 border border-accent rounded-md bg-transparent text-txt text-[12px] font-medium cursor-pointer transition-colors hover:bg-accent hover:text-accent-fg"
          }
          onClick={() => {
            handleNewConversation();
            onClose?.();
          }}
        >
          {t("conversations.newChat")}
        </button>
      </div>

      <div
        className={
          isGameModal
            ? "flex-1 overflow-y-auto p-2 space-y-1 min-h-0 custom-scrollbar w-full"
            : "flex-1 overflow-y-auto py-1 w-full min-w-0"
        }
      >
        {sortedConversations.length === 0 ? (
          <div
            className={
              isGameModal
                ? "py-8 text-center text-white/40 text-sm font-medium italic"
                : "px-3 py-6 text-center text-muted text-xs"
            }
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
      </TooltipProvider>
    </aside>
  );
}
