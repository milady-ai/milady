import {
  Button,
  FieldLabel,
  NewActionButton,
  PagePanel,
  Sidebar,
  SidebarCollapsedActionButton,
  SidebarContent,
  SidebarHeader,
  SidebarPanel,
  SidebarScrollRegion,
  StatusBadge,
  StatusDot,
} from "@miladyai/ui";
import { Plus } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TriggerSummary } from "../../api/client";
import { useApp } from "../../state";
import { confirmDesktopAction } from "../../utils";
import { formatDateTime, formatDurationMs } from "../../utils/format";
import { HeartbeatForm } from "./HeartbeatForm";
import {
  BUILT_IN_TEMPLATES,
  buildCreateRequest,
  buildUpdateRequest,
  emptyForm,
  formFromTrigger,
  getTemplateInstructions,
  getTemplateName,
  type HeartbeatTemplate,
  loadUserTemplates,
  localizedExecutionStatus,
  railMonogram,
  saveUserTemplates,
  scheduleLabel,
  toneForLastStatus,
  type TranslateFn,
  type TriggerFormState,
  validateForm,
} from "./heartbeat-utils";

// ── View controller hook ───────────────────────────────────────────

function useHeartbeatsViewController() {
  const {
    triggers = [],
    triggersLoaded = false,
    triggersLoading = false,
    triggersSaving = false,
    triggerRunsById = {},
    triggerHealth: _triggerHealth = null,
    triggerError = null,
    loadTriggers = async () => {},
    createTrigger = async () => null,
    updateTrigger = async () => null,
    deleteTrigger = async () => true,
    runTriggerNow = async () => true,
    loadTriggerRuns = async () => {},
    loadTriggerHealth = async () => {},
    ensureTriggersLoaded = async () => {
      await loadTriggers(triggersLoaded ? { silent: true } : undefined);
    },
    t,
  } = useApp();

  const [form, setForm] = useState<TriggerFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedTriggerId, setSelectedTriggerId] = useState<string | null>(
    null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [userTemplates, setUserTemplates] =
    useState<HeartbeatTemplate[]>(loadUserTemplates);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const didBootstrapDataRef = useRef(false);

  const saveFormAsTemplate = useCallback(() => {
    const name = form.displayName.trim();
    if (!name) return;
    const template: HeartbeatTemplate = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      instructions: form.instructions.trim(),
      interval: form.durationValue || "1",
      unit: form.durationUnit,
    };
    setUserTemplates((prev) => {
      const next = [...prev, template];
      saveUserTemplates(next);
      return next;
    });
  }, [form]);

  const deleteUserTemplate = useCallback((id: string) => {
    setUserTemplates((prev) => {
      const next = prev.filter((t) => t.id !== id);
      saveUserTemplates(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (didBootstrapDataRef.current) return;
    didBootstrapDataRef.current = true;
    void loadTriggerHealth();
    void ensureTriggersLoaded();
  }, [ensureTriggersLoaded, loadTriggerHealth]);

  useEffect(() => {
    if (!selectedTriggerId) return;
    if (!triggers.some((trigger) => trigger.id === selectedTriggerId)) {
      setSelectedTriggerId(null);
    }
  }, [selectedTriggerId, triggers]);

  useEffect(() => {
    if (!editorOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditorOpen(false);
        setEditingId(null);
        setForm(emptyForm);
        setFormError(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editorOpen]);

  const resetEditor = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormError(null);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    resetEditor();
  };

  const openCreateEditor = () => {
    resetEditor();
    setEditorOpen(true);
  };

  const openEditEditor = (trigger: TriggerSummary) => {
    setEditingId(trigger.id);
    setForm(formFromTrigger(trigger));
    setFormError(null);
    setSelectedTriggerId(trigger.id);
    setEditorOpen(true);
  };

  const setField = <K extends keyof TriggerFormState>(
    key: K,
    value: TriggerFormState[K],
  ) => setForm((previous) => ({ ...previous, [key]: value }));

  const onSubmit = async () => {
    const error = validateForm(form, t);
    if (error) {
      setFormError(error);
      return;
    }

    setFormError(null);

    if (editingId) {
      const updated = await updateTrigger(editingId, buildUpdateRequest(form));
      if (updated) {
        setSelectedTriggerId(updated.id);
        closeEditor();
      }
      return;
    }

    const created = await createTrigger(buildCreateRequest(form));
    if (created) {
      setSelectedTriggerId(created.id);
      void loadTriggerRuns(created.id);
      closeEditor();
    }
  };

  const onDelete = async () => {
    if (!editingId) return;
    const confirmed = await confirmDesktopAction({
      title: t("heartbeatsview.deleteTitle"),
      message: t("heartbeatsview.deleteMessage", { name: form.displayName }),
      confirmLabel: t("triggersview.Delete"),
      cancelLabel: t("common.cancel"),
      type: "warning",
    });
    if (!confirmed) return;

    const deleted = await deleteTrigger(editingId);
    if (!deleted) return;

    if (selectedTriggerId === editingId) {
      setSelectedTriggerId(null);
    }
    closeEditor();
  };

  const onRunSelectedTrigger = async (triggerId: string) => {
    setSelectedTriggerId(triggerId);
    await runTriggerNow(triggerId);
  };

  const onToggleTriggerEnabled = async (
    triggerId: string,
    currentlyEnabled: boolean,
  ) => {
    const updated = await updateTrigger(triggerId, {
      enabled: !currentlyEnabled,
    });
    if (updated && editingId === updated.id) {
      setForm(formFromTrigger(updated));
    }
  };

  const modalTitle = editingId
    ? t("heartbeatsview.editTitle", {
        name: form.displayName.trim() || t("heartbeatsview.heartbeatSingular"),
      })
    : t("heartbeatsview.newHeartbeat");
  const editorEnabled =
    editingId != null
      ? (triggers.find((trigger) => trigger.id === editingId)?.enabled ??
        form.enabled)
      : form.enabled;
  const hasHeartbeats = triggers.length > 0;
  const showFirstRunEmptyState =
    !triggersLoading && !triggerError && !hasHeartbeats;
  const showDetailPane = Boolean(editorOpen || editingId || selectedTriggerId);
  const newHeartbeatLabel = t("heartbeatsview.newHeartbeat");

  return {
    closeEditor,
    deleteUserTemplate,
    editorEnabled,
    editingId,
    editorOpen,
    form,
    formError,
    hasHeartbeats,
    loadTriggerRuns,
    modalTitle,
    newHeartbeatLabel,
    onDelete,
    onRunSelectedTrigger,
    onSubmit,
    onToggleTriggerEnabled,
    openCreateEditor,
    openEditEditor,
    saveFormAsTemplate,
    selectedTriggerId,
    setEditingId,
    setEditorOpen,
    setField,
    setForm,
    setFormError,
    setSelectedTriggerId,
    setTemplateNotice,
    showDetailPane,
    showFirstRunEmptyState,
    t,
    templateNotice,
    triggers,
    triggerError,
    triggerRunsById,
    triggersLoading,
    triggersSaving,
    userTemplates,
  };
}

type HeartbeatsViewController = ReturnType<typeof useHeartbeatsViewController>;

const HeartbeatsViewContext = createContext<HeartbeatsViewController | null>(
  null,
);

function useHeartbeatsViewContext(): HeartbeatsViewController {
  const context = useContext(HeartbeatsViewContext);
  if (!context) {
    throw new Error("Heartbeats view context is unavailable.");
  }
  return context;
}

function HeartbeatsViewProvider({ children }: { children: ReactNode }) {
  const controller = useHeartbeatsViewController();
  return (
    <HeartbeatsViewContext.Provider value={controller}>
      {children}
    </HeartbeatsViewContext.Provider>
  );
}

function HeartbeatsLayout({ standalone }: { standalone: boolean }) {
  const {
    closeEditor,
    deleteUserTemplate,
    editorEnabled,
    editingId,
    editorOpen,
    form,
    formError,
    loadTriggerRuns,
    modalTitle,
    newHeartbeatLabel,
    onDelete,
    onRunSelectedTrigger,
    onSubmit,
    onToggleTriggerEnabled,
    openCreateEditor,
    openEditEditor,
    saveFormAsTemplate,
    selectedTriggerId,
    setEditingId,
    setEditorOpen,
    setField,
    setForm,
    setFormError,
    setSelectedTriggerId,
    setTemplateNotice,
    showDetailPane,
    showFirstRunEmptyState,
    t,
    templateNotice,
    triggers,
    triggerError,
    triggerRunsById,
    triggersLoading,
    triggersSaving,
    userTemplates,
  } = useHeartbeatsViewContext();
  const [searchQuery, setSearchQuery] = useState("");
  const searchLabel = t("heartbeatsview.searchHeartbeats", {
    defaultValue: "Search heartbeats",
  });
  const noMatchingHeartbeatsLabel = t("heartbeatsview.noMatchingHeartbeats", {
    defaultValue: "No matching heartbeats",
  });
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visibleTriggers = useMemo(() => {
    if (!normalizedSearchQuery) {
      return triggers;
    }

    return triggers.filter((trigger) => {
      const haystacks = [
        trigger.displayName,
        trigger.instructions,
        trigger.triggerType,
        trigger.cronExpression ?? "",
      ];
      return haystacks.some((value) =>
        value.toLowerCase().includes(normalizedSearchQuery),
      );
    });
  }, [normalizedSearchQuery, triggers]);

  const layout = (
    <>
      <Sidebar
        testId="heartbeats-sidebar"
        collapsible
        contentIdentity="heartbeats"
        collapseButtonTestId="heartbeats-sidebar-collapse-toggle"
        expandButtonTestId="heartbeats-sidebar-expand-toggle"
        collapseButtonAriaLabel="Collapse heartbeats"
        expandButtonAriaLabel="Expand heartbeats"
        header={
          <SidebarHeader
            search={{
              value: searchQuery,
              onChange: (event) => setSearchQuery(event.target.value),
              onClear: () => setSearchQuery(""),
              placeholder: searchLabel,
              "aria-label": searchLabel,
              autoComplete: "off",
              spellCheck: false,
            }}
          />
        }
        collapsedRailAction={
          <SidebarCollapsedActionButton
            aria-label={newHeartbeatLabel}
            onClick={() => {
              openCreateEditor();
              setSelectedTriggerId(null);
            }}
          >
            <Plus className="h-4 w-4" />
          </SidebarCollapsedActionButton>
        }
        collapsedRailItems={visibleTriggers.map((trigger) => {
          const isActive =
            trigger.id === selectedTriggerId || trigger.id === editingId;
          return (
            <SidebarContent.RailItem
              key={trigger.id}
              aria-label={trigger.displayName}
              title={trigger.displayName}
              active={isActive}
              indicatorTone={trigger.enabled ? "accent" : undefined}
              onClick={() => {
                setSelectedTriggerId(trigger.id);
                setEditorOpen(false);
                setEditingId(null);
                void loadTriggerRuns(trigger.id);
              }}
            >
              {railMonogram(trigger.displayName)}
            </SidebarContent.RailItem>
          );
        })}
        className={
          selectedTriggerId || editorOpen || editingId
            ? "hidden md:flex"
            : "flex"
        }
      >
        <SidebarScrollRegion>
          <SidebarPanel>
            <NewActionButton
              className="mb-3"
              onClick={() => {
                openCreateEditor();
                setSelectedTriggerId(null);
              }}
            >
              {newHeartbeatLabel}
            </NewActionButton>
            {triggerError && (
              <SidebarContent.Notice tone="danger" className="mb-1 text-xs">
                {triggerError}
              </SidebarContent.Notice>
            )}
            {triggersLoading && (
              <SidebarContent.Notice
                icon={
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted/30 border-t-muted/80" />
                }
              >
                {t("common.loading")}
              </SidebarContent.Notice>
            )}
            {normalizedSearchQuery &&
            visibleTriggers.length === 0 &&
            !triggersLoading ? (
              <SidebarContent.EmptyState className="px-4 py-6">
                {noMatchingHeartbeatsLabel}
              </SidebarContent.EmptyState>
            ) : (
              visibleTriggers.map((trigger) => {
                const isActive = selectedTriggerId === trigger.id;

                return (
                  <SidebarContent.Item
                    key={trigger.id}
                    onClick={() => {
                      setSelectedTriggerId(trigger.id);
                      setEditorOpen(false);
                      setEditingId(null);
                      void loadTriggerRuns(trigger.id);
                    }}
                    onDoubleClick={() => {
                      openEditEditor(trigger);
                      void loadTriggerRuns(trigger.id);
                    }}
                    active={isActive}
                    className="h-auto"
                  >
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-sm font-semibold text-txt">
                          {trigger.displayName}
                        </span>
                        <StatusBadge
                          label={
                            trigger.enabled
                              ? t("appsview.Active")
                              : t("heartbeatsview.statusPaused")
                          }
                          variant={trigger.enabled ? "success" : "muted"}
                          withDot
                        />
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted">
                        <span className="truncate">
                          {scheduleLabel(trigger, t)}
                        </span>
                        {trigger.lastStatus && (
                          <StatusBadge
                            label={localizedExecutionStatus(
                              trigger.lastStatus,
                              t,
                            )}
                            variant={toneForLastStatus(trigger.lastStatus)}
                          />
                        )}
                      </div>
                    </div>
                  </SidebarContent.Item>
                );
              })
            )}

            <div className="mt-3 border-t border-border/30 px-1 pb-1 pt-4">
              <SidebarContent.SectionHeader
                meta={userTemplates.length + BUILT_IN_TEMPLATES.length}
              >
                <SidebarContent.SectionLabel>
                  {t("heartbeatsview.Templates", { defaultValue: "Templates" })}
                </SidebarContent.SectionLabel>
              </SidebarContent.SectionHeader>
              {[...userTemplates, ...BUILT_IN_TEMPLATES].map((template) => {
                const isUserTemplate = !template.id.startsWith("__builtin_");
                const templateName = getTemplateName(template, t);
                const templateInstructions = getTemplateInstructions(
                  template,
                  t,
                );
                return (
                  <div key={template.id} className="group relative mb-1.5">
                    <SidebarContent.Item
                      variant={isUserTemplate ? "accent-soft" : "dashed"}
                      onClick={() => {
                        setForm({
                          ...emptyForm,
                          displayName: templateName,
                          instructions: templateInstructions,
                          durationValue: template.interval,
                          durationUnit: template.unit,
                        });
                        setEditorOpen(true);
                        setEditingId(null);
                        setSelectedTriggerId(null);
                        setTemplateNotice(
                          t("heartbeatsview.TemplateLoadedNotice", {
                            defaultValue:
                              'Template "{{name}}" loaded. Customize and create.',
                            name: templateName,
                          }),
                        );
                        setTimeout(() => setTemplateNotice(null), 3000);
                      }}
                    >
                      <div className="text-xs font-medium text-txt">
                        {templateName}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted/60">
                        {t("heartbeatsview.EveryIntervalUnit", {
                          defaultValue: "Every {{interval}} {{unit}}",
                          interval: template.interval,
                          unit: template.unit,
                        })}
                      </div>
                    </SidebarContent.Item>
                    {isUserTemplate && (
                      <SidebarContent.ItemAction
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteUserTemplate(template.id);
                        }}
                      >
                        ×
                      </SidebarContent.ItemAction>
                    )}
                  </div>
                );
              })}
            </div>
          </SidebarPanel>
        </SidebarScrollRegion>
      </Sidebar>

      <main
        className={`${showDetailPane ? "flex px-4 pb-4 pt-2 sm:px-6 sm:pb-6 sm:pt-3 lg:px-7 lg:pb-7 lg:pt-4" : "hidden p-0 md:flex"} chat-native-scrollbar relative flex-1 min-w-0 flex-col overflow-x-hidden overflow-y-auto bg-transparent`}
      >
        <button
          type="button"
          className="mb-3 flex items-center gap-2 rounded-2xl border border-border/30 bg-bg/25 px-4 py-3 text-base font-medium text-muted hover:text-txt md:hidden"
          onClick={() => {
            setSelectedTriggerId(null);
            setEditorOpen(false);
            setEditingId(null);
          }}
        >
          {t("heartbeatsview.BackToList", {
            defaultValue: "\u2190 Back",
          })}
        </button>
        {editorOpen || editingId ? (
          <HeartbeatForm
            form={form}
            editingId={editingId}
            editorEnabled={editorEnabled}
            modalTitle={modalTitle}
            formError={formError}
            triggersSaving={triggersSaving}
            templateNotice={templateNotice}
            triggers={triggers}
            triggerRunsById={triggerRunsById}
            t={t}
            selectedTriggerId={selectedTriggerId}
            setField={setField}
            setForm={setForm}
            setFormError={setFormError}
            closeEditor={closeEditor}
            onSubmit={onSubmit}
            onDelete={onDelete}
            onRunSelectedTrigger={onRunSelectedTrigger}
            onToggleTriggerEnabled={onToggleTriggerEnabled}
            saveFormAsTemplate={saveFormAsTemplate}
            loadTriggerRuns={loadTriggerRuns}
          />
        ) : (
          (selectedTriggerId &&
            (() => {
              const trigger = triggers.find(
                (tr) => tr.id === selectedTriggerId,
              );
              if (!trigger) return null;
              const runs = triggerRunsById[selectedTriggerId] ?? [];
              const hasLoadedRuns = Object.hasOwn(
                triggerRunsById,
                selectedTriggerId,
              );
              const successCount = runs.filter(
                (run) => toneForLastStatus(run.status) === "success",
              ).length;
              const failureCount = runs.filter(
                (run) => toneForLastStatus(run.status) === "danger",
              ).length;
              const totalRuns = runs.length;
              return (
                <div className="w-full p-4 sm:p-6 lg:p-8 xl:p-10">
                  <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-3xl space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <FieldLabel variant="kicker">
                          {t("heartbeatsview.heartbeatSingular")}
                        </FieldLabel>
                        <StatusBadge
                          label={
                            trigger.enabled
                              ? t("appsview.Active")
                              : t("heartbeatsview.statusPaused")
                          }
                          variant={trigger.enabled ? "success" : "muted"}
                          withDot
                        />
                      </div>
                      <h2 className="text-2xl font-semibold text-txt sm:text-[2rem]">
                        {trigger.displayName}
                      </h2>
                      <p className="text-sm leading-relaxed text-muted sm:text-[15px]">
                        {trigger.instructions}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className={`h-8 px-3 text-xs ${trigger.enabled ? "text-warning border-warning/30 hover:bg-warning/10" : "text-ok border-ok/30 hover:bg-ok/10"}`}
                        onClick={() =>
                          void onToggleTriggerEnabled(
                            selectedTriggerId,
                            trigger.enabled,
                          )
                        }
                      >
                        {trigger.enabled
                          ? t("heartbeatsview.pause")
                          : t("heartbeatsview.resume")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={() => openEditEditor(trigger)}
                      >
                        {t("triggersview.Edit")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={() => {
                          setForm({
                            ...formFromTrigger(trigger),
                            displayName: `${trigger.displayName} (copy)`,
                          });
                          setEditorOpen(true);
                          setEditingId(null);
                          setSelectedTriggerId(null);
                        }}
                      >
                        {t("heartbeatsview.duplicate")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={() =>
                          void onRunSelectedTrigger(selectedTriggerId)
                        }
                      >
                        {t("triggersview.RunNow")}
                      </Button>
                    </div>
                  </div>

                  <dl className="mb-8 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    <PagePanel.SummaryCard className="px-4 py-4">
                      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                        {t("heartbeatsview.schedule")}
                      </dt>
                      <dd className="mt-1 text-txt font-medium">
                        {scheduleLabel(trigger, t)}
                      </dd>
                    </PagePanel.SummaryCard>
                    <PagePanel.SummaryCard className="px-4 py-4">
                      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                        {t("triggersview.LastRun")}
                      </dt>
                      <dd className="mt-1 text-txt font-medium">
                        {formatDateTime(trigger.lastRunAtIso, {
                          fallback: t("heartbeatsview.notYetRun"),
                        })}
                      </dd>
                    </PagePanel.SummaryCard>
                    <PagePanel.SummaryCard className="px-4 py-4">
                      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                        {t("heartbeatsview.nextRun")}
                      </dt>
                      <dd className="mt-1 text-txt font-medium">
                        {formatDateTime(trigger.nextRunAtMs, {
                          fallback: t("heartbeatsview.notScheduled"),
                        })}
                      </dd>
                    </PagePanel.SummaryCard>
                    {hasLoadedRuns && totalRuns > 0 && (
                      <PagePanel.SummaryCard className="px-4 py-4">
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                          {t("heartbeatsview.runStats")}
                        </dt>
                        <dd className="mt-1 flex items-center gap-2 text-sm font-medium">
                          <span className="text-txt">
                            {t("heartbeatsview.runCountPlural", {
                              count: totalRuns,
                            })}
                          </span>
                          {successCount > 0 && (
                            <span className="text-ok">{successCount} ✓</span>
                          )}
                          {failureCount > 0 && (
                            <span className="text-danger">
                              {failureCount} ✗
                            </span>
                          )}
                        </dd>
                      </PagePanel.SummaryCard>
                    )}
                  </dl>

                  <PagePanel variant="padded" className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[12px] font-semibold uppercase tracking-wider text-muted">
                        {t("triggersview.RunHistory")}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-3 text-[11px]"
                        onClick={() => void loadTriggerRuns(selectedTriggerId)}
                      >
                        {t("common.refresh")}
                      </Button>
                    </div>

                    {!hasLoadedRuns ? (
                      <div className="py-6 text-sm text-muted/70 flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-muted/30 border-t-muted/80 rounded-full animate-spin" />
                        {t("databaseview.Loading")}
                      </div>
                    ) : runs.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted/60">
                        {t("heartbeatsview.noRunsYetMessage")}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {runs.map((run) => (
                          <div
                            key={run.triggerRunId}
                            className="border border-border/30 rounded-lg px-4 py-3 bg-bg/30"
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <StatusBadge
                                label={localizedExecutionStatus(run.status, t)}
                                variant={toneForLastStatus(run.status)}
                              />
                              <span className="text-[11px] text-muted/70 font-mono">
                                {formatDateTime(run.startedAt)}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted/80">
                              {formatDurationMs(run.latencyMs)} &middot;{" "}
                              <span className="font-mono text-muted/60 bg-bg/40 px-1 py-0.5 rounded">
                                {run.source}
                              </span>
                            </div>
                            {run.error && (
                              <div className="mt-2 text-xs text-danger/90 bg-danger/10 border border-danger/20 p-2 rounded-lg whitespace-pre-wrap font-mono">
                                {run.error}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </PagePanel>
                </div>
              );
            })()) || (
            <div className="flex min-h-0 flex-1 items-center justify-center px-8 py-10 text-center">
              <h3 className="text-lg font-semibold text-txt-strong">
                {showFirstRunEmptyState
                  ? t("heartbeatsview.createFirstHeartbeat")
                  : t("heartbeatsview.selectAHeartbeat")}
              </h3>
            </div>
          )
        )}
      </main>
    </>
  );

  if (!standalone) {
    return layout;
  }

  return (
    <section
      aria-label={t("heartbeatsview.heartbeatSingular")}
      className="relative flex h-full w-full flex-1 min-h-0 min-w-0 overflow-hidden bg-transparent"
      data-testid="heartbeats-shell"
    >
      {layout}
    </section>
  );
}

export function HeartbeatsDesktopShell() {
  return (
    <HeartbeatsViewProvider>
      <HeartbeatsLayout standalone={false} />
    </HeartbeatsViewProvider>
  );
}

export function HeartbeatsView() {
  return (
    <HeartbeatsViewProvider>
      <HeartbeatsLayout standalone />
    </HeartbeatsViewProvider>
  );
}
