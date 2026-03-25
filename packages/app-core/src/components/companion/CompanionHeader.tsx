import type { UiLanguage } from "@miladyai/app-core/i18n";
import type { ShellView, UiTheme } from "@miladyai/app-core/state";
import type { CSSProperties } from "react";
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
  rightTrailingExtras?: ReactNode;
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
    rightTrailingExtras,
  } = props;
  const headerShellStyle = {
    "--companion-header-bg":
      uiTheme === "light"
        ? "linear-gradient(180deg, rgba(255, 253, 246, 0.94), rgba(248, 241, 215, 0.84))"
        : "linear-gradient(180deg, rgba(8, 11, 18, 0.8), rgba(5, 7, 12, 0.68))",
    "--companion-header-border":
      uiTheme === "light" ? "rgba(172, 164, 143, 0.46)" : "rgba(255, 255, 255, 0.08)",
    "--companion-header-shadow":
      uiTheme === "light"
        ? "0 18px 38px rgba(123, 101, 26, 0.14)"
        : "0 20px 50px rgba(2, 4, 8, 0.28)",
  } as CSSProperties;

  return (
    <header
      className="absolute inset-x-0 top-0 z-10 overflow-visible"
      data-no-camera-drag="true"
    >
      <div className="px-1.5 pt-1.5 max-[768px]:px-2 max-[768px]:pt-2 sm:px-4 sm:pt-4">
        <div
          className="pointer-events-auto mx-auto w-full max-w-5xl rounded-[20px] border border-[color:var(--companion-header-border)] bg-[image:var(--companion-header-bg)] shadow-[var(--companion-header-shadow)] backdrop-blur-xl max-[768px]:rounded-none max-[768px]:border-transparent max-[768px]:bg-none max-[768px]:shadow-none max-[768px]:backdrop-blur-none sm:rounded-[22px]"
          data-testid="companion-header-shell"
          style={headerShellStyle}
        >
          <ShellHeaderControls
            activeShellView={activeShellView}
            onShellViewChange={onShellViewChange}
            uiLanguage={uiLanguage}
            setUiLanguage={setUiLanguage}
            uiTheme={uiTheme}
            setUiTheme={setUiTheme}
            t={t}
            className="px-2.5 py-2 sm:px-4 sm:py-3"
            showCompanionControls={showCompanionControls}
            companionDesktopActionsLayout="split"
            chatAgentVoiceMuted={chatAgentVoiceMuted}
            onToggleVoiceMute={onToggleVoiceMute}
            onNewChat={onNewChat}
            rightExtras={rightExtras}
            rightTrailingExtras={rightTrailingExtras}
          >
            {children}
          </ShellHeaderControls>
        </div>
      </div>
    </header>
  );
});
