import {
  Button,
  FieldLabel,
  FieldSwitch,
  FormSelect,
  FormSelectItem,
  Input,
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
  Textarea,
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
import type {
  CreateTriggerRequest,
  TriggerSummary,
  TriggerType,
  TriggerWakeMode,
  UpdateTriggerRequest,
} from "../api/client";
import { useApp } from "../state";
import { confirmDesktopAction } from "../utils";
import { formatDateTime, formatDurationMs } from "./format";

type TranslateFn = (
  key: string,
  vars?: Record<string, string | number | boolean | null | undefined>,
) => string;

const DURATION_UNITS = [
  {
    unit: "seconds",
    ms: 1000,
    labelKey: "heartbeatsview.durationUnitSeconds",
  },
  {
    unit: "minutes",
    ms: 60_000,
    labelKey: "heartbeatsview.durationUnitMinutes",
  },
  {
    unit: "hours",
    ms: 3_600_000,
    labelKey: "heartbeatsview.durationUnitHours",
  },
  {
    unit: "days",
    ms: 86_400_000,
    labelKey: "heartbeatsview.durationUnitDays",
  },
] as const;

type DurationUnit = (typeof DURATION_UNITS)[number]["unit"];

function bestFitUnit(ms: number): { value: number; unit: DurationUnit } {
  for (let i = DURATION_UNITS.length - 1; i >= 0; i -= 1) {
    const unit = DURATION_UNITS[i];
    if (ms >= unit.ms && ms % unit.ms === 0) {
      return { value: ms / unit.ms, unit: unit.unit };
    }
  }
  return { value: ms / 1000, unit: "seconds" };
}

function durationToMs(value: number, unit: DurationUnit): number {
  const found = DURATION_UNITS.find((candidate) => candidate.unit === unit);
  return value * (found?.ms ?? 1000);
}

function durationUnitLabel(unit: DurationUnit, t: TranslateFn): string {
  const found = DURATION_UNITS.find((candidate) => candidate.unit === unit);
  return found ? t(found.labelKey) : unit;
}

interface TriggerFormState {
  displayName: string;
  instructions: string;
  triggerType: TriggerType;
  wakeMode: TriggerWakeMode;
  scheduledAtIso: string;
  cronExpression: string;
  maxRuns: string;
  enabled: boolean;
  durationValue: string;
  durationUnit: DurationUnit;
}

const emptyForm: TriggerFormState = {
  displayName: "",
  instructions: "",
  triggerType: "interval",
  wakeMode: "inject_now",
  scheduledAtIso: "",
  cronExpression: "0 * * * *",
  maxRuns: "",
  enabled: true,
  durationValue: "1",
  durationUnit: "hours",
};

// ── User-saved templates (localStorage) ─────────────────────────────

interface HeartbeatTemplate {
  id: string;
  name: string;
  instructions: string;
  interval: string;
  unit: DurationUnit;
  nameKey?: string;
  instructionsKey?: string;
}

const TEMPLATES_STORAGE_KEY = "milady:heartbeat-templates";

function railMonogram(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  return (initials || label.slice(0, 1).toUpperCase() || "?").slice(0, 2);
}

const BUILT_IN_TEMPLATES: HeartbeatTemplate[] = [
  {
    id: "__builtin_crypto",
    name: "Check crypto prices",
    nameKey: "heartbeatsview.template.crypto.name",
    instructions:
      "Check the current prices of BTC, ETH, and SOL. Summarize any significant moves in the last hour.",
    instructionsKey: "heartbeatsview.template.crypto.instructions",
    interval: "30",
    unit: "minutes",
  },
  {
    id: "__builtin_journal",
    name: "Daily journal prompt",
    nameKey: "heartbeatsview.template.journal.name",
    instructions:
      "Write a brief, thoughtful journal prompt for the user based on current events or seasonal themes. Keep it under 2 sentences.",
    instructionsKey: "heartbeatsview.template.journal.instructions",
    interval: "24",
    unit: "hours",
  },
  {
    id: "__builtin_trending",
    name: "Trending topics digest",
    nameKey: "heartbeatsview.template.trending.name",
    instructions:
      "Scan for trending topics on crypto Twitter and tech news. Give a 3-bullet summary of what's worth paying attention to.",
    instructionsKey: "heartbeatsview.template.trending.instructions",
    interval: "4",
    unit: "hours",
  },
];

function isValidTemplate(v: unknown): v is HeartbeatTemplate {
  if (typeof v !== "object" || v == null) return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.name === "string" &&
    typeof t.instructions === "string" &&
    typeof t.interval === "string" &&
    typeof t.unit === "string"
  );
}

