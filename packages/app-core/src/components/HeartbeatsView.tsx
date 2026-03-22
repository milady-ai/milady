import { Button, Input } from "@miladyai/ui";
import { ChevronDown, Clock3, PencilLine, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  CreateTriggerRequest,
  TriggerSummary,
  UpdateTriggerRequest,
} from "../api/client";
import { useApp } from "../state";
import { confirmDesktopAction } from "../utils";
import { formatDateTime, formatDurationMs } from "./format";
import { StatusBadge, StatusDot } from "./ui-badges";

type TriggerType = "interval" | "once" | "cron";
type TriggerWakeMode = "inject_now" | "next_autonomy_cycle";
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

const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-medium text-muted";
const INPUT_CLASS =
  "h-10 w-full rounded-xl border-border/60 bg-bg/70 px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-accent";
const SELECT_CLASS =
  "h-10 w-full rounded-xl border border-border/60 bg-bg/70 px-3 py-2 text-sm outline-none focus:border-accent";
const TEXTAREA_CLASS =
  "min-h-[120px] w-full resize-y rounded-xl border border-border/60 bg-bg/70 px-3 py-2 text-sm outline-none focus:border-accent";

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

function wakeModeLabel(
  wakeMode: TriggerWakeMode,
  t: (key: string) => string,
): string {
  return wakeMode === "inject_now"
    ? t("triggersview.InjectAmpWakeIm")
    : t("triggersview.QueueForNextCycle");
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

function runCountLabel(count: number, t: TranslateFn): string {
  return count === 1
    ? t("heartbeatsview.runCountSingle", { count })
    : t("heartbeatsview.runCountPlural", { count });
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

  const selectedRuns = useMemo(() => {
    if (!selectedTriggerId) return [];
    return triggerRunsById[selectedTriggerId] ?? [];
  }, [selectedTriggerId, triggerRunsById]);

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

  const toggleExpandedTrigger = (triggerId: string) => {
    const nextTriggerId = selectedTriggerId === triggerId ? null : triggerId;
    setSelectedTriggerId(nextTriggerId);
    if (nextTriggerId) {
      void loadTriggerRuns(nextTriggerId);
    }
  };

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
    <div className="flex h-full w-full overflow-hidden bg-bg">
      {/* Sidebar */}
      <aside className="w-72 md:w-80 min-w-[250px] border-r border-border/60 bg-card/30 flex flex-col overflow-y-auto">
        <div className="sticky top-0 z-10 pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-10 px-3 justify-start text-sm hover:bg-accent/5 font-medium border-l-2 border-transparent"
            onClick={() => {
              openCreateEditor();
              setSelectedTriggerId(null);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("heartbeatsview.newHeartbeat")}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {triggerError && (
            <div className="mx-3 mt-3 mb-1 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {triggerError}
            </div>
          )}
          {triggers.length === 0 && !triggersLoading ? (
            <div className="p-4 text-center text-sm text-muted">
              {t("triggersview.NoTriggersConfigur")}
            </div>
          ) : (
            triggers.map((trigger) => {
              const isActive = selectedTriggerId === trigger.id;

              return (
                <button
                  key={trigger.id}
                  type="button"
                  onClick={() => {
                    openEditEditor(trigger);
                    void loadTriggerRuns(trigger.id);
                  }}
                  className={`w-full text-left px-3 py-2.5 transition-colors border-l-2 ${isActive ? "border-accent text-accent bg-transparent" : "border-transparent bg-transparent hover:bg-accent/5"}`}
                >
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-sm text-txt truncate">
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
                    <div className="text-[11px] text-muted flex items-center justify-between gap-2 mt-0.5">
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
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 overflow-y-auto bg-card relative custom-scrollbar">
        {editorOpen || editingId ? (
          <div className="max-w-3xl mx-auto p-6 lg:p-10 pb-20">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  {editingId
                    ? t("heartbeatsview.editHeartbeat")
                    : t("heartbeatsview.createHeartbeat")}
                </div>
                <h2 className="text-2xl font-semibold text-txt">
                  {modalTitle}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
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

            <div className="space-y-8">
              {formError && (
                <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger shadow-sm">
                  {formError}
                </div>
              )}

              <div className="grid gap-6 bg-bg/20 p-6 rounded-2xl border border-border/40 shadow-sm">
                <div>
                  <span className={FIELD_LABEL_CLASS}>{t("wallet.name")}</span>
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
                  <textarea
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
                    <select
                      className={SELECT_CLASS}
                      value={form.triggerType}
                      onChange={(event) =>
                        setField(
                          "triggerType",
                          event.target.value as TriggerType,
                        )
                      }
                    >
                      <option value="interval">
                        {t("triggersview.RepeatingInterval")}
                      </option>
                      <option value="once">{t("triggersview.OneTime")}</option>
                      <option value="cron">
                        {t("triggersview.CronSchedule")}
                      </option>
                    </select>
                  </div>

                  <div>
                    <span className={FIELD_LABEL_CLASS}>
                      {t("triggersview.WakeMode")}
                    </span>
                    <select
                      className={SELECT_CLASS}
                      value={form.wakeMode}
                      onChange={(event) =>
                        setField(
                          "wakeMode",
                          event.target.value as TriggerWakeMode,
                        )
                      }
                    >
                      <option value="inject_now">
                        {t("triggersview.InjectAmpWakeIm")}
                      </option>
                      <option value="next_autonomy_cycle">
                        {t("triggersview.QueueForNextCycle")}
                      </option>
                    </select>
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
                      <select
                        className={SELECT_CLASS}
                        value={form.durationUnit}
                        onChange={(event) =>
                          setField(
                            "durationUnit",
                            event.target.value as DurationUnit,
                          )
                        }
                      >
                        {DURATION_UNITS.map((unit) => (
                          <option key={unit.unit} value={unit.unit}>
                            {durationUnitLabel(unit.unit, t)}
                          </option>
                        ))}
                      </select>
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
                    <label className="inline-flex cursor-pointer select-none flex-1 items-center gap-3 rounded-xl bg-bg/50 px-4 py-2 border border-border/50 hover:border-accent/50 text-sm text-txt transition-colors h-10">
                      <input
                        type="checkbox"
                        checked={form.enabled}
                        onChange={(event) =>
                          setField("enabled", event.target.checked)
                        }
                        className="accent-accent w-4 h-4 rounded-sm border-border/60"
                      />
                      {t("triggersview.StartEnabled")}
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
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
                      const trigger = triggers.find((t) => t.id === editingId);
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

              {/* Detailed run info and metadata when editing */}
              {editingId && (
                <div className="mt-12 pt-10 border-t border-border/40 grid gap-10">
                  <dl className="grid gap-x-6 gap-y-6 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
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
                    <div>
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
                    <div>
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

                  <div className="space-y-4">
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
                            <div className="w-4 h-4 border-2 border-muted/30 border-t-muted/80 rounded-full animate-spin"></div>{" "}
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
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-bg/5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card border border-border/30 shadow-sm mb-6 rotate-3">
              <Clock3 className="h-7 w-7 text-muted/80" />
            </div>
            <h2 className="text-xl font-medium text-txt mb-2">
              {t("heartbeatsview.selectAHeartbeat")}
            </h2>
            <p className="text-sm text-muted max-w-sm leading-relaxed">
              {t("heartbeatsview.emptyStateDescription")}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
