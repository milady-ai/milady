import { Loader2 } from "lucide-react";
import type { ActionNotice } from "../state/types";
import { GlobalEmoteOverlay } from "./GlobalEmoteOverlay";
import {
  BugReportModal,
  CommandPalette,
  RestartBanner,
  ShortcutsOverlay,
} from "./index";

export function ShellOverlays({
  actionNotice,
}: {
  actionNotice: ActionNotice | null;
}) {
  return (
    <>
      <CommandPalette />
      <RestartBanner />
      <BugReportModal />
      <ShortcutsOverlay />
      <GlobalEmoteOverlay />
      {actionNotice && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-lg text-[13px] font-medium z-[10000] text-white flex items-center gap-2.5 max-w-[min(92vw,28rem)] ${
            actionNotice.tone === "error"
              ? "bg-danger"
              : actionNotice.tone === "success"
                ? "bg-ok"
                : "bg-accent"
          }`}
          role="status"
          aria-live="polite"
          aria-busy={actionNotice.busy ? true : undefined}
        >
          {actionNotice.busy ? (
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin opacity-95"
              aria-hidden
            />
          ) : null}
          <span className="text-left leading-snug">{actionNotice.text}</span>
        </div>
      )}
    </>
  );
}
