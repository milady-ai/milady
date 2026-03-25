/**
 * Settings view — two-panel layout with section navigator and active section.
 */

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SectionCard,
  Spinner,
} from "@miladyai/ui";
import {
  AlertTriangle,
  Bot,
  Cloud,
  Download,
  Image,
  RefreshCw,
  Shield,
  Sliders,
  Terminal,
  Upload,
  Wallet,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../state";
import { CodingAgentSettingsSection } from "./CodingAgentSettingsSection";
import { ConfigPageView } from "./ConfigPageView";
import { CloudDashboard } from "./ElizaCloudDashboard";
import { MediaSettingsSection } from "./MediaSettingsSection";
import { PermissionsSection } from "./PermissionsSection";
import { ProviderSwitcher } from "./ProviderSwitcher";
import { ReleaseCenterView } from "./ReleaseCenterView";
import {
  APP_PANEL_SHELL_CLASSNAME,
  APP_SIDEBAR_CARD_ACTIVE_CLASSNAME,
  APP_SIDEBAR_CARD_BASE_CLASSNAME,
  APP_SIDEBAR_CARD_INACTIVE_CLASSNAME,
  APP_SIDEBAR_HEADER_CLASSNAME,
  APP_SIDEBAR_INNER_CLASSNAME,
  APP_SIDEBAR_KICKER_CLASSNAME,
  APP_SIDEBAR_META_CLASSNAME,
  APP_SIDEBAR_RAIL_CLASSNAME,
  APP_SIDEBAR_SCROLL_REGION_CLASSNAME,
  APP_SIDEBAR_SEARCH_INPUT_CLASSNAME,
} from "./sidebar-shell-styles";

interface SettingsSectionDef {
  id: string;
  label: string;
  icon: React.ElementType;
  description?: string;
}

const SETTINGS_SHELL_CLASS = `settings-shell plugins-game-modal plugins-game-modal--inline ${APP_PANEL_SHELL_CLASSNAME}`;
const SETTINGS_SIDEBAR_RAIL_CLASS = `hidden lg:flex lg:w-[clamp(18rem,23vw,21rem)] lg:min-w-[18rem] lg:max-w-[22rem] lg:shrink-0 lg:flex-col lg:border-r lg:border-border/40 ${APP_SIDEBAR_RAIL_CLASSNAME}`;
const SETTINGS_CONTENT_CLASS =
  "settings-page-content flex-1 min-w-0 overflow-y-auto scroll-smooth bg-bg/10 px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-5 lg:px-7 lg:pb-10 lg:pt-6";
const SETTINGS_CONTENT_WIDTH_CLASS = "mx-auto w-full max-w-[82rem]";
const SETTINGS_SECTION_STACK_CLASS = "space-y-6 pb-14 sm:space-y-8 sm:pb-16";
const SETTINGS_SECTION_CARD_CLASS =
  "overflow-hidden rounded-[28px] border-border/35 bg-bg/20 shadow-sm ring-1 ring-border/10";

const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  {
    id: "cloud",
    label: "providerswitcher.elizaCloud",
    icon: Cloud,
    description: "settings.sections.cloud.desc",
  },
  {
    id: "ai-model",
    label: "settings.sections.aimodel.label",
    icon: Bot,
    description: "settings.sections.aimodel.desc",
  },
  {
    id: "coding-agents",
    label: "settings.sections.codingagents.label",
    icon: Terminal,
    description: "settings.sections.codingagents.desc",
  },
  {
    id: "wallet-rpc",
    label: "settings.sections.walletrpc.label",
    icon: Wallet,
    description: "settings.sections.walletrpc.desc",
  },
  {
    id: "media",
    label: "settings.sections.media.label",
    icon: Image,
    description: "settings.sections.media.desc",
  },
  {
    id: "permissions",
    label: "settings.sections.permissions.label",
    icon: Shield,
    description: "settings.sections.permissions.desc",
  },
  {
    id: "updates",
    label: "settings.sections.updates.label",
    icon: RefreshCw,
    description: "settings.sections.updates.desc",
  },
  {
    id: "advanced",
    label: "nav.advanced",
    icon: Sliders,
    description: "settings.sections.advanced.desc",
  },
];

