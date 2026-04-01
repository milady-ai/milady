import {
  ChatSidebar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TooltipProvider,
} from "@miladyai/ui";
import type React from "react";
import { useMemo, useRef, useState } from "react";

import { useApp } from "../state";
import { ConversationRenameDialog } from "./conversations/ConversationRenameDialog";
import {
  formatRelativeTime,
  getLocalizedConversationTitle,
} from "./conversations/conversation-utils";

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
  const [searchQuery, setSearchQuery] = useState("");

  const sortedConversations = useMemo(
    () =>
      [...conversations]
        .sort((a, b) => {
          const aTime = new Date(a.updatedAt).getTime();
          const bTime = new Date(b.updatedAt).getTime();
          return bTime - aTime;
        })
        .map((conversation) => ({
          id: conversation.id,
          title: getLocalizedConversationTitle(conversation.title, t),
          updatedAtLabel: formatRelativeTime(conversation.updatedAt, t),
        })),
    [conversations, t],
  );
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visibleConversations = useMemo(() => {
    if (!normalizedSearchQuery) {
      return sortedConversations;
    }

    return sortedConversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(normalizedSearchQuery),
    );
  }, [normalizedSearchQuery, sortedConversations]);

  const openRenameDialog = (conversation: { id: string; title: string }) => {
    setConfirmDeleteId(null);
    setMenuConversation(null);
    setRenameTarget({ id: conversation.id, title: conversation.title });
  };

  const openActionsMenu = (
    event: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>,
    conversation: { id: string; title: string },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setConfirmDeleteId(null);
    setMenuConversation(conversation);
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

  return (
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
            className="fixed h-0 w-0 pointer-events-none"
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

      <ChatSidebar
        conversations={visibleConversations}
        activeConversationId={activeConversationId}
        confirmDeleteId={confirmDeleteId}
        deletingId={deletingId}
        unreadConversations={unreadConversations}
        mobile={mobile}
        variant={variant}
        labels={{
          chats: t("conversations.chats"),
          clearSearch: t("common.clear", { defaultValue: "Clear" }),
          closePanel: t("conversations.closePanel"),
          delete: t("conversations.delete"),
          deleteConfirm: t("conversations.deleteConfirm"),
          deleteNo: t("conversations.deleteNo"),
          deleteYes: t("conversations.deleteYes"),
          expandChatsPanel: t("aria.expandChatsPanel"),
          newChat: t("conversations.newChat"),
          none: t("conversations.none"),
          noMatchingChats: t("conversations.noMatchingChats", {
            defaultValue: "No matching chats",
          }),
          rename: t("conversations.rename"),
          searchChats: t("conversations.searchChats", {
            defaultValue: "Search chats",
          }),
        }}
        onCreate={() => {
          handleNewConversation();
          onClose?.();
        }}
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
        onRequestRename={(conversation) => openRenameDialog(conversation)}
        onOpenActions={openActionsMenu}
        onSearchChange={(event) => setSearchQuery(event.target.value)}
        onSearchClear={() => setSearchQuery("")}
        onClose={onClose}
        searchValue={searchQuery}
      />
    </TooltipProvider>
  );
}
