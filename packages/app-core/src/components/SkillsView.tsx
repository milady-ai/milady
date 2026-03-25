/**
 * Skills management view — create, enable/disable, and install skills.
 *
 * Professional card-grid layout with search, stats, polished toggle switches,
 * and a structured install modal. Follows the CSS variable design system used
 * throughout the app (--bg, --card, --border, --accent, --muted, --txt, etc.).
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  StatusBadge,
  Switch,
  Textarea,
} from "@miladyai/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SkillInfo, SkillMarketplaceResult } from "../api";
import { client } from "../api";
import { useApp } from "../state";
import { ConfirmDeleteControl } from "./confirm-delete-control";
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

const SKILLS_SHELL_CLASS = `settings-shell plugins-game-modal plugins-game-modal--inline flex-col lg:flex-row ${APP_PANEL_SHELL_CLASSNAME}`;

/* ── Marketplace Result Card ────────────────────────────────────────── */

function MarketplaceCard({
  item,
  isInstalled,
  skillsMarketplaceAction,
  onInstall,
  onUninstall,
}: {
  item: SkillMarketplaceResult;
  isInstalled: boolean;
  skillsMarketplaceAction: string;
  onInstall: (item: SkillMarketplaceResult) => void;
  onUninstall: (skillId: string, name: string) => void;
}) {
  const { t } = useApp();
  const isInstalling = skillsMarketplaceAction === `install:${item.id}`;
  const isUninstalling = skillsMarketplaceAction === `uninstall:${item.id}`;
  const sourceLabel = item.repository || item.slug || item.id;

  return (
    <div className="flex items-start gap-4 p-4 border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/50 transition-colors">
      {/* Icon placeholder */}
      <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-[var(--accent)]/10 text-[var(--accent)] text-sm font-bold rounded">
        {item.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-[var(--txt)]">
          {item.name}
        </div>
        <div className="text-[11px] text-[var(--muted)] mt-0.5 line-clamp-2">
          {item.description || "No description."}
        </div>
        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[var(--muted)]">
          <span className="font-mono">{sourceLabel}</span>
          {item.score != null && (
            <>
              <span className="text-[var(--border)]">/</span>
              <span>
                {t("skillsview.score")} {item.score.toFixed(2)}
              </span>
            </>
          )}
          {item.tags && item.tags.length > 0 && (
            <>
              <span className="text-[var(--border)]">/</span>
              {item.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-px bg-[var(--accent)]/10 text-[var(--accent)]"
                >
                  {tag}
                </span>
              ))}
            </>
          )}
        </div>
      </div>
      {isInstalled ? (
        <Button
          variant="destructive"
          size="sm"
          className="h-8 px-4 text-[11px] font-bold tracking-wide shadow-sm shrink-0"
          onClick={() => onUninstall(item.id, item.name)}
          disabled={isUninstalling}
        >
          {isUninstalling ? "Removing..." : "Uninstall"}
        </Button>
      ) : (
        <Button
          variant="default"
          size="sm"
          className="h-8 px-4 text-[11px] font-bold tracking-wide shadow-sm shrink-0"
          onClick={() => onInstall(item)}
          disabled={isInstalling}
        >
          {isInstalling ? "Installing..." : "Install"}
        </Button>
      )}
    </div>
  );
}

/* ── Install Modal ──────────────────────────────────────────────────── */

type InstallTab = "search" | "url";

