import {
  LANGUAGE_DROPDOWN_TRIGGER_CLASSNAME,
  LanguageDropdown,
  ThemeToggle,
} from "@miladyai/app-core/components";
import { useMediaQuery } from "@miladyai/app-core/hooks";
import type { UiLanguage } from "@miladyai/app-core/i18n";
import type { ShellView, UiTheme } from "@miladyai/app-core/state";
import { Button } from "@miladyai/ui";
import {
  type LucideIcon,
  Check,
  Loader2,
  MessageCirclePlus,
  Monitor,
  PencilLine,
  Save,
  Smartphone,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  HEADER_BUTTON_STYLE,
  SHELL_EXPANDED_BUTTON_CLASSNAME,
  SHELL_ICON_BUTTON_CLASSNAME,
  SHELL_SEGMENT_ACTIVE_CLASSNAME,
  SHELL_SEGMENT_INACTIVE_CLASSNAME,
  SHELL_SEGMENTED_CONTROL_CLASSNAME,
} from "./shell-control-styles";

export {
  HEADER_BUTTON_STYLE,
  SHELL_ICON_BUTTON_CLASSNAME as HEADER_ICON_BUTTON_CLASSNAME,
};

type ShellHeaderTranslator = (key: string) => string;

const SHELL_MODE_MOBILE_BREAKPOINT = 639;
const SHELL_MODE_MOBILE_MEDIA_QUERY = `(max-width: ${SHELL_MODE_MOBILE_BREAKPOINT}px)`;

interface ShellHeaderControlsProps {
  activeShellView: ShellView;
  onShellViewChange: (view: ShellView) => void;
  uiLanguage: UiLanguage;
  setUiLanguage: (language: UiLanguage) => void;
  uiTheme: UiTheme;
  setUiTheme: (theme: UiTheme) => void;
  t: ShellHeaderTranslator;
  children?: ReactNode;
  rightExtras?: ReactNode;
  rightTrailingExtras?: ReactNode;
  trailingExtras?: ReactNode;
  className?: string;
  controlsVariant?: "native" | "companion";
  languageDropdownClassName?: string;
  languageDropdownWrapperTestId?: string;
  themeToggleClassName?: string;
  themeToggleWrapperClassName?: string;
  themeToggleWrapperTestId?: string;
  /** Show Voice + New Chat buttons (companion & character editor views). */
  showCompanionControls?: boolean;
  companionDesktopActionsLayout?: "centered" | "split";
  chatAgentVoiceMuted?: boolean;
  onToggleVoiceMute?: () => void;
  onNewChat?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  saveSuccess?: boolean;
}

