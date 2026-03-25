import { LanguageDropdown, ThemeToggle } from "@miladyai/app-core/components";
import { getTabGroups, type TabGroup } from "@miladyai/app-core/navigation";
import { useApp } from "@miladyai/app-core/state";
import { Button } from "@miladyai/ui";
import { Menu } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CloudStatusBadge } from "./CloudStatusBadge";
import { InferenceCloudAlertButton } from "./companion/InferenceCloudAlertButton";
import { resolveCompanionInferenceNotice } from "./companion/resolve-companion-inference-notice";
import {
  HEADER_BUTTON_STYLE,
  HEADER_ICON_BUTTON_CLASSNAME,
  ShellHeaderControls,
} from "./companion/ShellHeaderControls";

const NAV_LABEL_I18N_KEY: Record<string, string> = {
  Chat: "nav.chat",
  Companion: "nav.companion",
  Stream: "nav.stream",
  Character: "nav.character",
  Wallets: "nav.wallets",
  Knowledge: "nav.knowledge",
  Connectors: "nav.social",
  Apps: "nav.apps",
  Settings: "nav.settings",
  Heartbeats: "nav.heartbeats",
  Advanced: "nav.advanced",
};

interface HeaderProps {
  mobileLeft?: ReactNode;
  transparent?: boolean;
  hideCloudCredits?: boolean;
}

