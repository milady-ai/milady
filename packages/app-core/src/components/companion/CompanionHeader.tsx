import type { UiLanguage } from "@miladyai/app-core/i18n";
import type { ShellView, UiTheme } from "@miladyai/app-core/state";
import { memo, type ReactNode } from "react";
import { ShellHeaderControls } from "./ShellHeaderControls";

export interface CompanionHeaderProps {
  activeShellView: ShellView;
  onShellViewChange: (view: ShellView) => void;
  uiLanguage: UiLanguage;
  setUiLanguage: (language: UiLanguage) => void;
  uiTheme: UiTheme;
  setUiTheme: (theme: UiTheme) => void;
  t: (key: string) => string;
  children?: ReactNode;
  showCompanionControls?: boolean;
  chatAgentVoiceMuted?: boolean;
  onToggleVoiceMute?: () => void;
  onNewChat?: () => void;
  /** Shown in the shell header right cluster (e.g. inference / cloud alert). */
  rightExtras?: ReactNode;
}

export const CompanionHeader = memo(function CompanionHeader(
  props: CompanionHeaderProps,
) {
  const {
    activeShellView,
    onShellViewChange,
    uiLanguage,
    setUiLanguage,
    uiTheme,
    setUiTheme,
    t,
    children,
    showCompanionControls,
    chatAgentVoiceMuted,
    onToggleVoiceMute,
    onNewChat,
    rightExtras,
  } = props;

  return (
    <header
      className="absolute inset-x-0 top-0 z-10 overflow-visible"
      data-no-camera-drag="true"
    >
      <div className="px-2 pt-2 sm:px-4 sm:pt-4">
        <div
          className="pointer-events-auto mx-auto w-full max-w-5xl rounded-[22px] border border-border/60 bg-[linear-gradient(180deg,rgba(8,11,18,0.8),rgba(5,7,12,0.68))] shadow-[0_20px_50px_rgba(2,4,8,0.28)] backdrop-blur-xl"
          data-testid="companion-header-shell"
        >
          <ShellHeaderControls
            activeShellView={activeShellView}
            onShellViewChange={onShellViewChange}
            uiLanguage={uiLanguage}
            setUiLanguage={setUiLanguage}
            uiTheme={uiTheme}
            setUiTheme={setUiTheme}
            t={t}
            className="px-3 py-2 sm:px-4 sm:py-3"
            showCompanionControls={showCompanionControls}
            chatAgentVoiceMuted={chatAgentVoiceMuted}
            onToggleVoiceMute={onToggleVoiceMute}
            onNewChat={onNewChat}
            rightExtras={rightExtras}
          >
            {children}
          </ShellHeaderControls>
        </div>
      </div>
    </header>
  );
});