function loadUserTemplates(): HeartbeatTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidTemplate);
  } catch {
    return [];
  }
}

function saveUserTemplates(templates: HeartbeatTemplate[]): void {
  try {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // localStorage full or unavailable
  }
}

function getTemplateName(
  template: HeartbeatTemplate,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return template.nameKey
    ? t(template.nameKey, { defaultValue: template.name })
    : template.name;
}

function getTemplateInstructions(
  template: HeartbeatTemplate,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return template.instructionsKey
    ? t(template.instructionsKey, { defaultValue: template.instructions })
    : template.instructions;
}

function parsePositiveInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function scheduleLabel(trigger: TriggerSummary, t: TranslateFn): string {
  if (trigger.triggerType === "interval") {
    return `${t("heartbeatsview.every")} ${formatDurationMs(trigger.intervalMs)}`;
  }
  if (trigger.triggerType === "once") {
    return trigger.scheduledAtIso
      ? t("heartbeatsview.onceAt", {
          time: formatDateTime(trigger.scheduledAtIso),
        })
      : t("heartbeatsview.once");
  }
  if (trigger.triggerType === "cron") {
    return `${t("heartbeatsview.cronPrefix")} ${trigger.cronExpression ?? "—"}`;
  }
  return trigger.triggerType;
}

function formFromTrigger(trigger: TriggerSummary): TriggerFormState {
  const intervalMs = trigger.intervalMs ?? 3_600_000;
  const { value, unit } = bestFitUnit(intervalMs);
  return {
    displayName: trigger.displayName,
    instructions: trigger.instructions,
    triggerType: trigger.triggerType,
    wakeMode: trigger.wakeMode,
    scheduledAtIso: trigger.scheduledAtIso ?? "",
    cronExpression: trigger.cronExpression ?? "0 * * * *",
    maxRuns: trigger.maxRuns ? String(trigger.maxRuns) : "",
    enabled: trigger.enabled,
    durationValue: String(value),
    durationUnit: unit,
  };
}

function buildCreateRequest(form: TriggerFormState): CreateTriggerRequest {
  const maxRuns = parsePositiveInteger(form.maxRuns);
  return {
    displayName: form.displayName.trim(),
    instructions: form.instructions.trim(),
    triggerType: form.triggerType,
    wakeMode: form.wakeMode,
    enabled: form.enabled,
    intervalMs:
      form.triggerType === "interval"
        ? durationToMs(Number(form.durationValue) || 1, form.durationUnit)
        : undefined,
    scheduledAtIso:
      form.triggerType === "once" ? form.scheduledAtIso.trim() : undefined,
    cronExpression:
      form.triggerType === "cron" ? form.cronExpression.trim() : undefined,
    maxRuns,
  };
}

function buildUpdateRequest(form: TriggerFormState): UpdateTriggerRequest {
  return { ...buildCreateRequest(form) };
}

function validateForm(form: TriggerFormState, t: TranslateFn): string | null {
  if (!form.displayName.trim()) {
    return t("heartbeatsview.validationDisplayNameRequired");
  }
  if (!form.instructions.trim()) {
    return t("heartbeatsview.validationInstructionsRequired");
  }
  if (form.triggerType === "interval") {
    const value = Number(form.durationValue);
    if (!Number.isFinite(value) || value <= 0) {
      return t("heartbeatsview.validationIntervalPositive");
    }
  }
  if (form.triggerType === "once") {
    const raw = form.scheduledAtIso.trim();
    if (!raw) return t("heartbeatsview.validationScheduledTimeRequired");
    if (!Number.isFinite(Date.parse(raw))) {
      return t("heartbeatsview.validationScheduledTimeInvalid");
    }
  }
  if (form.triggerType === "cron") {
    const cronTrimmed = form.cronExpression.trim();
    if (!cronTrimmed) return t("heartbeatsview.validationCronRequired");
    const cronParts = cronTrimmed.split(/\s+/);
    if (cronParts.length !== 5) {
      return t("heartbeatsview.validationCronFiveFields");
    }
    const ranges = [
      { name: t("heartbeatsview.cronFieldMinute") },
      { name: t("heartbeatsview.cronFieldHour") },
      { name: t("heartbeatsview.cronFieldDay") },
      { name: t("heartbeatsview.cronFieldMonth") },
      { name: t("heartbeatsview.cronFieldWeekday") },
    ];
    for (let index = 0; index < 5; index += 1) {
      if (!/^[\d,\-*/]+$/.test(cronParts[index])) {
        return t("heartbeatsview.validationCronInvalidField", {
          field: ranges[index]?.name ?? "",
          value: cronParts[index] ?? "",
        });
      }
    }
  }
  if (form.maxRuns.trim() && !parsePositiveInteger(form.maxRuns)) {
    return t("heartbeatsview.validationMaxRunsPositive");
  }
  return null;
}

