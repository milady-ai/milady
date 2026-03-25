import { useMediaQuery, useRenderGuard } from "@miladyai/app-core/hooks";
import { memo } from "react";
import { ChatView } from "./ChatView.js";
import { ConversationsSidebar } from "./ConversationsSidebar.js";

const CHAT_MODAL_NARROW_BREAKPOINT = 768;
const CHAT_MODAL_MEDIA_QUERY = `(max-width: ${CHAT_MODAL_NARROW_BREAKPOINT}px)`;
const CHAT_MODAL_FULL_OVERLAY_CLASS =
  "absolute inset-[max(1rem,6vh)_max(0.75rem,6vw)] z-[100] flex flex-col";
const CHAT_MODAL_DOCK_WRAPPER_CLASS =
  "absolute inset-0 z-10 flex flex-col bg-transparent px-3 pb-3 pt-2 sm:px-5 sm:pb-5 sm:pt-3";
const CHAT_MODAL_SHELL_BASE_CLASS =
  "relative flex min-h-0 flex-1 flex-col rounded-[26px] border border-white/10 shadow-[0_24px_80px_rgba(3,5,10,0.42)]";
const CHAT_MODAL_FULL_OVERLAY_SHELL_CLASS = `${CHAT_MODAL_SHELL_BASE_CLASS} overflow-hidden bg-black/62 backdrop-blur-xl`;
const CHAT_MODAL_DOCK_SHELL_CLASS = `${CHAT_MODAL_SHELL_BASE_CLASS} overflow-visible bg-[linear-gradient(180deg,rgba(6,8,14,0.82),rgba(4,6,10,0.7))] backdrop-blur-xl`;
const CHAT_MODAL_SIDEBAR_CLASS =
  "flex h-full w-[292px] shrink-0 flex-col border-r border-white/10 bg-black/24 backdrop-blur-md xl:w-[320px]";
const CHAT_MODAL_MOBILE_SIDEBAR_OVERLAY_CLASS =
  "absolute inset-0 z-20 rounded-[26px] bg-black/60 p-3 backdrop-blur-md sm:p-4";
const CHAT_MODAL_MOBILE_SIDEBAR_PANEL_CLASS =
  "h-full max-w-[22rem] overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,12,18,0.9),rgba(6,8,12,0.82))] shadow-[0_24px_60px_rgba(2,4,8,0.5)]";

type ChatModalLayoutVariant = "full-overlay" | "companion-dock";

interface ChatModalViewProps {
  variant?: ChatModalLayoutVariant;
  onRequestClose?: () => void;
  showSidebar?: boolean;
  onSidebarClose?: () => void;
}

export const ChatModalView = memo(function ChatModalView({
  variant = "full-overlay",
  showSidebar = false,
  onSidebarClose,
}: ChatModalViewProps) {
  useRenderGuard("ChatModalView");

  const isNarrow = useMediaQuery(CHAT_MODAL_MEDIA_QUERY);
  const isCompanionDock = variant === "companion-dock";
  const companionSidebarVisible = isCompanionDock && showSidebar && !isNarrow;
  const showMobileSidebarOverlay = isCompanionDock && showSidebar && isNarrow;

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
      <div
        className={
          isCompanionDock
            ? CHAT_MODAL_DOCK_SHELL_CLASS
            : CHAT_MODAL_FULL_OVERLAY_SHELL_CLASS
        }
        data-chat-game-shell
      >
        {showMobileSidebarOverlay && (
          <div className={CHAT_MODAL_MOBILE_SIDEBAR_OVERLAY_CLASS}>
            <div className={CHAT_MODAL_MOBILE_SIDEBAR_PANEL_CLASS}>
              <ConversationsSidebar mobile onClose={onSidebarClose} />
            </div>
          </div>
        )}
        <div className="flex-1 flex min-h-0">
          <aside
            className={`${CHAT_MODAL_SIDEBAR_CLASS} ${
              companionSidebarVisible
                ? "hidden md:flex"
                : isCompanionDock
                  ? "hidden"
                  : "hidden md:flex"
            }`}
            data-chat-game-sidebar
          >
            <ConversationsSidebar variant="game-modal" />
          </aside>
          <section
            className={`flex-1 flex flex-col min-w-0 bg-transparent relative ${
              isCompanionDock ? "overflow-visible" : "overflow-hidden"
            }`}
            data-chat-game-thread
          >
            <ChatView variant="game-modal" />
          </section>
        </div>
      </div>
    </div>
  );
});
