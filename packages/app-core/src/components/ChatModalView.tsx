import { useMediaQuery, useRenderGuard } from "@miladyai/app-core/hooks";
import {
  DrawerSheet,
  DrawerSheetContent,
  DrawerSheetHeader,
  DrawerSheetTitle,
  Z_MODAL,
} from "@miladyai/ui";
import { memo } from "react";
import { useTranslation } from "../state";
import { ChatView } from "./ChatView.js";
import { ConversationsSidebar } from "./ConversationsSidebar.js";

const CHAT_MODAL_NARROW_BREAKPOINT = 768;
const CHAT_MODAL_MEDIA_QUERY = `(max-width: ${CHAT_MODAL_NARROW_BREAKPOINT}px)`;
const CHAT_MODAL_FULL_OVERLAY_CLASS = `absolute inset-[max(1rem,6vh)_max(0.75rem,6vw)] z-[${Z_MODAL}] flex flex-col`;
const CHAT_MODAL_DOCK_WRAPPER_CLASS =
  "absolute inset-0 z-10 flex flex-col bg-transparent pb-2 pt-2 sm:pb-4 sm:pt-4";
const CHAT_MODAL_SHELL_BASE_CLASS =
  "relative flex min-h-0 flex-1 flex-col rounded-[28px] border border-border/60 shadow-[0_28px_90px_rgba(3,5,10,0.45)] ring-1 ring-white/5";
const CHAT_MODAL_FULL_OVERLAY_SHELL_CLASS = `${CHAT_MODAL_SHELL_BASE_CLASS} overflow-hidden bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_90%,transparent),color-mix(in_srgb,var(--bg)_86%,transparent))] backdrop-blur-xl`;
const CHAT_MODAL_DOCK_SHELL_CLASS =
  "relative flex min-h-0 flex-1 flex-col overflow-visible rounded-[28px] bg-transparent pointer-events-none";
const CHAT_MODAL_SIDEBAR_CLASS =
  "flex h-full w-[292px] shrink-0 flex-col border-r border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_88%,transparent),color-mix(in_srgb,var(--bg)_78%,transparent))] backdrop-blur-xl xl:w-[320px]";

type ChatModalLayoutVariant = "full-overlay" | "companion-dock";

interface ChatModalViewProps {
  variant?: ChatModalLayoutVariant;
  onRequestClose?: () => void;
  showSidebar?: boolean;
  onSidebarClose?: () => void;
  /** Override click handler for agent activity box sessions (e.g. open side panel in companion). */
  onPtySessionClick?: (sessionId: string) => void;
}

export const ChatModalView = memo(function ChatModalView({
  variant = "full-overlay",
  showSidebar = false,
  onSidebarClose,
  onPtySessionClick,
}: ChatModalViewProps) {
  useRenderGuard("ChatModalView");
  const { t } = useTranslation();

  const isNarrow = useMediaQuery(CHAT_MODAL_MEDIA_QUERY);
  const isCompanionDock = variant === "companion-dock";
  const companionSidebarVisible = isCompanionDock && showSidebar && !isNarrow;
  const showMobileSidebarOverlay = isCompanionDock && showSidebar && isNarrow;
  const shellClassName = isCompanionDock
    ? CHAT_MODAL_DOCK_SHELL_CLASS
    : CHAT_MODAL_FULL_OVERLAY_SHELL_CLASS;

  return (
    <div
      className={
        isCompanionDock
          ? CHAT_MODAL_DOCK_WRAPPER_CLASS
          : CHAT_MODAL_FULL_OVERLAY_CLASS
      }
      data-chat-game-overlay={!isCompanionDock || undefined}
      data-chat-game-dock={isCompanionDock || undefined}
    >
      <div className={shellClassName} data-chat-game-shell>
        {showMobileSidebarOverlay && (
          <DrawerSheet
            open={showMobileSidebarOverlay}
            onOpenChange={(open) => {
              if (!open) {
                onSidebarClose?.();
              }
            }}
          >
            <DrawerSheetContent
              aria-describedby={undefined}
              className="h-[min(calc(100dvh-1rem-var(--safe-area-top,0px)-var(--safe-area-bottom,0px)),36rem)] p-0"
              data-chat-game-sidebar-overlay
              showCloseButton={false}
            >
              <DrawerSheetHeader className="sr-only">
                <DrawerSheetTitle>{t("conversations.chats")}</DrawerSheetTitle>
              </DrawerSheetHeader>
              <ConversationsSidebar mobile onClose={onSidebarClose} />
            </DrawerSheetContent>
          </DrawerSheet>
        )}
        <div className="flex-1 flex min-h-0">
          <aside
            className={`${CHAT_MODAL_SIDEBAR_CLASS} ${
              companionSidebarVisible
                ? "hidden md:flex"
                : isCompanionDock
                  ? "hidden"
                  : "hidden md:flex"
            } ${isCompanionDock ? "pointer-events-auto" : ""}`}
            data-chat-game-sidebar
          >
            <ConversationsSidebar variant="game-modal" />
          </aside>
          <section
            className={`flex-1 flex flex-col min-w-0 bg-transparent relative ${
              isCompanionDock
                ? "overflow-visible pointer-events-auto"
                : "overflow-hidden"
            }`}
            data-chat-game-thread
          >
            <ChatView
              variant="game-modal"
              onPtySessionClick={onPtySessionClick}
            />
          </section>
        </div>
      </div>
    </div>
  );
});