function toneForLastStatus(
  status?: string,
): "success" | "warning" | "danger" | "muted" {
  if (!status) return "muted";
  if (status === "success" || status === "completed") return "success";
  if (status === "skipped" || status === "queued") return "warning";
  if (status === "error" || status === "failed") return "danger";
  return "muted";
}

function localizedExecutionStatus(status: string, t: TranslateFn): string {
  switch (status) {
    case "success":
      // Trigger "success" currently means the instruction was queued into the
      // autonomy room, not that the autonomous action already completed.
      return t("heartbeatsview.statusQueued");
    case "completed":
      return t("trajectoriesview.Completed");
    case "skipped":
      return t("heartbeatsview.statusSkipped");
    case "queued":
      return t("heartbeatsview.statusQueued");
    case "error":
      return t("logsview.Error");
    case "failed":
      return t("heartbeatsview.statusFailed");
    default:
      return status;
  }
}

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
            defaultValue: "← Back",
          })}
        </button>
        {editorOpen || editingId ? (
          <div className="w-full px-4 pb-8 pt-0 sm:px-5 sm:pb-8 sm:pt-1 lg:px-7 lg:pb-8 lg:pt-1 xl:px-8">
            {templateNotice && (
              <PagePanel.Notice
                tone="accent"
                className="mb-4 animate-[fadeIn_0.2s_ease] text-xs font-medium"
              >
                {templateNotice}
              </PagePanel.Notice>
            )}
            <div className="mb-3 flex flex-col justify-between gap-2 lg:flex-row lg:items-start">
              <div className="max-w-3xl space-y-1">
                <FieldLabel variant="kicker">
                  {editingId
                    ? t("heartbeatsview.editHeartbeat")
                    : t("heartbeatsview.createHeartbeat")}
                </FieldLabel>
                <h2 className="text-2xl font-semibold text-txt">
                  {modalTitle}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {editingId && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 text-xs"
                      disabled={triggersSaving}
                      onClick={() => void onRunSelectedTrigger(editingId)}
                    >
                      {t("triggersview.RunNow")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 text-xs"
                      onClick={() =>
                        void onToggleTriggerEnabled(editingId, editorEnabled)
                      }
                    >
                      {editorEnabled
                        ? t("heartbeatsview.disable")
                        : t("heartbeatsview.enable")}
                    </Button>
                    <div className="w-px h-6 bg-border/50 mx-1 hidden sm:block" />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 text-xs text-danger hover:border-danger hover:bg-danger/10 hover:text-danger"
                      onClick={() => void onDelete()}
                    >
                      {t("triggersview.Delete")}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-6">
              {formError && (
                <PagePanel.Notice tone="danger" className="text-sm">
                  {formError}
                </PagePanel.Notice>
              )}

              <PagePanel
                variant="padded"
                className="grid gap-5"
                data-testid="heartbeats-editor-panel"
              >
                <div>
                  <FieldLabel variant="form">{t("wallet.name")}</FieldLabel>
                  <Input
                    variant="form"
                    value={form.displayName}
                    onChange={(event) =>
                      setField("displayName", event.target.value)
                    }
                    placeholder={t("triggersview.eGDailyDigestH")}
                  />
                </div>

                <div>
                  <FieldLabel variant="form">
                    {t("triggersview.Instructions")}
                  </FieldLabel>
                  <Textarea
                    variant="form"
                    value={form.instructions}
                    onChange={(event) =>
                      setField("instructions", event.target.value)
                    }
                    placeholder={t("triggersview.WhatShouldTheAgen")}
                  />
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div>
                    <FieldLabel variant="form">
                      {t("triggersview.ScheduleType")}
                    </FieldLabel>
                    <FormSelect
                      value={form.triggerType}
                      onValueChange={(value) =>
                        setField("triggerType", value as TriggerType)
                      }
                      placeholder={t("triggersview.RepeatingInterval")}
                    >
                      <FormSelectItem value="interval">
                        {t("triggersview.RepeatingInterval")}
                      </FormSelectItem>
                      <FormSelectItem value="once">
                        {t("triggersview.OneTime")}
                      </FormSelectItem>
                      <FormSelectItem value="cron">
                        {t("triggersview.CronSchedule")}
                      </FormSelectItem>
                    </FormSelect>
                  </div>

                  <div>
                    <FieldLabel variant="form">
                      {t("triggersview.WakeMode")}
                    </FieldLabel>
                    <FormSelect
                      value={form.wakeMode}
                      onValueChange={(value) =>
                        setField("wakeMode", value as TriggerWakeMode)
                      }
                      placeholder={t("triggersview.InjectAmpWakeIm")}
                    >
                      <FormSelectItem value="inject_now">
                        {t("triggersview.InjectAmpWakeIm")}
                      </FormSelectItem>
                      <FormSelectItem value="next_autonomy_cycle">
                        {t("triggersview.QueueForNextCycle")}
                      </FormSelectItem>
                    </FormSelect>
                  </div>
                </div>

                {form.triggerType === "interval" && (
                  <div>
                    <FieldLabel variant="form">
                      {t("heartbeatsview.interval")}
                    </FieldLabel>
                    <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
                      <Input
                        type="number"
                        min="1"
                        variant="form"
                        value={form.durationValue}
                        onChange={(event) =>
                          setField("durationValue", event.target.value)
                        }
                        placeholder="1"
                      />
                      <FormSelect
                        value={form.durationUnit}
                        onValueChange={(value) =>
                          setField("durationUnit", value as DurationUnit)
                        }
                        placeholder={durationUnitLabel(form.durationUnit, t)}
                      >
                        {DURATION_UNITS.map((unit) => (
                          <FormSelectItem key={unit.unit} value={unit.unit}>
                            {durationUnitLabel(unit.unit, t)}
                          </FormSelectItem>
                        ))}
                      </FormSelect>
                    </div>
                  </div>
                )}

                {form.triggerType === "once" && (
                  <div>
                    <FieldLabel variant="form">
                      {t("triggersview.ScheduledTimeISO")}
                    </FieldLabel>
                    <Input
                      type="datetime-local"
                      variant="form"
                      value={form.scheduledAtIso}
                      onChange={(event) =>
                        setField("scheduledAtIso", event.target.value)
                      }
                    />
                  </div>
                )}

                {form.triggerType === "cron" && (
                  <div>
                    <FieldLabel variant="form">
                      {t("triggersview.CronExpression5F")}
                    </FieldLabel>
                    <Input
                      variant="form"
                      className="font-mono"
                      value={form.cronExpression}
                      onChange={(event) =>
                        setField("cronExpression", event.target.value)
                      }
                      placeholder="*/15 * * * *"
                    />
                    <div className="mt-2 text-[11px] text-muted">
                      {t("triggersview.minuteHourDayMont")}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div>
                    <FieldLabel variant="form">
                      {t("triggersview.MaxRunsOptional")}
                    </FieldLabel>
                    <Input
                      variant="form"
                      value={form.maxRuns}
                      onChange={(event) =>
                        setField("maxRuns", event.target.value)
                      }
                      placeholder="∞"
                    />
                  </div>

                  <div className="flex items-end">
                    <FieldSwitch
                      checked={form.enabled}
                      aria-label={t("triggersview.StartEnabled")}
                      className="flex-1"
                      label={t("triggersview.StartEnabled")}
                      onCheckedChange={(checked) =>
                        setField("enabled", checked)
                      }
                    />
                  </div>
                </div>
              </PagePanel>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {form.displayName.trim() && (
                  <button
                    type="button"
                    className="text-xs font-medium text-muted transition-colors hover:text-accent underline-offset-2 hover:underline"
                    onClick={saveFormAsTemplate}
                  >
                    {t("heartbeatsview.SaveAsTemplate", {
                      defaultValue: "Save as template",
                    })}
                  </button>
                )}

                <div className="flex flex-wrap items-center gap-2.5">
                  <Button
                    variant="default"
                    size="sm"
                    className="h-10 px-6 text-sm text-white shadow-sm hover:text-white dark:text-white dark:hover:text-white"
                    disabled={triggersSaving}
                    onClick={() => void onSubmit()}
                  >
                    {triggersSaving
                      ? t("apikeyconfig.saving")
                      : editingId
                        ? t("heartbeatsview.saveChanges")
                        : t("heartbeatsview.createHeartbeat")}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 px-6 text-sm"
                    onClick={() => {
                      if (editingId && selectedTriggerId === editingId) {
                        const trigger = triggers.find(
                          (trigger) => trigger.id === editingId,
                        );
                        if (trigger) {
                          setForm(formFromTrigger(trigger));
                          setFormError(null);
                        }
                      } else {
                        closeEditor();
                      }
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>

              {editingId && (
                <div className="mt-10 grid gap-8 border-t border-border/40 pt-8">
                  <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <PagePanel.SummaryCard className="px-4 py-4">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        {t("heartbeatsview.maxRuns")}
                      </dt>
                      <dd className="mt-1.5 text-txt font-medium">
                        {(() => {
                          const trigger = triggers.find(
                            (trigger) => trigger.id === editingId,
                          );
                          return trigger?.maxRuns
                            ? trigger.maxRuns
                            : t("heartbeatsview.unlimited");
                        })()}
                      </dd>
                    </PagePanel.SummaryCard>
                    <PagePanel.SummaryCard className="px-4 py-4">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        {t("triggersview.LastRun")}
                      </dt>
                      <dd className="mt-1.5 text-txt font-medium">
                        {(() => {
                          const trigger = triggers.find(
                            (trigger) => trigger.id === editingId,
                          );
                          return formatDateTime(trigger?.lastRunAtIso, {
                            fallback: t("heartbeatsview.notYetRun"),
                          });
                        })()}
                      </dd>
                    </PagePanel.SummaryCard>
                    <PagePanel.SummaryCard className="px-4 py-4">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        {t("heartbeatsview.nextRun")}
                      </dt>
                      <dd className="mt-1.5 text-txt font-medium">
                        {(() => {
                          const trigger = triggers.find(
                            (trigger) => trigger.id === editingId,
                          );
                          return formatDateTime(trigger?.nextRunAtMs, {
                            fallback: t("heartbeatsview.notScheduled"),
                          });
                        })()}
                      </dd>
                    </PagePanel.SummaryCard>
                  </dl>

                  <PagePanel variant="padded" className="space-y-4">
                    <div className="flex items-center justify-between gap-3 border-b border-border/30 pb-3">
                      <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
                        {t("triggersview.RunHistory")}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-3 text-[11px]"
                        onClick={() => void loadTriggerRuns(editingId)}
                      >
                        {t("common.refresh")}
                      </Button>
                    </div>

                    {(() => {
                      const hasLoadedRuns = Object.hasOwn(
                        triggerRunsById,
                        editingId,
                      );
                      const runs = triggerRunsById[editingId] ?? [];

                      if (!hasLoadedRuns) {
                        return (
                          <div className="py-6 text-sm text-muted/70 flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-muted/30 border-t-muted/80 rounded-full animate-spin" />{" "}
                            {t("databaseview.Loading")}
                          </div>
                        );
                      }
                      if (runs.length === 0) {
                        return (
                          <div className="py-6 text-sm text-muted/70 italic">
                            {t("triggersview.NoRunsRecordedYet")}
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-3">
                          {runs
                            .slice()
                            .reverse()
                            .map((run) => (
                              <div
                                key={run.triggerRunId}
                                className="rounded-xl bg-bg/30 border border-border/20 px-4 py-3 text-sm transition-colors hover:bg-bg/50"
                              >
                                <div className="flex items-start gap-3">
                                  <StatusDot
                                    status={run.status}
                                    className="mt-1 flex-shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                                      <span className="font-medium text-txt">
                                        {localizedExecutionStatus(
                                          run.status,
                                          t,
                                        )}
                                      </span>
                                      <span className="text-xs text-muted">
                                        {formatDateTime(run.finishedAt, {
                                          fallback: t("heartbeatsview.emDash"),
                                        })}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-muted/80">
                                      {formatDurationMs(run.latencyMs)} &middot;{" "}
                                      <span className="font-mono text-muted/60 bg-bg/40 px-1 py-0.5 rounded">
                                        {run.source}
                                      </span>
                                    </div>
                                    {run.error && (
                                      <div className="mt-2.5 text-xs text-danger/90 bg-danger/10 border border-danger/20 p-2.5 rounded-lg whitespace-pre-wrap font-mono leading-relaxed">
                                        {run.error}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      );
                    })()}
                  </PagePanel>
                </div>
              )}
            </div>
          </div>
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