export function ShellHeaderControls({
  activeShellView,
  onShellViewChange,
  uiLanguage,
  setUiLanguage,
  uiTheme,
  setUiTheme,
  t,
  children,
  rightExtras,
  rightTrailingExtras,
  trailingExtras,
  className,
  controlsVariant = "native",
  languageDropdownClassName,
  languageDropdownWrapperTestId,
  themeToggleClassName,
  themeToggleWrapperClassName,
  themeToggleWrapperTestId,
  showCompanionControls,
  companionDesktopActionsLayout = "centered",
  chatAgentVoiceMuted = false,
  onToggleVoiceMute,
  onNewChat,
  onSave,
  isSaving = false,
  saveSuccess = false,
}: ShellHeaderControlsProps) {
  const isMobileViewport = useMediaQuery(SHELL_MODE_MOBILE_MEDIA_QUERY);
  const shouldSplitCompanionMobileActions =
    isMobileViewport && Boolean(showCompanionControls);
  const shouldSplitCompanionDesktopActions =
    !isMobileViewport &&
    Boolean(showCompanionControls) &&
    companionDesktopActionsLayout === "split";
  const shellOptions: Array<{
    view: ShellView;
    label: string;
    Icon: LucideIcon;
  }> = [
    {
      view: "companion",
      label: t("header.companionMode"),
      Icon: UserRound,
    },
    {
      view: "character",
      label: t("header.characterMode"),
      Icon: PencilLine,
    },
    {
      view: "desktop",
      label: t("header.nativeMode"),
      Icon: isMobileViewport ? Smartphone : Monitor,
    },
  ];
  const voiceToggleLabel = chatAgentVoiceMuted
    ? t("companion.agentVoiceOff")
    : t("companion.agentVoiceOn");
  const compactCompanionActionClassName = `${SHELL_ICON_BUTTON_CLASSNAME} pointer-events-auto text-sm leading-none`;
  const expandedCompanionActionClassName = `${SHELL_EXPANDED_BUTTON_CLASSNAME} justify-center text-sm leading-none sm:!w-auto sm:gap-1.5 sm:!px-3.5`;

  const renderVoiceButton = (compact: boolean) => (
    <Button
      size="icon"
      variant="outline"
      aria-label={voiceToggleLabel}
      aria-pressed={!chatAgentVoiceMuted}
      title={voiceToggleLabel}
      className={
        compact
          ? compactCompanionActionClassName
          : expandedCompanionActionClassName
      }
      onClick={onToggleVoiceMute}
      onPointerDown={(event) => event.stopPropagation()}
      style={HEADER_BUTTON_STYLE}
      data-no-camera-drag="true"
    >
      {chatAgentVoiceMuted ? (
        <VolumeX className="pointer-events-none h-4 w-4 shrink-0" />
      ) : (
        <Volume2 className="pointer-events-none h-4 w-4 shrink-0" />
      )}
      <span className="pointer-events-none hidden sm:inline">
        {t("companion.voiceToggle")}
      </span>
    </Button>
  );

  const renderNewChatButton = (compact: boolean) => (
    <Button
      size="icon"
      variant="outline"
      aria-label={t("companion.newChat")}
      title={t("companion.newChat")}
      className={
        compact
          ? compactCompanionActionClassName
          : expandedCompanionActionClassName
      }
      onClick={onNewChat}
      onPointerDown={(event) => event.stopPropagation()}
      style={HEADER_BUTTON_STYLE}
      data-no-camera-drag="true"
    >
      <MessageCirclePlus className="pointer-events-none h-4 w-4 shrink-0" />
      <span className="pointer-events-none hidden sm:inline">
        {t("companion.newChatButton")}
      </span>
    </Button>
  );

  const renderSaveButton = (compact: boolean) => (
    <Button
      size="icon"
      variant="outline"
      aria-label={t("charactereditor.Save")}
      title={t("charactereditor.Save")}
      className={
        compact
          ? compactCompanionActionClassName
          : expandedCompanionActionClassName
      }
      onClick={onSave}
      disabled={isSaving}
      onPointerDown={(event) => event.stopPropagation()}
      style={HEADER_BUTTON_STYLE}
      data-no-camera-drag="true"
    >
      {isSaving ? (
        <Loader2 className="pointer-events-none h-4 w-4 shrink-0 animate-spin" />
      ) : saveSuccess ? (
        <Check className="pointer-events-none h-4 w-4 shrink-0 text-green-400" />
      ) : (
        <Save className="pointer-events-none h-4 w-4 shrink-0" />
      )}
      <span className="pointer-events-none hidden sm:inline">
        {isSaving
          ? t("charactereditor.Saving")
          : saveSuccess
            ? t("charactereditor.Saved")
            : t("charactereditor.Save")}
      </span>
    </Button>
  );

  /** Render the appropriate action button — Save for character, New Chat for companion */
  const renderActionButton = (compact: boolean) => {
    if (onSave) return renderSaveButton(compact);
    if (onNewChat) return renderNewChatButton(compact);
    return null;
  };

  return (
    <div
      className={`min-w-0 w-full overflow-visible gap-2 ${
        shouldSplitCompanionMobileActions
          ? "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2.5"
          : "flex items-center"
      } ${className ?? ""}`}
      data-no-camera-drag="true"
    >
      {/* Left: shell view toggle */}
      <div
        className={
          shouldSplitCompanionMobileActions
            ? "col-start-1 row-start-1 flex min-w-0 items-center"
            : "flex shrink-0 items-center gap-2"
        }
      >
        <fieldset
          className={SHELL_SEGMENTED_CONTROL_CLASSNAME}
          data-testid="ui-shell-toggle"
          data-no-camera-drag="true"
          aria-label="Switch shell view"
        >
          <legend className="sr-only">Switch shell view</legend>
          {shellOptions.map(({ view, label, Icon }, index) => {
            const selected = activeShellView === view;
            const edgeClass =
              index === 0
                ? "rounded-l-xl rounded-r-none"
                : index === shellOptions.length - 1
                  ? "rounded-l-none rounded-r-xl"
                  : "rounded-none";
            return (
              <Button
                key={view}
                size="icon"
                onClick={() => onShellViewChange(view)}
                onPointerDown={(event) => event.stopPropagation()}
                className={`h-11 min-h-[44px] min-w-[44px] px-3 transition-all duration-200 ${edgeClass} ${
                  selected
                    ? SHELL_SEGMENT_ACTIVE_CLASSNAME
                    : SHELL_SEGMENT_INACTIVE_CLASSNAME
                }`}
                style={HEADER_BUTTON_STYLE}
                aria-label={label}
                aria-pressed={selected}
                title={label}
                data-testid={`ui-shell-toggle-${view}`}
              >
                <Icon className="pointer-events-none h-4 w-4" />
              </Button>
            );
          })}
        </fieldset>
        {shouldSplitCompanionDesktopActions ? (
          <div
            className="flex shrink-0 items-center"
            data-testid="companion-header-desktop-voice"
            data-no-camera-drag="true"
          >
            {renderVoiceButton(false)}
          </div>
        ) : null}
      </div>

      {/* Center: children or companion controls */}
      <div
        className={
          shouldSplitCompanionMobileActions ? "hidden" : "flex-1 min-w-0"
        }
      >
        {showCompanionControls && !shouldSplitCompanionMobileActions ? (
          shouldSplitCompanionDesktopActions ? null : (
            <div
              className="flex items-center justify-center"
              data-testid="companion-header-chat-controls"
              data-no-camera-drag="true"
            >
              <div className="inline-flex items-center gap-2">
                {renderVoiceButton(false)}
                {renderActionButton(false)}
              </div>
            </div>
          )
        ) : (
          children
        )}
      </div>

      {/* Right: controls */}
      <div
        className={`flex min-w-0 items-center justify-end gap-2 overflow-visible ${
          shouldSplitCompanionMobileActions
            ? "col-start-2 row-start-1 ml-auto shrink-0"
            : "shrink-0"
        }`}
        data-testid="shell-header-right-controls"
        data-no-camera-drag="true"
      >
        {rightExtras}
        {shouldSplitCompanionDesktopActions ? (
          <div
            className="flex shrink-0 items-center"
            data-testid="companion-header-desktop-new-chat"
            data-no-camera-drag="true"
          >
            {renderActionButton(false)}
          </div>
        ) : null}
        {rightTrailingExtras}
        <div
          className={`shrink-0 ${languageDropdownClassName ?? ""}`}
          data-testid={languageDropdownWrapperTestId}
          data-no-camera-drag="true"
        >
          <LanguageDropdown
            uiLanguage={uiLanguage}
            setUiLanguage={setUiLanguage}
            t={t}
            variant={controlsVariant}
            triggerClassName={LANGUAGE_DROPDOWN_TRIGGER_CLASSNAME}
          />
        </div>
        <div
          className={`shrink-0 ${themeToggleWrapperClassName ?? ""}`}
          data-testid={themeToggleWrapperTestId}
          data-no-camera-drag="true"
        >
          <ThemeToggle
            uiTheme={uiTheme}
            setUiTheme={setUiTheme}
            t={t}
            variant={controlsVariant}
            className={`!h-11 !w-11 !min-h-[44px] !min-w-[44px] ${themeToggleClassName ?? ""}`}
          />
        </div>
        {trailingExtras}
      </div>

      {shouldSplitCompanionMobileActions && showCompanionControls ? (
        <div
          className="col-span-2 row-start-2 flex items-center justify-between"
          data-testid="companion-header-mobile-actions"
        >
          <div
            className="flex items-center justify-start"
            data-testid="companion-header-mobile-voice"
          >
            {renderVoiceButton(true)}
          </div>
          <div
            className="flex items-center justify-end"
            data-testid="companion-header-mobile-new-chat"
          >
            {renderActionButton(true)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