function matchesSettingsSection(
  section: SettingsSectionDef,
  query: string,
  t: (key: string) => string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return (
    t(section.label).toLowerCase().includes(normalized) ||
    (section.description
      ? t(section.description).toLowerCase().includes(normalized)
      : false)
  );
}

/* ── Settings Sidebar ────────────────────────────────────────────────── */

function SettingsSidebar({
  sections,
  activeSection,
  onSectionChange,
  searchQuery,
  onSearchChange,
  onClose: _onClose,
}: {
  sections: SettingsSectionDef[];
  activeSection: string;
  onSectionChange: (id: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClose: () => void;
}) {
  const { t } = useApp();
  const searchLabel = t("settingsview.SearchSettings", {
    defaultValue: "Search settings",
  });

  return (
    <aside
      className="hidden lg:flex lg:min-h-0 lg:flex-col"
      data-testid="settings-sidebar"
    >
      <div className={APP_SIDEBAR_INNER_CLASSNAME}>
        <div className={APP_SIDEBAR_HEADER_CLASSNAME}>
          <div className={APP_SIDEBAR_KICKER_CLASSNAME}>
            {t("nav.settings")}
          </div>
          <div className={APP_SIDEBAR_META_CLASSNAME}>
            {sections.length}{" "}
            {t("settingsview.Sections", { defaultValue: "sections" })}
          </div>
        </div>

        <div className="mt-4">
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchLabel}
            aria-label={searchLabel}
            className={`w-full ${APP_SIDEBAR_SEARCH_INPUT_CLASSNAME}`}
          />
        </div>

        <nav
          className={`mt-4 space-y-1.5 ${APP_SIDEBAR_SCROLL_REGION_CLASSNAME}`}
          aria-label={t("nav.settings")}
        >
          {sections.map((section) => {
            const isActive = activeSection === section.id;
            const Icon = section.icon;
            return (
              <Button
                key={section.id}
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => onSectionChange(section.id)}
                aria-current={isActive ? "page" : undefined}
                className={`${APP_SIDEBAR_CARD_BASE_CLASSNAME} ${
                  isActive
                    ? APP_SIDEBAR_CARD_ACTIVE_CLASSNAME
                    : APP_SIDEBAR_CARD_INACTIVE_CLASSNAME
                }`}
              >
                <span
                  className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                    isActive
                      ? "border-accent/25 bg-accent/12 text-accent-fg"
                      : "border-border/40 bg-bg/35 text-muted-strong"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 text-left">
                  <div
                    className={`truncate text-sm ${isActive ? "font-semibold" : "font-medium"}`}
                  >
                    {t(section.label)}
                  </div>
                  {section.description ? (
                    <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted/85">
                      {t(section.description)}
                    </div>
                  ) : null}
                </div>
              </Button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

/* ── Updates Section ─────────────────────────────────────────────────── */

function UpdatesSection() {
  return <ReleaseCenterView />;
}

/* ── Advanced Section ─────────────────────────────────────────────────── */

function AdvancedSection() {
  const { t } = useApp();
  const {
    handleReset,
    exportBusy,
    exportPassword,
    exportIncludeLogs,
    exportError,
    exportSuccess,
    importBusy,
    importPassword,
    importFile,
    importError,
    importSuccess,
    handleAgentExport,
    handleAgentImport,
    setState,
  } = useApp();
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const resetExportState = useCallback(() => {
    setState("exportPassword", "");
    setState("exportIncludeLogs", false);
    setState("exportError", null);
    setState("exportSuccess", null);
  }, [setState]);

  const resetImportState = useCallback(() => {
    if (importFileInputRef.current) {
      importFileInputRef.current.value = "";
    }
    setState("importPassword", "");
    setState("importFile", null);
    setState("importError", null);
    setState("importSuccess", null);
  }, [setState]);

  const openExportModal = useCallback(() => {
    resetExportState();
    setExportModalOpen(true);
  }, [resetExportState]);

  const closeExportModal = useCallback(() => {
    setExportModalOpen(false);
    resetExportState();
  }, [resetExportState]);

  const openImportModal = useCallback(() => {
    resetImportState();
    setImportModalOpen(true);
  }, [resetImportState]);

  const closeImportModal = useCallback(() => {
    setImportModalOpen(false);
    resetImportState();
  }, [resetImportState]);

  return (
    <>
      <div className="space-y-6">
        {/* Export/Import */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Button
            variant="outline"
            type="button"
            onClick={openExportModal}
            className="min-h-[5.5rem] p-5 rounded-[calc(var(--radius-xl)+2px)] flex items-center gap-4 border border-border/50 bg-card/60 text-left backdrop-blur-md transition-all group hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_4px_20px_rgba(var(--accent),0.1)] h-auto"
            aria-haspopup="dialog"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-bg-accent p-3 shadow-sm transition-all group-hover:border-accent group-hover:bg-accent">
              <Download className="h-5 w-5 shrink-0 text-txt transition-colors group-hover:text-accent-fg" />
            </div>
            <div>
              <div className="font-medium text-sm">
                {t("settings.exportAgent")}
              </div>
              <div className="text-xs text-muted">
                {t("settings.exportAgentShort")}
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            type="button"
            onClick={openImportModal}
            className="min-h-[5.5rem] p-5 rounded-[calc(var(--radius-xl)+2px)] flex items-center gap-4 border border-border/50 bg-card/60 text-left backdrop-blur-md transition-all group hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_4px_20px_rgba(var(--accent),0.1)] h-auto"
            aria-haspopup="dialog"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-bg-accent p-3 shadow-sm transition-all group-hover:border-accent group-hover:bg-accent">
              <Upload className="h-5 w-5 shrink-0 text-txt transition-colors group-hover:text-accent-fg" />
            </div>
            <div>
              <div className="font-medium text-sm">
                {t("settings.importAgent")}
              </div>
              <div className="text-xs text-muted">
                {t("settings.importAgentShort")}
              </div>
            </div>
          </Button>
        </div>

        {/* Danger Zone */}
        <div className="border border-danger/30 rounded-2xl overflow-hidden bg-bg/40 backdrop-blur-sm">
          <div className="bg-danger/10 px-5 py-3 border-b border-danger/20 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-danger" />
            <span className="font-bold text-sm text-danger tracking-wide uppercase">
              {t("settings.dangerZone")}
            </span>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">
                  {t("settings.resetAgent")}
                </div>
                <div className="text-xs text-muted">
                  {t("settings.resetAgentHint")}
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="rounded-xl shadow-sm whitespace-nowrap"
                onClick={() => {
                  void handleReset();
                }}
              >
                {t("settings.resetEverything")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={exportModalOpen}
        onOpenChange={(open) => {
          if (!open) closeExportModal();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.exportAgent")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="settings-export-password"
                className="text-txt-strong"
              >
                {t("settingsview.Password")}
              </Label>
              <Input
                id="settings-export-password"
                type="password"
                value={exportPassword}
                onChange={(e) => setState("exportPassword", e.target.value)}
                placeholder={t("settingsview.EnterExportPasswor")}
                className="rounded-lg bg-bg"
              />
              <Label className="flex items-center gap-2 font-normal text-muted">
                <Checkbox
                  checked={exportIncludeLogs}
                  onCheckedChange={(checked) =>
                    setState("exportIncludeLogs", !!checked)
                  }
                />

                {t("settingsview.IncludeRecentLogs")}
              </Label>
            </div>

            {exportError && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {exportError}
              </div>
            )}
            {exportSuccess && (
              <div className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">
                {exportSuccess}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[2.625rem] px-4 rounded-[calc(var(--radius-lg)+2px)]"
                onClick={closeExportModal}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="default"
                size="sm"
                className="min-h-[2.625rem] px-4 rounded-[calc(var(--radius-lg)+2px)]"
                disabled={exportBusy}
                onClick={() => void handleAgentExport()}
              >
                {exportBusy && <Spinner size={16} />}
                {t("common.export")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importModalOpen}
        onOpenChange={(open) => {
          if (!open) closeImportModal();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.importAgent")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <input
              ref={importFileInputRef}
              type="file"
              className="hidden"
              accept=".eliza-agent,.agent,application/octet-stream"
              onChange={(e) =>
                setState("importFile", e.target.files?.[0] ?? null)
              }
            />

            <div className="space-y-2">
              <div className="text-sm font-medium text-txt-strong">
                {t("settingsview.BackupFile")}
              </div>
              <Button
                variant="outline"
                className="min-h-[2.625rem] px-4 rounded-[calc(var(--radius-lg)+2px)] flex w-full items-center justify-between gap-3 text-left"
                onClick={() => importFileInputRef.current?.click()}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-txt">
                  {importFile?.name ?? t("settingsview.ChooseAnExportedBack")}
                </span>
                <span className="shrink-0 text-xs font-medium text-txt">
                  {importFile
                    ? t("settings.change", { defaultValue: "Change" })
                    : t("settings.browse", { defaultValue: "Browse" })}
                </span>
              </Button>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="settings-import-password"
                className="text-txt-strong"
              >
                {t("settingsview.Password")}
              </Label>
              <Input
                id="settings-import-password"
                type="password"
                value={importPassword}
                onChange={(e) => setState("importPassword", e.target.value)}
                placeholder={t("settingsview.EnterImportPasswor")}
                className="rounded-lg bg-bg"
              />
            </div>

            {importError && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {importError}
              </div>
            )}
            {importSuccess && (
              <div className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">
                {importSuccess}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[2.625rem] px-4 rounded-[calc(var(--radius-lg)+2px)]"
                onClick={closeImportModal}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="default"
                size="sm"
                className="min-h-[2.625rem] px-4 rounded-[calc(var(--radius-lg)+2px)]"
                disabled={importBusy}
                onClick={() => void handleAgentImport()}
              >
                {importBusy && <Spinner size={16} />}
                {t("settings.import")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── SettingsView ─────────────────────────────────────────────────────── */

export function SettingsView({
  inModal,
  onClose,
  initialSection,
}: {
  inModal?: boolean;
  onClose?: () => void;
  initialSection?: string;
} = {}) {
  const { t, loadPlugins, setTab } = useApp();
  const [activeSection, setActiveSection] = useState(initialSection ?? "cloud");
  const [searchQuery, setSearchQuery] = useState("");
  const shellRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  const visibleSections = useMemo(
    () =>
      SETTINGS_SECTIONS.filter((section) =>
        matchesSettingsSection(section, searchQuery, t),
      ),
    [searchQuery, t],
  );
  const visibleSectionIds = useMemo(
    () => new Set(visibleSections.map((section) => section.id)),
    [visibleSections],
  );

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  useEffect(() => {
    const content = contentRef.current;
    const shell = shellRef.current;
    if (content) {
      scrollContainerRef.current = content;
      return;
    }
    if (!shell) return;

    scrollContainerRef.current = inModal
      ? shell
      : (shell.closest('[data-shell-scroll-region="true"]') ?? shell);
  }, [inModal]);

  const handleClose = useCallback(
    () => onClose?.() ?? setTab(inModal ? "companion" : "chat"),
    [inModal, onClose, setTab],
  );

  const handleSectionChange = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    if (shellRef.current) {
      const element = shellRef.current.querySelector(`#${sectionId}`);
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, []);

  useEffect(() => {
    if (visibleSections.length === 0) return;
    if (!visibleSectionIds.has(activeSection)) {
      setActiveSection(visibleSections[0].id);
    }
  }, [activeSection, visibleSectionIds, visibleSections]);

  useEffect(() => {
    if (!initialSection) return;
    handleSectionChange(initialSection);
  }, [handleSectionChange, initialSection]);

  useEffect(() => {
    const shell = shellRef.current;
    const root = scrollContainerRef.current;
    if (!shell || !root) return;

    const handleScroll = () => {
      const sections = visibleSections
        .map((section) => {
          const el = shell.querySelector(`#${section.id}`);
          return { id: section.id, el };
        })
        .filter(
          (section): section is { id: string; el: HTMLElement } =>
            section.el instanceof HTMLElement,
        );

      if (sections.length === 0) return;

      if (
        root.scrollHeight - Math.ceil(root.scrollTop) <=
        root.clientHeight + 10
      ) {
        setActiveSection(sections[sections.length - 1].id);
        return;
      }

      const rootRect = root.getBoundingClientRect();
      let currentSection = sections[0].id;

      for (const { id, el } of sections) {
        const elRect = el.getBoundingClientRect();
        if (elRect.top - rootRect.top <= 150) {
          currentSection = id;
        }
      }

      setActiveSection((prev) =>
        prev !== currentSection ? currentSection : prev,
      );
    };

    root.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => root.removeEventListener("scroll", handleScroll);
  }, [visibleSections]);

  const sectionsContent = (
    <>
      {visibleSectionIds.has("cloud") && (
        <section
          id="cloud"
          className={`${SETTINGS_SECTION_CARD_CLASS} relative`}
        >
          <CloudDashboard />
        </section>
      )}

      {visibleSectionIds.has("ai-model") && (
        <SectionCard
          id="ai-model"
          title={t("settings.sections.aimodel.label")}
          description={t("settings.sections.aimodel.desc")}
          className={SETTINGS_SECTION_CARD_CLASS}
        >
          <ProviderSwitcher />
        </SectionCard>
      )}

      {visibleSectionIds.has("coding-agents") && (
        <SectionCard
          id="coding-agents"
          title={t("settings.sections.codingagents.label")}
          description={t("settings.codingAgentsDescription")}
          className={SETTINGS_SECTION_CARD_CLASS}
        >
          <CodingAgentSettingsSection />
        </SectionCard>
      )}

      {visibleSectionIds.has("wallet-rpc") && (
        <SectionCard
          id="wallet-rpc"
          title={t("settings.sections.walletrpc.label")}
          description={t("settings.walletRpcDescription")}
          className={SETTINGS_SECTION_CARD_CLASS}
        >
          <ConfigPageView embedded />
        </SectionCard>
      )}

      {visibleSectionIds.has("media") && (
        <SectionCard
          id="media"
          title={t("settings.sections.media.label")}
          description={t("settings.sections.media.desc")}
          className={SETTINGS_SECTION_CARD_CLASS}
        >
          <MediaSettingsSection />
        </SectionCard>
      )}

      {visibleSectionIds.has("permissions") && (
        <SectionCard
          id="permissions"
          title={t("settings.sections.permissions.label")}
          description={t("settings.sections.permissions.desc")}
          className={SETTINGS_SECTION_CARD_CLASS}
        >
          <PermissionsSection />
        </SectionCard>
      )}

      {visibleSectionIds.has("updates") && (
        <SectionCard
          id="updates"
          title={t("settings.sections.updates.label")}
          description={t("settings.sections.updates.desc")}
          className={SETTINGS_SECTION_CARD_CLASS}
        >
          <UpdatesSection />
        </SectionCard>
      )}

      {visibleSectionIds.has("advanced") && (
        <SectionCard
          id="advanced"
          title={t("nav.advanced")}
          description={t("settings.sections.advanced.desc")}
          className={SETTINGS_SECTION_CARD_CLASS}
        >
          <AdvancedSection />
        </SectionCard>
      )}

      {visibleSections.length === 0 && (
        <SectionCard
          id="settings-empty"
          title={t("settingsview.NoMatchingSettings")}
          description={t("settings.noMatchingSettingsDescription")}
          className={SETTINGS_SECTION_CARD_CLASS}
        >
          <Button
            variant="outline"
            className="min-h-[2.625rem] px-4 rounded-[calc(var(--radius-lg)+2px)]"
            onClick={() => setSearchQuery("")}
          >
            {t("settingsview.ClearSearch")}
          </Button>
        </SectionCard>
      )}
    </>
  );

  return (
    <div className="flex h-full w-full min-h-0 bg-bg p-0 lg:p-1">
      <div
        ref={shellRef}
        className={SETTINGS_SHELL_CLASS}
        data-testid="settings-shell"
      >
        <div className={SETTINGS_SIDEBAR_RAIL_CLASS}>
          <SettingsSidebar
            sections={visibleSections}
            activeSection={activeSection}
            onSectionChange={handleSectionChange}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onClose={handleClose}
          />
        </div>

        <div ref={contentRef} className={SETTINGS_CONTENT_CLASS}>
          <div className={SETTINGS_CONTENT_WIDTH_CLASS}>
            <div className={SETTINGS_SECTION_STACK_CLASS}>
              {sectionsContent}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
