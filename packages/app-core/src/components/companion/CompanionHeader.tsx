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
        ? "linear-gradient(180deg, rgba(255,255,255,0.34), rgba(255,255,255,0.1)), linear-gradient(180deg, rgba(255,253,246,0.62), rgba(248,241,215,0.34))"
        : "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)), linear-gradient(180deg, rgba(8, 11, 18, 0.52), rgba(5, 7, 12, 0.3))",
    "--companion-header-border":
      uiTheme === "light"
        ? "rgba(201, 186, 143, 0.44)"
        : "rgba(255, 255, 255, 0.12)",
    "--companion-header-shadow":
      uiTheme === "light"
        ? "inset 0 1px 0 rgba(255,255,255,0.56), inset 0 -1px 0 rgba(171,151,92,0.1), 0 24px 42px rgba(123, 101, 26, 0.14)"
        : "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(255,255,255,0.04), 0 24px 50px rgba(2, 4, 8, 0.28)",
  } as CSSProperties;

  return (
    <header
      className="absolute inset-x-0 top-0 z-10 overflow-visible"
      data-no-camera-drag="true"
    >
      <div className="px-1.5 pt-1.5 max-[768px]:px-2 max-[768px]:pt-2 sm:px-4 sm:pt-4">
        <div
          className="pointer-events-auto relative mx-auto w-full max-w-5xl rounded-[20px] border border-[color:var(--companion-header-border)] bg-[image:var(--companion-header-bg)] shadow-[var(--companion-header-shadow)] ring-1 ring-inset ring-white/10 before:pointer-events-none before:absolute before:inset-x-[6%] before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)] backdrop-blur-2xl max-[768px]:rounded-none max-[768px]:border-transparent max-[768px]:bg-none max-[768px]:shadow-none max-[768px]:ring-0 max-[768px]:before:hidden max-[768px]:backdrop-blur-none sm:rounded-[22px]"
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
