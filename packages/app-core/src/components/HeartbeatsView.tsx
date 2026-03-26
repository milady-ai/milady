import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  StatusDot,
  Switch,
  Textarea,
} from "@miladyai/ui";
import { Clock3, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
  CreateTriggerRequest,
  TriggerSummary,
  TriggerType,
  TriggerWakeMode,
  UpdateTriggerRequest,
} from "../api/client";
import { useApp } from "../state";
import { confirmDesktopAction } from "../utils";
import {
  DESKTOP_PADDED_SURFACE_PANEL_CLASSNAME,
  DESKTOP_RAIL_SUMMARY_CARD_CLASSNAME,
  DesktopEmptyStatePanel,
  DesktopPageFrame,
} from "./desktop-surface-primitives";
import { formatDateTime, formatDurationMs } from "./format";
import {
  APP_PANEL_SHELL_CLASSNAME,
  APP_SIDEBAR_CARD_ACTIVE_CLASSNAME,
  APP_SIDEBAR_CARD_BASE_CLASSNAME,
  APP_SIDEBAR_CARD_INACTIVE_CLASSNAME,
  APP_SIDEBAR_KICKER_CLASSNAME,
  APP_SIDEBAR_META_CLASSNAME,
  APP_SIDEBAR_RAIL_CLASSNAME,
  APP_SIDEBAR_STICKY_HEADER_CLASSNAME,
} from "./sidebar-shell-styles";

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

const FIELD_LABEL_CLASS =
  "mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted/80";
const INPUT_CLASS =
  "h-11 w-full rounded-2xl border border-border/60 bg-bg/70 px-4 py-2 text-sm shadow-sm transition-[border-color,box-shadow,background-color] focus-visible:ring-1 focus-visible:ring-accent";
const SELECT_CLASS =
  "h-11 w-full rounded-2xl border border-border/60 bg-bg/70 px-4 py-2 text-sm outline-none transition-[border-color,box-shadow,background-color] focus:border-accent";
const TEXTAREA_CLASS =
  "min-h-[132px] w-full resize-y rounded-2xl border border-border/60 bg-bg/70 px-4 py-3 text-sm outline-none transition-[border-color,box-shadow,background-color] focus:border-accent";
const SIDEBAR_SECTION_LABEL_CLASS = APP_SIDEBAR_KICKER_CLASSNAME;
const SIDEBAR_CARD_BASE_CLASS = APP_SIDEBAR_CARD_BASE_CLASSNAME;
const HEARTBEAT_SIDEBAR_CARD_ACTIVE_CLASS = APP_SIDEBAR_CARD_ACTIVE_CLASSNAME;
const HEARTBEAT_SIDEBAR_CARD_INACTIVE_CLASS =
  APP_SIDEBAR_CARD_INACTIVE_CLASSNAME;
const HEARTBEATS_SHELL_CLASS = APP_PANEL_SHELL_CLASSNAME;
const HEARTBEATS_CONTENT_WIDTH_CLASS = "mx-auto w-full max-w-[80rem]";
const HEARTBEATS_PANEL_CLASS = DESKTOP_PADDED_SURFACE_PANEL_CLASSNAME;
const HEARTBEATS_STAT_CARD_CLASS = `${DESKTOP_RAIL_SUMMARY_CARD_CLASSNAME} px-4 py-4`;
const HEARTBEATS_SECTION_KICKER_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.16em] text-muted";

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
}

const TEMPLATES_STORAGE_KEY = "milady:heartbeat-templates";