export function Header({
  mobileLeft,
  transparent = false,
  hideCloudCredits = false,
}: HeaderProps) {
  const {
    elizaCloudEnabled,
    elizaCloudConnected,
    elizaCloudCredits,
    elizaCloudCreditsCritical,
    elizaCloudCreditsLow,
    elizaCloudAuthRejected,
    elizaCloudCreditsError,
    tab,
    setTab,
    setState,
    plugins,
    loadDropStatus,
    uiShellMode,
    switchShellView,
    uiLanguage,
    setUiLanguage,
    uiTheme,
    setUiTheme,
    chatAgentVoiceMuted,
    handleNewConversation,
    conversationMessages,
    chatLastUsage,
    t,
  } = useApp();

  const [copied, setCopied] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    void loadDropStatus();
  }, [loadDropStatus]);

  // Clear copied state after 2 seconds
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  // Close mobile menu on escape key
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const streamingEnabled = useMemo(
    () =>
      plugins.some(
        (plugin) => plugin.id === "streaming-base" && plugin.enabled,
      ),
    [plugins],
  );
  const tabGroups = useMemo(
    () => getTabGroups(streamingEnabled),
    [streamingEnabled],
  );

  const shellMode =
    tab === "character" || tab === "character-select"
      ? "native"
      : (uiShellMode ?? "companion");
  const activeShellView =
    shellMode === "companion"
      ? "companion"
      : tab === "character" || tab === "character-select"
        ? "character"
        : "desktop";
  const useMinimalHeaderChrome = transparent || activeShellView !== "desktop";
  const showNavigationMenu = activeShellView === "desktop";
  const showCloudStatus = activeShellView === "desktop" && !hideCloudCredits;

  const handleShellViewChange = (
    view: "companion" | "character" | "desktop",
  ) => {
    switchShellView(view);
  };

  const openCloudBilling = () => {
    setState("cloudDashboardView", "billing");
    setTab("settings");
    setMobileMenuOpen(false);
  };

  const chatInferenceNotice = useMemo(() => {
    if (tab !== "chat") return null;
    return resolveCompanionInferenceNotice({
      elizaCloudConnected,
      elizaCloudAuthRejected,
      elizaCloudCreditsError,
      elizaCloudEnabled,
      chatLastUsageModel: chatLastUsage?.model,
      hasInterruptedAssistant: (conversationMessages ?? []).some(
        (m) => m.role === "assistant" && m.interrupted,
      ),
      t,
    });
  }, [
    chatLastUsage?.model,
    conversationMessages,
    elizaCloudAuthRejected,
    elizaCloudConnected,
    elizaCloudCreditsError,
    elizaCloudEnabled,
    tab,
    t,
  ]);

  const handleChatInferenceAlertClick = useCallback(() => {
    if (!chatInferenceNotice) return;
    if (chatInferenceNotice.kind === "cloud") {
      setState("cloudDashboardView", "billing");
    }
    setTab("settings");
    setMobileMenuOpen(false);
  }, [chatInferenceNotice, setState, setTab]);

  const renderMobileMenuThemeToggle = () => (
    <div
      data-testid="header-theme-toggle-mobile"
      className="flex items-center justify-end"
    >
      <ThemeToggle
        uiTheme={uiTheme}
        setUiTheme={setUiTheme}
        t={t}
        className="!h-11 !w-11 !min-h-11 !min-w-11"
      />
    </div>
  );

  const renderMobileMenuLanguageDropdown = () => (
    <div data-testid="header-language-dropdown-mobile" className="shrink-0">
      <LanguageDropdown
        uiLanguage={uiLanguage}
        setUiLanguage={setUiLanguage}
        t={t}
        menuPlacement="top-end"
        triggerClassName="!h-11 !min-h-11 !rounded-xl !px-3.5"
      />
    </div>
  );

  useEffect(() => {
    if (shellMode !== "native") return;
    setState("chatMode", "power");
  }, [setState, shellMode]);

  useEffect(() => {
    if (showNavigationMenu) return;
    setMobileMenuOpen(false);
  }, [showNavigationMenu]);

  return (
    <>
      <header
        className={`sticky top-0 z-20 w-full px-3 py-2.5 select-none transition-all sm:px-4 sm:py-3 ${
          useMinimalHeaderChrome
            ? "border-b border-transparent bg-transparent backdrop-blur-0 shadow-none"
            : "border-b border-border/50 bg-bg/82 backdrop-blur-xl"
        }`}
        style={{ WebkitUserSelect: "none", userSelect: "none" }}
      >
        <ShellHeaderControls
          activeShellView={activeShellView}
          onShellViewChange={handleShellViewChange}
          uiLanguage={uiLanguage}
          setUiLanguage={setUiLanguage}
          uiTheme={uiTheme}
          setUiTheme={setUiTheme}
          t={t}
          languageDropdownClassName={
            showNavigationMenu ? "hidden sm:inline-flex" : undefined
          }
          languageDropdownWrapperTestId={
            showNavigationMenu ? "header-language-dropdown-desktop" : undefined
          }
          themeToggleWrapperClassName={
            showNavigationMenu ? "hidden sm:flex" : undefined
          }
          themeToggleWrapperTestId={
            showNavigationMenu ? "header-theme-toggle-desktop" : undefined
          }
          rightExtras={
            <>
              {chatInferenceNotice ? (
                <InferenceCloudAlertButton
                  notice={chatInferenceNotice}
                  onClick={handleChatInferenceAlertClick}
                />
              ) : null}
              {showCloudStatus ? (
                <CloudStatusBadge
                  connected={elizaCloudConnected}
                  credits={elizaCloudCredits}
                  creditsLow={elizaCloudCreditsLow}
                  creditsCritical={elizaCloudCreditsCritical}
                  authRejected={elizaCloudAuthRejected}
                  creditsError={elizaCloudCreditsError}
                  t={t}
                  onClick={openCloudBilling}
                  dataTestId="header-cloud-status"
                />
              ) : null}
            </>
          }
          showCompanionControls={
            activeShellView === "companion" || activeShellView === "character"
          }
          chatAgentVoiceMuted={chatAgentVoiceMuted}
          onToggleVoiceMute={() =>
            setState("chatAgentVoiceMuted", !chatAgentVoiceMuted)
          }
          onNewChat={() => void handleNewConversation()}
          trailingExtras={
            showNavigationMenu ? (
              <Button
                size="icon"
                variant="outline"
                className={`sm:hidden ${HEADER_ICON_BUTTON_CLASSNAME}`}
                onClick={() => setMobileMenuOpen(true)}
                aria-label={t("aria.openNavMenu")}
                aria-expanded={mobileMenuOpen}
                style={HEADER_BUTTON_STYLE}
              >
                <Menu className="pointer-events-none w-5 h-5" />
              </Button>
            ) : null
          }
        >
          {mobileLeft ? (
            <div className="flex sm:hidden">{mobileLeft}</div>
          ) : null}
          {showNavigationMenu ? (
            <nav className="scrollbar-hide hidden flex-1 items-center justify-start gap-1 overflow-x-auto whitespace-nowrap px-2 sm:flex sm:pl-4">
              {tabGroups.map((group: TabGroup) => {
                const primaryTab = group.tabs[0];
                const isActive = group.tabs.includes(tab);
                const Icon = group.icon;
                return (
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    key={group.label}
                    data-testid={`header-nav-button-${primaryTab}`}
                    className={`relative z-10 min-h-[44px] min-w-[44px] gap-0 xl:gap-1.5 shrink-0 px-3 md:px-3.5 xl:px-4 py-2.5 text-[12px] bg-transparent border border-transparent transition-all duration-300 rounded-full ${
                      isActive
                        ? "text-accent font-bold bg-accent/15 shadow-[0_0_15px_rgba(var(--accent),0.18)] border-accent/40 ring-1 ring-inset ring-accent/20"
                        : "text-muted hover:text-txt hover:bg-bg-hover hover:border-border/50"
                    }`}
                    onClick={() => setTab(primaryTab)}
                    title={group.description}
                    style={HEADER_BUTTON_STYLE}
                  >
                    <span
                      data-testid={`header-nav-icon-${primaryTab}`}
                      className="pointer-events-none inline-flex md:hidden xl:inline-flex"
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span
                      data-testid={`header-nav-label-${primaryTab}`}
                      className="pointer-events-none hidden md:inline"
                    >
                      {t(NAV_LABEL_I18N_KEY[group.label] ?? group.label)}
                    </span>
                  </Button>
                );
              })}
            </nav>
          ) : null}
        </ShellHeaderControls>
      </header>

      {/* Mobile Menu Overlay */}
      {showNavigationMenu && mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[140] sm:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t("aria.navMenu")}
        >
          {/* Backdrop */}
          <Button
            variant="ghost"
            className="absolute inset-0 h-full w-full border-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            aria-label={t("aria.closeNavMenu")}
            style={HEADER_BUTTON_STYLE}
          />

          {/* Menu Panel */}
          <div className="absolute bottom-0 right-0 top-0 flex w-[min(22rem,88vw)] flex-col border-l border-border/60 bg-bg/92 shadow-2xl backdrop-blur-xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                  {t("aria.navMenu")}
                </div>
                <div className="text-sm font-medium text-txt">
                  {t("nav.settings")}
                </div>
              </div>
              <Button
                variant="outline"
                size="icon"
                className={`shrink-0 ${HEADER_ICON_BUTTON_CLASSNAME}`}
                onClick={() => setMobileMenuOpen(false)}
                aria-label={t("aria.closeNavMenu")}
                style={HEADER_BUTTON_STYLE}
              >
                {t("bugreportmodal.Times")}
              </Button>
            </div>
            <div className="flex flex-1 flex-col px-3 py-3">
              <div className="flex-1 overflow-y-auto pr-1">
                <div className="flex flex-col gap-1">
                  {tabGroups.map((group: TabGroup, index) => {
                    const primaryTab = group.tabs[0];
                    const isActive = group.tabs.includes(tab);
                    const Icon = group.icon;
                    return (
                      <Button
                        variant={isActive ? "default" : "ghost"}
                        key={group.label}
                        className={`flex min-h-[48px] w-full gap-3 rounded-xl border px-3 py-3.5 text-[14px] font-medium transition-all duration-300 ${
                          isActive
                            ? "border-accent/40 bg-accent/15 text-accent shadow-[0_0_15px_rgba(var(--accent),0.18)] ring-1 ring-inset ring-accent/20"
                            : "border-transparent bg-transparent text-txt hover:border-border/50 hover:bg-bg-hover"
                        }`}
                        style={{
                          ...HEADER_BUTTON_STYLE,
                          animationDelay: `${index * 50}ms`,
                        }}
                        onClick={() => {
                          setTab(primaryTab);
                          setMobileMenuOpen(false);
                        }}
                      >
                        <span
                          className={`pointer-events-none w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                            isActive ? "bg-accent/20" : "bg-bg-accent"
                          }`}
                        >
                          <Icon
                            className={`w-4 h-4 ${isActive ? "text-txt" : "text-muted"}`}
                          />
                        </span>
                        <div className="pointer-events-none flex-1 text-left">
                          <div className="font-medium">
                            {t(NAV_LABEL_I18N_KEY[group.label] ?? group.label)}
                          </div>
                          {group.description && (
                            <div className="text-[11px] text-muted mt-0.5">
                              {group.description}
                            </div>
                          )}
                        </div>
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-3 border-t border-border/50 pt-3">
                <div className="flex items-center justify-end gap-2">
                  {renderMobileMenuLanguageDropdown()}
                  {renderMobileMenuThemeToggle()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