function InstallModal({
  skills,
  skillsMarketplaceQuery,
  skillsMarketplaceResults,
  skillsMarketplaceError,
  skillsMarketplaceLoading,
  skillsMarketplaceAction,
  skillsMarketplaceManualGithubUrl,
  searchSkillsMarketplace,
  installSkillFromMarketplace,
  uninstallMarketplaceSkill,
  installSkillFromGithubUrl,
  setState,
  onClose,
}: {
  skills: SkillInfo[];
  skillsMarketplaceQuery: string;
  skillsMarketplaceResults: SkillMarketplaceResult[];
  skillsMarketplaceError: string;
  skillsMarketplaceLoading: boolean;
  skillsMarketplaceAction: string;
  skillsMarketplaceManualGithubUrl: string;
  searchSkillsMarketplace: () => Promise<void>;
  installSkillFromMarketplace: (item: SkillMarketplaceResult) => Promise<void>;
  uninstallMarketplaceSkill: (skillId: string, name: string) => Promise<void>;
  installSkillFromGithubUrl: () => Promise<void>;
  setState: ReturnType<typeof useApp>["setState"];
  onClose: () => void;
}) {
  const { t } = useApp();
  const [tab, setTab] = useState<InstallTab>("search");

  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        container={typeof document !== "undefined" ? document.body : undefined}
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/98 p-0 shadow-2xl"
      >
        <DialogHeader>
          <DialogTitle className="text-[13px] font-extrabold uppercase tracking-[0.14em]">
            Install Skill
          </DialogTitle>
          <div className="mt-0.5 text-[11px] text-muted">
            Add skills from the marketplace or a GitHub repository.
          </div>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border/60 bg-bg-accent/35">
          {(
            [
              { id: "search" as const, label: "MARKETPLACE" },
              { id: "url" as const, label: "GITHUB URL" },
            ] as const
          ).map((t) => (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              key={t.id}
              className={`flex-1 rounded-none border-b-2 px-4 py-2.5 text-[11px] font-bold tracking-[0.1em] transition-colors ${
                tab === t.id
                  ? "border-accent text-accent"
                  : "border-transparent text-muted-strong hover:text-txt"
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "search" && (
            <>
              <div className="flex gap-2 items-center mb-4">
                <Input
                  type="text"
                  className="plugins-game-search-input"
                  style={{ flex: 1, minWidth: 200 }}
                  placeholder={t("skillsview.searchByKeyword")}
                  value={skillsMarketplaceQuery}
                  onChange={(e) =>
                    setState("skillsMarketplaceQuery", e.target.value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void searchSkillsMarketplace();
                  }}
                />
                <Button
                  variant="default"
                  size="sm"
                  type="button"
                  className="plugins-game-chip"
                  style={{ minHeight: 36, padding: "0 16px", fontWeight: 700 }}
                  onClick={() => searchSkillsMarketplace()}
                  disabled={skillsMarketplaceLoading}
                >
                  {skillsMarketplaceLoading ? "Searching..." : "Search"}
                </Button>
              </div>

              {skillsMarketplaceError && (
                <div className="mb-3 rounded-lg border border-danger/35 bg-danger/10 p-2.5 text-xs text-danger">
                  {skillsMarketplaceError}
                </div>
              )}

              {skillsMarketplaceResults.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-[12px] uppercase tracking-[0.1em] text-muted">
                    Search above to discover skills.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="text-[11px] text-[var(--muted)] mb-1">
                    {skillsMarketplaceResults.length} {t("skillsview.result")}
                    {skillsMarketplaceResults.length !== 1 ? "s" : ""}
                  </div>
                  {skillsMarketplaceResults.map((item) => (
                    <MarketplaceCard
                      key={item.id}
                      item={item}
                      isInstalled={skills.some((s) => s.id === item.id)}
                      skillsMarketplaceAction={skillsMarketplaceAction}
                      onInstall={installSkillFromMarketplace}
                      onUninstall={uninstallMarketplaceSkill}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "url" && (
            <div>
              <div className="mb-1 text-[12px] font-semibold text-txt">
                GitHub Repository URL
              </div>
              <div className="mb-3 text-[11px] text-muted">
                Paste a full GitHub repository URL to install a skill directly.
              </div>
              <div className="flex gap-2 items-center">
                <Input
                  type="text"
                  className="plugins-game-search-input"
                  style={{ flex: 1 }}
                  placeholder="https://github.com/org/repo"
                  value={skillsMarketplaceManualGithubUrl}
                  onChange={(e) =>
                    setState("skillsMarketplaceManualGithubUrl", e.target.value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void installSkillFromGithubUrl();
                  }}
                />
                <Button
                  variant="default"
                  size="sm"
                  type="button"
                  className="plugins-game-chip"
                  style={{ minHeight: 36, padding: "0 16px", fontWeight: 700 }}
                  onClick={() => installSkillFromGithubUrl()}
                  disabled={
                    skillsMarketplaceAction === "install:manual" ||
                    !skillsMarketplaceManualGithubUrl.trim()
                  }
                >
                  {skillsMarketplaceAction === "install:manual"
                    ? "Installing..."
                    : "Install"}
                </Button>
              </div>

              {skillsMarketplaceError && (
                <div className="mt-3 rounded-lg border border-danger/35 bg-danger/10 p-2.5 text-xs text-danger">
                  {skillsMarketplaceError}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Create Skill Inline Form ───────────────────────────────────────── */

function CreateSkillForm({
  skillCreateName,
  skillCreateDescription,
  skillCreating,
  setState,
  onCancel,
  onCreate,
}: {
  skillCreateName: string;
  skillCreateDescription: string;
  skillCreating: boolean;
  setState: ReturnType<typeof useApp>["setState"];
  onCancel: () => void;
  onCreate: () => void;
}) {
  const { t } = useApp();
  return (
    <div className="border border-[var(--accent)]/40 bg-[var(--card)] mb-4">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="text-xs font-semibold text-[var(--txt)]">
          {t("skillsview.CreateNewSkill")}
        </div>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <div>
          <span className="block text-[11px] text-[var(--muted)] mb-1 font-medium">
            {t("skillsview.SkillName")} <span className="text-danger">*</span>
          </span>
          <Input
            className="w-full bg-bg/50 border-border/50 focus-visible:ring-accent"
            placeholder={t("skillsview.eGMyAwesomeSkil")}
            value={skillCreateName}
            onChange={(e) => setState("skillCreateName", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && skillCreateName.trim()) onCreate();
            }}
          />
        </div>
        <div>
          <span className="block text-[11px] text-[var(--muted)] mb-1 font-medium">
            {t("skillsview.Description")}
          </span>
          <Input
            className="w-full bg-bg/50 border-border/50 focus-visible:ring-accent"
            placeholder={t("skillsview.BriefDescriptionOf")}
            value={skillCreateDescription}
            onChange={(e) => setState("skillCreateDescription", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && skillCreateName.trim()) onCreate();
            }}
          />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onCreate}
            disabled={skillCreating || !skillCreateName.trim()}
          >
            {skillCreating ? "Creating..." : "Create Skill"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Edit Skill Modal ──────────────────────────────────────────────── */

function EditSkillModal({
  skillId,
  skillName,
  onClose,
  onSaved,
}: {
  skillId: string;
  skillName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useApp();
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadSource = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await client.getSkillSource(skillId);
      setContent(res.content);
      setOriginalContent(res.content);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load skill source",
      );
    }
    setLoading(false);
  }, [skillId]);

  useEffect(() => {
    void loadSource();
  }, [loadSource]);

  const hasChanges = content !== originalContent;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaveSuccess(false);
    try {
      await client.saveSkillSource(skillId, content);
      setOriginalContent(content);
      setSaveSuccess(true);
      onSaved();
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
    setSaving(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      if (hasChanges && !saving) void handleSave();
    }
    // Allow tab to insert spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const val = target.value;
      setContent(`${val.substring(0, start)}  ${val.substring(end)}`);
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        container={typeof document !== "undefined" ? document.body : undefined}
        className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/98 p-0 shadow-2xl"
      >
        <DialogHeader className="flex-row items-center justify-between px-5 py-3 shrink-0 border-b border-[var(--border)] space-y-0">
          <div className="flex items-center gap-3 min-w-0">
            <DialogTitle className="font-semibold text-sm truncate">
              {skillName}
            </DialogTitle>
            <span className="rounded-md border border-border bg-bg-hover px-1.5 py-0.5 text-[10px] font-mono text-muted">
              {t("skillsview.SKILLMd")}
            </span>
            {hasChanges && (
              <span className="text-[10px] font-medium text-warn">
                {t("skillsview.unsaved")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted">
              {navigator.platform.includes("Mac") ? "⌘S" : "Ctrl+S"}{" "}
              {t("skillsview.toSave")}
            </span>
          </div>
        </DialogHeader>

        {/* Editor body */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              {t("skillsview.LoadingSkillSource")}
            </div>
          ) : error && !content ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="text-sm font-medium text-danger">{error}</div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => loadSource()}
              >
                {t("common.retry")}
              </Button>
            </div>
          ) : (
            <Textarea
              className="h-full w-full resize-none border-0 bg-bg-hover p-5 font-mono text-[13px] leading-relaxed text-txt focus:outline-none focus-visible:ring-0"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-border px-5 py-3">
          <div className="text-[11px] text-muted">
            {content ? `${content.split("\n").length} lines` : ""}
            {error && content ? (
              <span className="ml-3 text-danger">{error}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={onClose}
            >
              {hasChanges ? "Discard" : "Close"}
            </Button>
            <Button
              variant="default"
              size="sm"
              className={`text-xs font-medium ${
                saveSuccess
                  ? "border-ok/40 bg-ok text-white hover:bg-ok/90"
                  : ""
              }`}
              onClick={() => handleSave()}
              disabled={saving || !hasChanges}
            >
              {saving ? "Saving..." : saveSuccess ? "Saved" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main Skills View ───────────────────────────────────────────────── */

export function SkillsView({ inModal }: { inModal?: boolean } = {}) {
  if (inModal) return <SkillsModalView />;
  return <SkillsFullView />;
}

/* ── Companion Modal View (sidebar + detail, reuses plugins-game-* CSS) ── */

function SkillsModalView() {
  const {
    skills,
    skillToggleAction,
    loadSkills,
    handleSkillToggle,
    handleDeleteSkill,
    refreshSkills,
    setState,
    skillsMarketplaceQuery,
    skillsMarketplaceResults,
    skillsMarketplaceError,
    skillsMarketplaceLoading,
    skillsMarketplaceAction,
    skillsMarketplaceManualGithubUrl,
    searchSkillsMarketplace,
    installSkillFromMarketplace,
    uninstallMarketplaceSkill,
    installSkillFromGithubUrl,
    t,
  } = useApp();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "on" | "off">("all");
  const [editingSkill, setEditingSkill] = useState<SkillInfo | null>(null);
  const [installModalOpen, setInstallModalOpen] = useState(false);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const filtered = useMemo(() => {
    const searchLower = filterText.toLowerCase();
    return skills.filter((s) => {
      if (filterTab === "on" && !s.enabled) return false;
      if (filterTab === "off" && s.enabled) return false;
      if (
        searchLower &&
        !s.name.toLowerCase().includes(searchLower) &&
        !(s.description ?? "").toLowerCase().includes(searchLower)
      )
        return false;
      return true;
    });
  }, [skills, filterText, filterTab]);

  const effectiveSelectedId =
    selectedId && filtered.find((s) => s.id === selectedId)
      ? selectedId
      : (filtered[0]?.id ?? null);
  const selected = effectiveSelectedId
    ? (skills.find((s) => s.id === effectiveSelectedId) ?? null)
    : null;

  const tabs: { key: typeof filterTab; label: string }[] = [
    { key: "all", label: `ALL (${skills.length})` },
    { key: "on", label: `ON (${skills.filter((s) => s.enabled).length})` },
    { key: "off", label: `OFF (${skills.filter((s) => !s.enabled).length})` },
  ];

  return (
    <div className="plugins-game-modal">
      {/* ── Left sidebar ── */}
      <div className="plugins-game-list-panel">
        <div className="plugins-game-list-head">
          <div className="plugins-game-section-title">
            {t("skillsview.Talents", { defaultValue: "Talents" })}
          </div>
          <div className="plugins-game-section-meta">
            {skills.length}{" "}
            {t("skillsview.installed", { defaultValue: "installed" })}
          </div>
        </div>

        {/* Search + Install */}
        <div className="plugins-game-list-search">
          <div className="plugins-game-list-search-row">
            <Input
              type="text"
              placeholder={t("skillsview.SearchSkills", {
                defaultValue: "Search skills...",
              })}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="plugins-game-search-input"
            />
            <Button
              variant="default"
              size="sm"
              type="button"
              className="plugins-game-chip plugins-game-add-btn"
              onClick={() => setInstallModalOpen(true)}
            >
              <span className="plugins-game-add-symbol">+</span>{" "}
              {t("skillsview.Install", { defaultValue: "Install" })}
            </Button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="plugins-game-chip-row">
          {tabs.map((tab) => (
            <Button
              variant="ghost"
              size="sm"
              key={tab.key}
              type="button"
              className={`plugins-game-chip plugins-game-chip-small${filterTab === tab.key ? " is-active" : ""}`}
              onClick={() => setFilterTab(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Skill list */}
        <div className="plugins-game-list-scroll">
          {filtered.length === 0 ? (
            <div className="plugins-game-list-empty">
              {t("skillsview.NoSkillsFound", {
                defaultValue: "No skills found",
              })}
            </div>
          ) : (
            filtered.map((skill) => (
              <Button
                variant="ghost"
                key={skill.id}
                type="button"
                className={`plugins-game-card${effectiveSelectedId === skill.id ? " is-selected" : ""}${!skill.enabled ? " is-disabled" : ""} h-auto`}
                onClick={() => setSelectedId(skill.id)}
              >
                <div className="plugins-game-card-icon-shell">
                  <span className="plugins-game-card-icon">
                    {skill.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="plugins-game-card-body">
                  <div className="plugins-game-card-name">{skill.name}</div>
                  <div className="plugins-game-card-meta">
                    <span
                      className={`plugins-game-badge ${skill.enabled ? "is-on" : "is-off"}`}
                    >
                      {skill.enabled ? "ON" : "OFF"}
                    </span>
                  </div>
                </div>
              </Button>
            ))
          )}
        </div>
      </div>

      {/* ── Right detail panel ── */}
      <div className="plugins-game-detail-panel">
        {selected ? (
          <>
            <div className="plugins-game-detail-head">
              <div className="plugins-game-detail-title-row">
                <div className="plugins-game-detail-icon-shell">
                  <span className="plugins-game-detail-icon">
                    {selected.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="plugins-game-detail-main">
                  <div className="plugins-game-detail-name">
                    {selected.name}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  className={`plugins-game-toggle ${selected.enabled ? "is-on" : "is-off"}`}
                  onClick={() =>
                    handleSkillToggle(selected.id, !selected.enabled)
                  }
                  disabled={skillToggleAction === selected.id}
                >
                  {skillToggleAction === selected.id
                    ? "..."
                    : selected.enabled
                      ? "ON"
                      : "OFF"}
                </Button>
              </div>
            </div>
            <div className="plugins-game-detail-description">
              {selected.description || "No description provided."}
            </div>
            <div className="plugins-game-detail-actions">
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="plugins-game-action-btn"
                onClick={() => setEditingSkill(selected)}
              >
                {t("skillsview.EditSource", { defaultValue: "Edit Source" })}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                type="button"
                className="plugins-game-action-btn"
                onClick={() => handleDeleteSkill(selected.id, selected.name)}
              >
                {t("skillsview.Delete", { defaultValue: "Delete" })}
              </Button>
            </div>
          </>
        ) : (
          <div className="plugins-game-detail-empty">
            <span className="plugins-game-detail-empty-icon">🧠</span>
            <span className="plugins-game-detail-empty-text">
              {t("skillsview.SelectATalentToConf", {
                defaultValue: "Select a talent to configure",
              })}
            </span>
          </div>
        )}
      </div>

      {editingSkill && (
        <EditSkillModal
          skillId={editingSkill.id}
          skillName={editingSkill.name}
          onClose={() => setEditingSkill(null)}
          onSaved={() => void refreshSkills()}
        />
      )}

      {installModalOpen && (
        <InstallModal
          skills={skills}
          skillsMarketplaceQuery={skillsMarketplaceQuery}
          skillsMarketplaceResults={skillsMarketplaceResults}
          skillsMarketplaceError={skillsMarketplaceError}
          skillsMarketplaceLoading={skillsMarketplaceLoading}
          skillsMarketplaceAction={skillsMarketplaceAction}
          skillsMarketplaceManualGithubUrl={skillsMarketplaceManualGithubUrl}
          searchSkillsMarketplace={searchSkillsMarketplace}
          installSkillFromMarketplace={installSkillFromMarketplace}
          uninstallMarketplaceSkill={uninstallMarketplaceSkill}
          installSkillFromGithubUrl={installSkillFromGithubUrl}
          setState={setState}
          onClose={() => setInstallModalOpen(false)}
        />
      )}
    </div>
  );
}

/* ── Full-Page Skills View ─────────────────────────────────────────── */

function SkillsFullView() {
  const {
    skills,
    skillCreateFormOpen,
    skillCreateName,
    skillCreateDescription,
    skillCreating,
    skillReviewReport,
    skillReviewId,
    skillReviewLoading,
    skillToggleAction,
    skillsMarketplaceQuery,
    skillsMarketplaceResults,
    skillsMarketplaceError,
    skillsMarketplaceLoading,
    skillsMarketplaceAction,
    skillsMarketplaceManualGithubUrl,
    loadSkills,
    refreshSkills,
    handleSkillToggle,
    handleCreateSkill,
    handleDeleteSkill,
    handleReviewSkill,
    handleAcknowledgeSkill,
    searchSkillsMarketplace,
    installSkillFromMarketplace,
    uninstallMarketplaceSkill,
    installSkillFromGithubUrl,
    setState,
    t,
  } = useApp();

  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "on" | "off">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<SkillInfo | null>(null);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const filteredSkills = useMemo(() => {
    const query = filterText.toLowerCase();

    return skills.filter((skill) => {
      if (filterTab === "on" && !skill.enabled) return false;
      if (filterTab === "off" && skill.enabled) return false;
      if (
        query &&
        !skill.name.toLowerCase().includes(query) &&
        !skill.description?.toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [skills, filterText, filterTab]);

  const selectedSkillId =
    selectedId && filteredSkills.some((skill) => skill.id === selectedId)
      ? selectedId
      : (filteredSkills[0]?.id ?? null);
  const selectedSkill = selectedSkillId
    ? (skills.find((skill) => skill.id === selectedSkillId) ?? null)
    : null;

  const filterTabs: { key: typeof filterTab; label: string }[] = [
    { key: "all", label: `ALL (${skills.length})` },
    {
      key: "on",
      label: `ON (${skills.filter((skill) => skill.enabled).length})`,
    },
    {
      key: "off",
      label: `OFF (${skills.filter((skill) => !skill.enabled).length})`,
    },
  ];

  const handleDismissReview = () => {
    setState("skillReviewId", "");
    setState("skillReviewReport", null);
  };

  const handleCancelCreate = () => {
    setState("skillCreateFormOpen", false);
    setState("skillCreateName", "");
    setState("skillCreateDescription", "");
  };

  const selectedSkillReviewOpen = skillReviewId === selectedSkill?.id;
  const selectedNeedsAttention =
    selectedSkill?.scanStatus === "warning" ||
    selectedSkill?.scanStatus === "critical" ||
    selectedSkill?.scanStatus === "blocked";

  return (
    <div className="flex h-full w-full min-h-0 bg-bg p-0 lg:p-1">
      <div className={SKILLS_SHELL_CLASS} data-testid="skills-shell">
        <aside
          data-testid="skills-sidebar"
          className={`flex min-h-0 w-full max-w-none shrink-0 flex-col border-b border-border/40 lg:w-[clamp(18rem,23vw,21rem)] lg:min-w-[18rem] lg:max-w-[22rem] lg:border-b-0 lg:border-r ${APP_SIDEBAR_RAIL_CLASSNAME}`}
        >
          <div className={APP_SIDEBAR_INNER_CLASSNAME}>
            <div className={APP_SIDEBAR_HEADER_CLASSNAME}>
              <div className={APP_SIDEBAR_KICKER_CLASSNAME}>
                {t("nav.skills", { defaultValue: "Skills" })}
              </div>
              <div className={APP_SIDEBAR_META_CLASSNAME}>
                {skills.length}{" "}
                {t("skillsview.installed", { defaultValue: "installed" })}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant={skillCreateFormOpen ? "outline" : "default"}
                size="sm"
                type="button"
                className={`h-9 flex-1 rounded-full px-4 text-[11px] font-bold tracking-[0.12em] ${
                  skillCreateFormOpen
                    ? "border-border/50 bg-bg/25 text-txt"
                    : ""
                }`}
                onClick={() => {
                  setState("skillCreateFormOpen", !skillCreateFormOpen);
                  if (skillCreateFormOpen) {
                    handleCancelCreate();
                  }
                }}
              >
                {skillCreateFormOpen
                  ? t("common.cancel")
                  : `+ ${t("skillsview.NewSkill", { defaultValue: "New Skill" })}`}
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="h-9 rounded-full px-4 text-[11px] font-bold tracking-[0.12em]"
                onClick={() => setInstallModalOpen(true)}
              >
                {t("skillsview.Install", { defaultValue: "Install" })}
              </Button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Input
                type="text"
                placeholder={t("skillsview.filterSkills")}
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                aria-label={t("skillsview.filterSkills")}
                className={`min-w-0 flex-1 ${APP_SIDEBAR_SEARCH_INPUT_CLASSNAME}`}
              />
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className="h-10 rounded-full px-3 text-[10px] font-bold tracking-[0.14em] text-muted hover:text-txt"
                onClick={() => void refreshSkills()}
                title={t("skillsview.RefreshSkillsList", {
                  defaultValue: "Refresh Skills List",
                })}
              >
                {t("common.refresh")}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {filterTabs.map((tab) => (
                <Button
                  variant="ghost"
                  size="sm"
                  key={tab.key}
                  type="button"
                  className={`h-8 rounded-full border px-3 text-[10px] font-bold tracking-[0.14em] ${
                    filterTab === tab.key
                      ? "border-accent/30 bg-accent/10 text-txt"
                      : "border-border/45 text-muted hover:border-border/70 hover:bg-bg/35 hover:text-txt"
                  }`}
                  onClick={() => setFilterTab(tab.key)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            <nav
              className={`mt-4 space-y-1.5 ${APP_SIDEBAR_SCROLL_REGION_CLASSNAME}`}
            >
              {filteredSkills.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/45 bg-bg/20 px-4 py-6 text-center text-sm text-muted">
                  {skills.length === 0
                    ? "No Skills Installed"
                    : `No skills match "${filterText}"`}
                </div>
              ) : (
                filteredSkills.map((skill) => {
                  const needsAttention =
                    skill.scanStatus === "warning" ||
                    skill.scanStatus === "critical" ||
                    skill.scanStatus === "blocked";

                  return (
                    <div
                      key={skill.id}
                      data-testid={`skill-row-${skill.id}`}
                      className={`${APP_SIDEBAR_CARD_BASE_CLASSNAME} items-start gap-2 ${
                        selectedSkillId === skill.id
                          ? APP_SIDEBAR_CARD_ACTIVE_CLASSNAME
                          : APP_SIDEBAR_CARD_INACTIVE_CLASSNAME
                      }`}
                    >
                      <Button
                        variant="ghost"
                        className="flex h-auto min-w-0 flex-1 items-start gap-3 rounded-none p-0 text-left"
                        onClick={() => {
                          setSelectedId(skill.id);
                          setState("skillCreateFormOpen", false);
                        }}
                        aria-current={
                          selectedSkillId === skill.id ? "page" : undefined
                        }
                      >
                        <span
                          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border p-2 text-sm font-bold ${
                            selectedSkillId === skill.id
                              ? "border-accent/30 bg-accent/18 text-txt-strong"
                              : "border-border/50 bg-bg-accent/80 text-muted"
                          }`}
                        >
                          {skill.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block whitespace-normal break-words [overflow-wrap:anywhere] text-sm font-semibold leading-snug">
                            {skill.name}
                          </span>
                          <span className="mt-1 block whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2 text-[11px] leading-relaxed text-muted/85">
                            {skill.description || t("skillsview.noDescription")}
                          </span>
                        </span>
                      </Button>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] ${
                            skill.enabled
                              ? "border-accent bg-accent text-accent-fg"
                              : "border-border bg-transparent text-muted"
                          }`}
                        >
                          {skill.enabled ? "ON" : "OFF"}
                        </span>
                        {needsAttention && (
                          <span className="rounded-full border border-warn/30 bg-warn/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-warn">
                            {skill.scanStatus === "blocked"
                              ? t("skillsview.statusBlocked")
                              : t("skillsview.statusWarning")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </nav>
          </div>
        </aside>

        <div
          data-testid="skills-detail"
          className="min-w-0 flex-1 overflow-y-auto bg-bg/10"
        >
          <div className="mx-auto max-w-[76rem] px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
            {skills.length === 0 && !skillCreateFormOpen ? (
              <div className="rounded-[1.6rem] border border-border/45 bg-card/92 px-6 py-12 text-center shadow-[0_18px_44px_rgba(3,5,10,0.16)] ring-1 ring-border/10">
                <div
                  data-testid="skills-empty-state"
                  className="text-sm font-semibold text-txt"
                >
                  No Skills Installed
                </div>
                <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
                  Install skills from the marketplace or create your own.
                </div>
                <div className="mt-5 flex justify-center gap-3">
                  <Button
                    variant="default"
                    size="sm"
                    className="h-10 rounded-full px-5 font-bold tracking-[0.12em]"
                    onClick={() => setInstallModalOpen(true)}
                  >
                    Browse Marketplace
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 rounded-full px-5 font-bold tracking-[0.12em]"
                    onClick={() => setState("skillCreateFormOpen", true)}
                  >
                    Create Skill
                  </Button>
                </div>
              </div>
            ) : filteredSkills.length === 0 && !skillCreateFormOpen ? (
              <div
                data-testid="skills-filter-empty"
                className="rounded-[1.6rem] border border-dashed border-border/45 bg-bg/18 px-6 py-12 text-center text-sm text-muted"
              >
                No skills match filtering "{filterText}"
              </div>
            ) : skillCreateFormOpen ? (
              <section className="overflow-hidden rounded-[1.6rem] border border-border/45 bg-card/92 shadow-[0_18px_44px_rgba(3,5,10,0.16)] ring-1 ring-border/10">
                <div className="border-b border-border/35 px-5 py-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/60">
                    Skill Builder
                  </div>
                  <div className="mt-1 text-sm font-semibold text-txt">
                    {t("skillsview.CreateNewSkill")}
                  </div>
                </div>
                <div className="bg-bg/18 px-4 py-4 sm:px-5">
                  <CreateSkillForm
                    skillCreateName={skillCreateName}
                    skillCreateDescription={skillCreateDescription}
                    skillCreating={skillCreating}
                    setState={setState}
                    onCancel={handleCancelCreate}
                    onCreate={handleCreateSkill}
                  />
                </div>
              </section>
            ) : selectedSkill ? (
              <section
                data-skill-id={selectedSkill.id}
                className="overflow-hidden rounded-[1.6rem] border border-border/45 bg-card/92 shadow-[0_18px_44px_rgba(3,5,10,0.16)] ring-1 ring-border/10"
              >
                <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
                  <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent/30 bg-accent/18 p-2.5 text-base font-bold text-txt-strong">
                    {selectedSkill.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <div
                        data-testid="skills-detail-name"
                        className="whitespace-normal break-words [overflow-wrap:anywhere] text-sm font-semibold leading-snug text-txt"
                      >
                        {selectedSkill.name}
                      </div>
                      <StatusBadge
                        label={
                          selectedSkill.scanStatus === "blocked" ||
                          selectedSkill.scanStatus === "critical"
                            ? t("skillsview.statusBlocked")
                            : selectedSkill.scanStatus === "warning"
                              ? t("skillsview.statusWarning")
                              : selectedSkill.enabled
                                ? t("skillsview.statusActive")
                                : t("skillsview.statusInactive")
                        }
                        tone={
                          selectedSkill.scanStatus === "warning"
                            ? "warning"
                            : selectedSkill.scanStatus === "blocked" ||
                                selectedSkill.scanStatus === "critical"
                              ? "danger"
                              : selectedSkill.enabled
                                ? "success"
                                : "muted"
                        }
                        withDot
                      />
                      <span className="text-[11px] font-mono text-muted/80">
                        {selectedSkill.id}
                      </span>
                    </div>
                    <div className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
                      {selectedSkill.description || "No description provided."}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {selectedNeedsAttention && !selectedSkillReviewOpen && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-auto rounded-full border-warn/35 bg-warn/12 px-3 py-1.5 text-[10px] font-bold tracking-[0.14em] text-warn"
                        onClick={() => handleReviewSkill(selectedSkill.id)}
                      >
                        {t("skillsview.ReviewFindings")}
                      </Button>
                    )}
                    {selectedNeedsAttention && selectedSkillReviewOpen && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-auto rounded-full border-border/50 px-3 py-1.5 text-[11px] font-semibold text-muted hover:text-txt"
                        onClick={handleDismissReview}
                      >
                        {t("skillsview.Dismiss")}
                      </Button>
                    )}
                    <Switch
                      checked={selectedSkill.enabled}
                      disabled={skillToggleAction === selectedSkill.id}
                      onCheckedChange={(next) =>
                        handleSkillToggle(selectedSkill.id, next)
                      }
                    />
                  </div>
                </div>

                <div className="border-t border-border/40 bg-bg/18 px-4 py-4 sm:px-5">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-full px-4 text-[11px] font-bold tracking-[0.12em]"
                      onClick={() => setEditingSkill(selectedSkill)}
                    >
                      {t("skillsview.EditSource", {
                        defaultValue: "Edit Source",
                      })}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 rounded-full px-4 text-[11px] font-bold tracking-[0.12em] text-muted hover:text-txt"
                      onClick={() => void refreshSkills()}
                    >
                      {t("common.refresh")}
                    </Button>
                    <ConfirmDeleteControl
                      triggerClassName="h-9 rounded-full px-4 text-[11px] font-bold tracking-[0.12em] !bg-transparent text-danger hover:!bg-danger/15 hover:text-danger-foreground transition-colors border border-danger/30"
                      confirmClassName="px-3 py-1 text-[11px] font-bold bg-danger text-danger-foreground hover:bg-danger/90 transition-colors rounded-md shadow-sm"
                      cancelClassName="px-3 py-1 text-[11px] font-bold text-muted border border-border/40 hover:text-txt transition-colors rounded-md"
                      confirmLabel={t("conversations.deleteYes")}
                      cancelLabel={t("conversations.deleteNo")}
                      onConfirm={() =>
                        handleDeleteSkill(selectedSkill.id, selectedSkill.name)
                      }
                    />
                  </div>

                  {selectedSkillReviewOpen && skillReviewReport ? (
                    <div className="rounded-[24px] border border-border/25 bg-bg/10 p-4 sm:p-5">
                      <div className="mb-3 flex flex-wrap items-center gap-3">
                        <span className="text-xs font-semibold text-txt">
                          {t("skillsview.ScanReport")}
                        </span>
                        <span className="text-[11px] font-mono text-danger">
                          {skillReviewReport.summary.critical}{" "}
                          {t("skillsview.critical")}
                        </span>
                        <span className="text-[11px] font-mono text-warn">
                          {skillReviewReport.summary.warn}{" "}
                          {t("skillsview.warnings")}
                        </span>
                      </div>
                      {skillReviewReport.findings.length > 0 && (
                        <div className="custom-scrollbar max-h-64 overflow-y-auto rounded-2xl border border-border/35 bg-card/30">
                          {skillReviewReport.findings.map((finding, idx) => (
                            <div
                              key={`${finding.file}:${finding.line}:${finding.message}`}
                              className={`flex items-start gap-2 px-3 py-2 text-[11px] ${
                                idx > 0 ? "border-t border-border/30" : ""
                              }`}
                            >
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${
                                  finding.severity === "critical"
                                    ? "bg-danger/12 text-danger"
                                    : "bg-warn/12 text-warn"
                                }`}
                              >
                                {finding.severity}
                              </span>
                              <span className="min-w-0 flex-1 text-txt">
                                {finding.message}
                              </span>
                              <span className="shrink-0 font-mono text-muted">
                                {finding.file}:{finding.line}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-4 flex gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          className="h-9 rounded-full px-4 text-[11px] font-bold tracking-[0.12em]"
                          onClick={() =>
                            handleAcknowledgeSkill(selectedSkill.id)
                          }
                        >
                          {t("skillsview.AcknowledgeAmpEn")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 rounded-full px-4 text-[11px] font-bold tracking-[0.12em] text-muted hover:text-txt"
                          onClick={handleDismissReview}
                        >
                          {t("skillsview.Dismiss")}
                        </Button>
                      </div>
                    </div>
                  ) : selectedSkillReviewOpen && skillReviewLoading ? (
                    <div className="rounded-2xl border border-border/35 bg-bg/10 px-4 py-3 text-sm text-muted">
                      {t("skillsview.LoadingScanReport")}
                    </div>
                  ) : (
                    <div className="rounded-[24px] border border-border/25 bg-bg/10 p-4 sm:p-5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/60">
                        {t("skillsview.EditSource", {
                          defaultValue: "Edit Source",
                        })}
                      </div>
                      <div className="mt-2 text-sm leading-relaxed text-muted">
                        Open the skill source editor to inspect or modify
                        `SKILL.md`, or review findings here when a skill needs
                        attention.
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <div className="rounded-[1.6rem] border border-dashed border-border/45 bg-bg/18 px-6 py-12 text-center text-sm text-muted">
                {t("skillsview.SelectATalentToConf", {
                  defaultValue: "Select a talent to configure",
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editingSkill && (
        <EditSkillModal
          skillId={editingSkill.id}
          skillName={editingSkill.name}
          onClose={() => setEditingSkill(null)}
          onSaved={() => void refreshSkills()}
        />
      )}

      {/* Install modal */}
      {installModalOpen && (
        <InstallModal
          skills={skills}
          skillsMarketplaceQuery={skillsMarketplaceQuery}
          skillsMarketplaceResults={skillsMarketplaceResults}
          skillsMarketplaceError={skillsMarketplaceError}
          skillsMarketplaceLoading={skillsMarketplaceLoading}
          skillsMarketplaceAction={skillsMarketplaceAction}
          skillsMarketplaceManualGithubUrl={skillsMarketplaceManualGithubUrl}
          searchSkillsMarketplace={searchSkillsMarketplace}
          installSkillFromMarketplace={installSkillFromMarketplace}
          uninstallMarketplaceSkill={uninstallMarketplaceSkill}
          installSkillFromGithubUrl={installSkillFromGithubUrl}
          setState={setState}
          onClose={() => setInstallModalOpen(false)}
        />
      )}
    </div>
  );
}