const BUILT_IN_TEMPLATES: HeartbeatTemplate[] = [
  {
    id: "__builtin_crypto",
    name: "Check crypto prices",
    instructions:
      "Check the current prices of BTC, ETH, and SOL. Summarize any significant moves in the last hour.",
    interval: "30",
    unit: "minutes",
  },
  {
    id: "__builtin_journal",
    name: "Daily journal prompt",
    instructions:
      "Write a brief, thoughtful journal prompt for the user based on current events or seasonal themes. Keep it under 2 sentences.",
    interval: "24",
    unit: "hours",
  },
  {
    id: "__builtin_trending",
    name: "Trending topics digest",
    instructions:
      "Scan for trending topics on crypto Twitter and tech news. Give a 3-bullet summary of what's worth paying attention to.",
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
      return t("heartbeatsview.statusSuccess");
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

export function HeartbeatsView() {
  const {
    triggers = [],
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
    void loadTriggerHealth();
    void loadTriggers();
  }, [loadTriggerHealth, loadTriggers]);

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

  return (
    <DesktopPageFrame>
      <div className={HEARTBEATS_SHELL_CLASS} data-testid="heartbeats-shell">
        {/* Sidebar — full-width on mobile when no detail is shown, fixed-width on md+ */}
        <aside
          className={`${selectedTriggerId || editorOpen || editingId ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col overflow-y-auto md:w-[21rem] md:max-w-[352px] lg:w-[23rem] ${APP_SIDEBAR_RAIL_CLASSNAME}`}
        >
          <div className={APP_SIDEBAR_STICKY_HEADER_CLASSNAME}>
            <div className="mb-3 flex items-end justify-between gap-3 px-1">
              <div className="space-y-1">
                <div className={SIDEBAR_SECTION_LABEL_CLASS}>Heartbeats</div>
                <div className={APP_SIDEBAR_META_CLASSNAME}>
                  {t("heartbeatsview.newHeartbeat")}
                </div>
              </div>
              <StatusBadge
                label={
                  triggersLoading
                    ? t("common.loading")
                    : String(triggers.length)
                }
                tone={triggersLoading ? "warning" : "muted"}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-11 w-full justify-start rounded-xl border border-accent/20 bg-accent/5 px-4 text-sm font-medium text-txt shadow-sm hover:border-accent/35 hover:bg-accent/10"
              onClick={() => {
                openCreateEditor();
                setSelectedTriggerId(null);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("heartbeatsview.newHeartbeat")}
            </Button>
          </div>

          <div className="custom-scrollbar flex-1 overflow-y-auto px-3 pb-4 pr-4 pt-4">
            {triggerError && (
              <div className="mb-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {triggerError}
              </div>
            )}
            {triggersLoading && (
              <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-bg/35 px-3 py-3 text-sm text-muted">
                <div className="h-4 w-4 rounded-full border-2 border-muted/30 border-t-muted/80 animate-spin" />
                {t("common.loading")}
              </div>
            )}
            {!triggersLoading && triggers.length === 0 && (
              <DesktopEmptyStatePanel
                className="min-h-[11rem] px-4 py-6"
                description={t("heartbeatsview.emptyStateDescription")}
                title="No heartbeats yet"
              />
            )}
            {triggers.map((trigger) => {
              const isActive = selectedTriggerId === trigger.id;

              return (
                <Button
                  key={trigger.id}
                  variant="ghost"
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
                  className={`${SIDEBAR_CARD_BASE_CLASS} h-auto ${
                    isActive
                      ? HEARTBEAT_SIDEBAR_CARD_ACTIVE_CLASS
                      : HEARTBEAT_SIDEBAR_CARD_INACTIVE_CLASS
                  }`}
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
                        tone={trigger.enabled ? "success" : "muted"}
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
                          tone={toneForLastStatus(trigger.lastStatus)}
                        />
                      )}
                    </div>
                  </div>
                </Button>
              );
            })}

            {/* Templates */}
            <div className="mt-3 border-t border-border/30 px-1 pb-1 pt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className={SIDEBAR_SECTION_LABEL_CLASS}>Templates</div>
                <span className="text-[10px] text-muted/50">
                  {userTemplates.length + BUILT_IN_TEMPLATES.length}
                </span>
              </div>
              {[...userTemplates, ...BUILT_IN_TEMPLATES].map((template) => {
                const isUserTemplate = !template.id.startsWith("__builtin_");
                return (
                  <div key={template.id} className="relative mb-1.5 group">
                    <button
                      type="button"
                      className={`${SIDEBAR_CARD_BASE_CLASS} ${
                        isUserTemplate
                          ? "border-accent/20 bg-accent/5 hover:border-accent/30 hover:bg-accent/10"
                          : "border-dashed border-border/40 hover:border-border hover:bg-bg-hover"
                      }`}
                      onClick={() => {
                        setForm({
                          ...emptyForm,
                          displayName: template.name,
                          instructions: template.instructions,
                          durationValue: template.interval,
                          durationUnit: template.unit,
                        });
                        setEditorOpen(true);
                        setEditingId(null);
                        setSelectedTriggerId(null);
                        setTemplateNotice(
                          `Template "${template.name}" loaded — customize and create.`,
                        );
                        setTimeout(() => setTemplateNotice(null), 3000);
                      }}
                    >
                      <div className="text-xs font-medium text-txt">
                        {template.name}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted/60">
                        Every {template.interval} {template.unit}
                      </div>
                    </button>
                    {isUserTemplate && (
                      <button
                        type="button"
                        className="absolute right-1.5 top-1.5 rounded bg-bg/80 px-1.5 py-0.5 text-[10px] text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteUserTemplate(template.id);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main Content Area — hidden on mobile when sidebar is showing */}
        <main
          className={`${selectedTriggerId || editorOpen || editingId ? "flex" : "hidden md:flex"} relative flex-1 min-w-0 flex-col overflow-y-auto bg-bg/10 px-4 pb-4 pt-2 sm:px-6 sm:pb-6 sm:pt-3 lg:px-7 lg:pb-7 lg:pt-4 custom-scrollbar`}
        >
          {/* Mobile back button */}
          <button
            type="button"
            className="mb-3 flex items-center gap-2 rounded-2xl border border-border/30 bg-bg/25 px-4 py-3 text-base font-medium text-muted hover:text-txt md:hidden"
            onClick={() => {
              setSelectedTriggerId(null);
              setEditorOpen(false);
              setEditingId(null);
            }}
          >
            ← Back
          </button>
          {editorOpen || editingId ? (
            <div
              className={`${HEARTBEATS_CONTENT_WIDTH_CLASS} px-4 pb-8 pt-0 sm:px-5 sm:pb-8 sm:pt-1 lg:px-7 lg:pb-8 lg:pt-1 xl:px-8`}
            >
              {templateNotice && (
                <div className="mb-4 px-4 py-2.5 rounded-lg border border-accent/30 bg-accent/5 text-xs text-accent font-medium animate-[fadeIn_0.2s_ease]">
                  {templateNotice}
                </div>
              )}
              <div className="mb-3 flex flex-col justify-between gap-2 lg:flex-row lg:items-start">
                <div className="max-w-3xl space-y-1">
                  <div className={HEARTBEATS_SECTION_KICKER_CLASS}>
                    {editingId
                      ? t("heartbeatsview.editHeartbeat")
                      : t("heartbeatsview.createHeartbeat")}
                  </div>
                  <h2 className="text-2xl font-semibold text-txt">
                    {modalTitle}
                  </h2>
                  <p className="max-w-2xl text-sm leading-relaxed text-muted">
                    {editingId
                      ? t("heartbeatsview.emptyStateDescription")
                      : t("heartbeatsview.emptyStateDescription")}
                  </p>
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
                  <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger shadow-sm">
                    {formError}
                  </div>
                )}

                <div
                  className={`${HEARTBEATS_PANEL_CLASS} grid gap-5`}
                  data-testid="heartbeats-editor-panel"
                >
                  <div>
                    <span className={FIELD_LABEL_CLASS}>
                      {t("wallet.name")}
                    </span>
                    <Input
                      className={INPUT_CLASS}
                      value={form.displayName}
                      onChange={(event) =>
                        setField("displayName", event.target.value)
                      }
                      placeholder={t("triggersview.eGDailyDigestH")}
                    />
                  </div>

                  <div>
                    <span className={FIELD_LABEL_CLASS}>
                      {t("triggersview.Instructions")}
                    </span>
                    <Textarea
                      className={TEXTAREA_CLASS}
                      value={form.instructions}
                      onChange={(event) =>
                        setField("instructions", event.target.value)
                      }
                      placeholder={t("triggersview.WhatShouldTheAgen")}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div>
                      <span className={FIELD_LABEL_CLASS}>
                        {t("triggersview.ScheduleType")}
                      </span>
                      <Select
                        value={form.triggerType}
                        onValueChange={(value) =>
                          setField("triggerType", value as TriggerType)
                        }
                      >
                        <SelectTrigger className={SELECT_CLASS}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="interval">
                            {t("triggersview.RepeatingInterval")}
                          </SelectItem>
                          <SelectItem value="once">
                            {t("triggersview.OneTime")}
                          </SelectItem>
                          <SelectItem value="cron">
                            {t("triggersview.CronSchedule")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <span className={FIELD_LABEL_CLASS}>
                        {t("triggersview.WakeMode")}
                      </span>
                      <Select
                        value={form.wakeMode}
                        onValueChange={(value) =>
                          setField("wakeMode", value as TriggerWakeMode)
                        }
                      >
                        <SelectTrigger className={SELECT_CLASS}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inject_now">
                            {t("triggersview.InjectAmpWakeIm")}
                          </SelectItem>
                          <SelectItem value="next_autonomy_cycle">
                            {t("triggersview.QueueForNextCycle")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {form.triggerType === "interval" && (
                    <div>
                      <span className={FIELD_LABEL_CLASS}>
                        {t("heartbeatsview.interval")}
                      </span>
                      <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
                        <Input
                          type="number"
                          min="1"
                          className={INPUT_CLASS}
                          value={form.durationValue}
                          onChange={(event) =>
                            setField("durationValue", event.target.value)
                          }
                          placeholder="1"
                        />
                        <Select
                          value={form.durationUnit}
                          onValueChange={(value) =>
                            setField("durationUnit", value as DurationUnit)
                          }
                        >
                          <SelectTrigger className={SELECT_CLASS}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DURATION_UNITS.map((unit) => (
                              <SelectItem key={unit.unit} value={unit.unit}>
                                {durationUnitLabel(unit.unit, t)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {form.triggerType === "once" && (
                    <div>
                      <span className={FIELD_LABEL_CLASS}>
                        {t("triggersview.ScheduledTimeISO")}
                      </span>
                      <Input
                        type="datetime-local"
                        className={INPUT_CLASS}
                        value={form.scheduledAtIso}
                        onChange={(event) =>
                          setField("scheduledAtIso", event.target.value)
                        }
                      />
                    </div>
                  )}

                  {form.triggerType === "cron" && (
                    <div>
                      <span className={FIELD_LABEL_CLASS}>
                        {t("triggersview.CronExpression5F")}
                      </span>
                      <Input
                        className={`${INPUT_CLASS} font-mono`}
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
                      <span className={FIELD_LABEL_CLASS}>
                        {t("triggersview.MaxRunsOptional")}
                      </span>
                      <Input
                        className={INPUT_CLASS}
                        value={form.maxRuns}
                        onChange={(event) =>
                          setField("maxRuns", event.target.value)
                        }
                        placeholder="∞"
                      />
                    </div>

                    <div className="flex items-end">
                      {/* biome-ignore lint/a11y/noLabelWithoutControl: form control is associated programmatically */}
                      <label className="inline-flex cursor-pointer select-none flex-1 items-center gap-3 rounded-xl bg-bg/50 px-4 py-2 border border-border/50 hover:border-accent/50 text-sm text-txt transition-colors h-10">
                        <Switch
                          checked={form.enabled}
                          onCheckedChange={(checked) =>
                            setField("enabled", !!checked)
                          }
                        />
                        {t("triggersview.StartEnabled")}
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {form.displayName.trim() && (
                    <button
                      type="button"
                      className="text-xs font-medium text-muted transition-colors hover:text-accent underline-offset-2 hover:underline"
                      onClick={saveFormAsTemplate}
                    >
                      Save as template
                    </button>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5">
                    <Button
                      variant="default"
                      size="sm"
                      className="h-10 px-6 text-sm shadow-sm"
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
                            (t) => t.id === editingId,
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
                      {editingId ? t("common.cancel") : t("common.cancel")}
                    </Button>
                  </div>
                </div>

                {/* Detailed run info and metadata when editing */}
                {editingId && (
                  <div className="mt-10 grid gap-8 border-t border-border/40 pt-8">
                    <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <div className={HEARTBEATS_STAT_CARD_CLASS}>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                          {t("heartbeatsview.maxRuns")}
                        </dt>
                        <dd className="mt-1.5 text-txt font-medium">
                          {(() => {
                            const trigger = triggers.find(
                              (t) => t.id === editingId,
                            );
                            return trigger?.maxRuns
                              ? trigger.maxRuns
                              : t("heartbeatsview.unlimited");
                          })()}
                        </dd>
                      </div>
                      <div className={HEARTBEATS_STAT_CARD_CLASS}>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                          {t("triggersview.LastRun")}
                        </dt>
                        <dd className="mt-1.5 text-txt font-medium">
                          {(() => {
                            const trigger = triggers.find(
                              (t) => t.id === editingId,
                            );
                            return formatDateTime(trigger?.lastRunAtIso, {
                              fallback: t("heartbeatsview.notYetRun"),
                            });
                          })()}
                        </dd>
                      </div>
                      <div className={HEARTBEATS_STAT_CARD_CLASS}>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                          {t("heartbeatsview.nextRun")}
                        </dt>
                        <dd className="mt-1.5 text-txt font-medium">
                          {(() => {
                            const trigger = triggers.find(
                              (t) => t.id === editingId,
                            );
                            return formatDateTime(trigger?.nextRunAtMs, {
                              fallback: t("heartbeatsview.notScheduled"),
                            });
                          })()}
                        </dd>
                      </div>
                    </dl>

                    <div className={`${HEARTBEATS_PANEL_CLASS} space-y-4`}>
                      <div className="flex items-center justify-between gap-3 border-b border-border/30 pb-3">
                        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
                          {t("triggersview.RunHistory")}
                        </h3>
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
                                            fallback: t(
                                              "heartbeatsview.emDash",
                                            ),
                                          })}
                                        </span>
                                      </div>
                                      <div className="text-[11px] text-muted/80">
                                        {formatDurationMs(run.latencyMs)}{" "}
                                        &middot;{" "}
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
                    </div>
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
                  (r) => toneForLastStatus(r.status) === "success",
                ).length;
                const failureCount = runs.filter(
                  (r) => toneForLastStatus(r.status) === "danger",
                ).length;
                const totalRuns = runs.length;
                return (
                  <div
                    className={`${HEARTBEATS_CONTENT_WIDTH_CLASS} p-4 sm:p-6 lg:p-8 xl:p-10`}
                  >
                    <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-3xl space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className={HEARTBEATS_SECTION_KICKER_CLASS}>
                            {t("heartbeatsview.heartbeatSingular")}
                          </div>
                          <StatusBadge
                            label={
                              trigger.enabled
                                ? t("appsview.Active")
                                : t("heartbeatsview.statusPaused")
                            }
                            tone={trigger.enabled ? "success" : "muted"}
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
                        {/* Pause / Resume toggle */}
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
                          {trigger.enabled ? "Pause" : "Resume"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs"
                          onClick={() => openEditEditor(trigger)}
                        >
                          Edit
                        </Button>
                        {/* Duplicate */}
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
                          Duplicate
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
                      <div className={HEARTBEATS_STAT_CARD_CLASS}>
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                          Schedule
                        </dt>
                        <dd className="mt-1 text-txt font-medium">
                          {scheduleLabel(trigger, t)}
                        </dd>
                      </div>
                      <div className={HEARTBEATS_STAT_CARD_CLASS}>
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                          {t("triggersview.LastRun")}
                        </dt>
                        <dd className="mt-1 text-txt font-medium">
                          {formatDateTime(trigger.lastRunAtIso, {
                            fallback: t("heartbeatsview.notYetRun"),
                          })}
                        </dd>
                      </div>
                      <div className={HEARTBEATS_STAT_CARD_CLASS}>
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                          {t("heartbeatsview.nextRun")}
                        </dt>
                        <dd className="mt-1 text-txt font-medium">
                          {formatDateTime(trigger.nextRunAtMs, {
                            fallback: t("heartbeatsview.notScheduled"),
                          })}
                        </dd>
                      </div>
                      {/* Success/failure counts */}
                      {hasLoadedRuns && totalRuns > 0 && (
                        <div className={HEARTBEATS_STAT_CARD_CLASS}>
                          <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            Run Stats
                          </dt>
                          <dd className="mt-1 flex items-center gap-2 text-sm font-medium">
                            <span className="text-txt">{totalRuns} runs</span>
                            {successCount > 0 && (
                              <span className="text-ok">{successCount} ✓</span>
                            )}
                            {failureCount > 0 && (
                              <span className="text-danger">
                                {failureCount} ✗
                              </span>
                            )}
                          </dd>
                        </div>
                      )}
                    </dl>

                    <div className={`${HEARTBEATS_PANEL_CLASS} space-y-4`}>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted">
                          {t("triggersview.RunHistory")}
                        </h3>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-3 text-[11px]"
                          onClick={() =>
                            void loadTriggerRuns(selectedTriggerId)
                          }
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
                          No runs yet. Click "Run Now" to trigger manually.
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
                                  label={localizedExecutionStatus(
                                    run.status,
                                    t,
                                  )}
                                  tone={toneForLastStatus(run.status)}
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
                    </div>
                  </div>
                );
              })()) || (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-bg/5">
                <DesktopEmptyStatePanel
                  className="h-full min-h-[22rem]"
                  description={t("heartbeatsview.emptyStateDescription")}
                  icon={<Clock3 className="h-7 w-7" />}
                  title={t("heartbeatsview.selectAHeartbeat")}
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 rounded-xl px-5 text-sm"
                      onClick={() => {
                        openCreateEditor();
                        setSelectedTriggerId(null);
                      }}
                    >
                      {t("heartbeatsview.newHeartbeat")}
                    </Button>
                  }
                />
              </div>
            )
          )}
        </main>
      </div>
    </DesktopPageFrame>
  );
}
