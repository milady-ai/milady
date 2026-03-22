import { useRenderGuard } from "@miladyai/app-core/hooks";
import { useApp } from "@miladyai/app-core/state";
import { memo, useCallback, useEffect, useState } from "react";
import { ChatModalView } from "./ChatModalView";
import { CompanionHeader } from "./companion/CompanionHeader";
import {
  CompanionSceneHost,
  useSharedCompanionScene,
} from "./companion/CompanionSceneHost";

// Module-level flag so remounts (e.g. switching to character editor and back)
// don't re-hide the chat after the avatar already loaded once.
let _vrmTeleportCompletedOnce = false;

export const CompanionView = memo(function CompanionView() {
  useRenderGuard("CompanionView");
  const {
    uiLanguage,
    setUiLanguage,
    uiTheme,
    setUiTheme,
    chatAgentVoiceMuted,
    handleNewConversation,
    setState,
    switchShellView,
    t,
  } = useApp();
  const hasSharedCompanionScene = useSharedCompanionScene();

  // Gate chat + header behind avatar load — don't show chat or play
  // greeting speech until the VRM finishes its teleport-in animation.
  const [avatarReady, setAvatarReady] = useState(_vrmTeleportCompletedOnce);
  useEffect(() => {
    if (_vrmTeleportCompletedOnce) {
      setAvatarReady(true);
      return;
    }
    const handler = () => {
      _vrmTeleportCompletedOnce = true;
      setAvatarReady(true);
    };
    window.addEventListener("eliza:vrm-teleport-complete", handler);
    return () =>
      window.removeEventListener("eliza:vrm-teleport-complete", handler);
  }, []);

  const handleShellViewChange = useCallback(
    (view: "companion" | "character" | "desktop") => {
      switchShellView(view);
    },
    [switchShellView],
  );

  useEffect(() => {
    setState("chatMode", "simple");
  }, [setState]);

  const overlay = (
    <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
      <div
        style={{
          opacity: avatarReady ? 1 : 0,
          transition: "opacity 0.5s ease-in",
          pointerEvents: avatarReady ? undefined : "none",
        }}
      >
        <CompanionHeader
          activeShellView="companion"
          onShellViewChange={handleShellViewChange}
          uiLanguage={uiLanguage}
          setUiLanguage={setUiLanguage}
          uiTheme={uiTheme}
          setUiTheme={setUiTheme}
          t={t}
          showCompanionControls
          chatAgentVoiceMuted={chatAgentVoiceMuted}
          onToggleVoiceMute={() =>
            setState("chatAgentVoiceMuted", !chatAgentVoiceMuted)
          }
          onNewChat={() => void handleNewConversation()}
        />
      </div>

      {avatarReady && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[45%] z-20 pointer-events-auto">
          <ChatModalView variant="companion-dock" />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 grid grid-cols-[1fr_auto] gap-6 min-h-0 relative">
        {/* Center (Empty to show character) */}
        <div className="w-full h-full" />
      </div>
    </div>
  );

  return hasSharedCompanionScene ? (
    overlay
  ) : (
    <CompanionSceneHost active>{overlay}</CompanionSceneHost>
  );
});
