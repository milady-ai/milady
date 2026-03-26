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
  onSave?: () => void;
  isSaving?: boolean;
  saveSuccess?: boolean;
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
    onSave,
    isSaving,
    saveSuccess,
    rightExtras,
    rightTrailingExtras,
  } = props;

  return (
    <header
      className="absolute inset-x-0 top-0 z-10 overflow-visible"
      data-no-camera-drag="true"
    >
      <div
        className="px-1.5 max-[768px]:px-2 sm:px-4"
        style={{
          paddingTop: "calc(var(--safe-area-top, 0px) + 0.375rem)",
          paddingLeft: "calc(var(--safe-area-left, 0px) + 0.375rem)",
          paddingRight: "calc(var(--safe-area-right, 0px) + 0.375rem)",
        }}
      >
        <div
          className="pointer-events-auto relative mx-auto w-full max-w-5xl rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] shadow-[0_20px_52px_rgba(0,0,0,0.17)] ring-1 ring-inset ring-white/6 before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-white/8 before:content-[''] backdrop-blur-[22px] max-[768px]:rounded-none max-[768px]:border-transparent max-[768px]:bg-none max-[768px]:shadow-none max-[768px]:ring-0 max-[768px]:before:hidden max-[768px]:backdrop-blur-none sm:rounded-[22px]"
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
            className="px-2.5 py-2 sm:px-4 sm:py-3"
            showCompanionControls={showCompanionControls}
            companionDesktopActionsLayout="split"
            chatAgentVoiceMuted={chatAgentVoiceMuted}
            onToggleVoiceMute={onToggleVoiceMute}
            onNewChat={onNewChat}
            onSave={onSave}
            isSaving={isSaving}
            saveSuccess={saveSuccess}
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
