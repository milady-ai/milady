import crypto from "node:crypto";
import type { IAgentRuntime } from "@elizaos/core";
import type {
  CompleteLifeOpsOccurrenceRequest,
  CreateLifeOpsDefinitionRequest,
  CreateLifeOpsGoalRequest,
  LifeOpsAuditEventType,
  LifeOpsCadence,
  LifeOpsGoalDefinition,
  LifeOpsGoalLink,
  LifeOpsOccurrence,
  LifeOpsOverview,
  LifeOpsOccurrenceView,
  LifeOpsProgressionRule,
  LifeOpsReminderPlan,
  LifeOpsReminderStep,
  LifeOpsTaskDefinition,
  LifeOpsTimeWindowDefinition,
  LifeOpsWindowPolicy,
  SnoozeLifeOpsOccurrenceRequest,
  UpdateLifeOpsDefinitionRequest,
  UpdateLifeOpsGoalRequest,
  LifeOpsActiveReminderView,
} from "@miladyai/shared/contracts/lifeops";
import {
  LIFEOPS_DEFINITION_KINDS,
  LIFEOPS_DEFINITION_STATUSES,
  LIFEOPS_GOAL_STATUSES,
  LIFEOPS_REMINDER_CHANNELS,
  LIFEOPS_REVIEW_STATES,
} from "@miladyai/shared/contracts/lifeops";
import {
  DEFAULT_REMINDER_STEPS,
  normalizeTimeZone,
  normalizeWindowPolicy,
} from "./defaults.js";
import { materializeDefinitionOccurrences } from "./engine.js";
import {
  createLifeOpsAuditEvent,
  createLifeOpsGoalDefinition,
  createLifeOpsReminderPlan,
  createLifeOpsTaskDefinition,
  LifeOpsRepository,
} from "./repository.js";
import {
  addDaysToLocalDate,
  addMinutes,
  buildUtcDateFromLocalParts,
  getZonedDateParts,
  type ZonedDateParts,
} from "./time.js";

const MAX_OVERVIEW_OCCURRENCES = 8;
const MAX_OVERVIEW_REMINDERS = 6;
const OVERVIEW_HORIZON_MINUTES = 18 * 60;
const DAY_MINUTES = 24 * 60;

type LifeOpsDefinitionRecord = {
  definition: LifeOpsTaskDefinition;
  reminderPlan: LifeOpsReminderPlan | null;
};

type LifeOpsGoalRecord = {
  goal: LifeOpsGoalDefinition;
  links: LifeOpsGoalLink[];
};

export class LifeOpsServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "LifeOpsServiceError";
  }
}

function fail(status: number, message: string): never {
  throw new LifeOpsServiceError(status, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return { ...value };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(400, `${field} must be an object`);
  }
  return { ...value };
}

function normalizeOptionalRecord(
  value: unknown,
  field: string,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  return requireRecord(value, field);
}

function normalizeNullableRecord(
  value: unknown,
  field: string,
): Record<string, unknown> | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return requireRecord(value, field);
}

function mergeMetadata(
  current: Record<string, unknown>,
  updates?: Record<string, unknown>,
): Record<string, unknown> {
  const merged = {
    ...current,
    ...cloneRecord(updates),
  };
  if (typeof merged.privacyClass !== "string" || merged.privacyClass.trim().length === 0) {
    merged.privacyClass = "private";
  }
  return merged;
}

function requireAgentId(runtime: IAgentRuntime): string {
  const agentId = runtime.agentId;
  if (typeof agentId !== "string" || agentId.trim().length === 0) {
    fail(500, "agent runtime is missing agentId");
  }
  return agentId;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    fail(400, `${field} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    fail(400, `${field} is required`);
  }
  return normalized;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeIsoString(value: unknown, field: string): string {
  const text = requireNonEmptyString(value, field);
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    fail(400, `${field} must be a valid ISO datetime`);
  }
  return new Date(parsed).toISOString();
}

function normalizeFiniteNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  fail(400, `${field} must be a finite number`);
}

function normalizeOptionalMinutes(value: unknown, field: string): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const minutes = Math.trunc(normalizeFiniteNumber(value, field));
  if (minutes < 0) {
    fail(400, `${field} must be zero or greater`);
  }
  return minutes;
}

function normalizePriority(value: unknown, current = 3): number {
  if (value === undefined) return current;
  const priority = Math.trunc(normalizeFiniteNumber(value, "priority"));
  if (priority < 1 || priority > 5) {
    fail(400, "priority must be between 1 and 5");
  }
  return priority;
}

function normalizeEnumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  const text = requireNonEmptyString(value, field) as T;
  if (!allowed.includes(text)) {
    fail(400, `${field} must be one of: ${allowed.join(", ")}`);
  }
  return text;
}

function normalizeWindowNames(
  value: unknown,
  field: string,
  windowPolicy: LifeOpsWindowPolicy,
): Array<LifeOpsTimeWindowDefinition["name"]> {
  if (!Array.isArray(value) || value.length === 0) {
    fail(400, `${field} must contain at least one time window`);
  }
  const allowedNames = new Set(windowPolicy.windows.map((window) => window.name));
  const seen = new Set<string>();
  const windows: Array<LifeOpsTimeWindowDefinition["name"]> = [];
  for (const candidate of value) {
    const name = requireNonEmptyString(candidate, field) as LifeOpsTimeWindowDefinition["name"];
    if (!allowedNames.has(name)) {
      fail(400, `${field} contains unknown window \"${name}\"`);
    }
    if (!seen.has(name)) {
      seen.add(name);
      windows.push(name);
    }
  }
  return windows;
}

function normalizeCadence(
  cadence: LifeOpsCadence,
  windowPolicy: LifeOpsWindowPolicy,
): LifeOpsCadence {
  const visibilityLeadMinutes = normalizeOptionalMinutes(
    cadence.visibilityLeadMinutes,
    "cadence.visibilityLeadMinutes",
  );
  const visibilityLagMinutes = normalizeOptionalMinutes(
    cadence.visibilityLagMinutes,
    "cadence.visibilityLagMinutes",
  );

  const withVisibility = <T extends object>(
    value: T,
  ): T & {
    visibilityLeadMinutes?: number;
    visibilityLagMinutes?: number;
  } => {
    const next: T & {
      visibilityLeadMinutes?: number;
      visibilityLagMinutes?: number;
    } = { ...value };
    if (visibilityLeadMinutes !== undefined) {
      next.visibilityLeadMinutes = visibilityLeadMinutes;
    }
    if (visibilityLagMinutes !== undefined) {
      next.visibilityLagMinutes = visibilityLagMinutes;
    }
    return next;
  };

  switch (cadence.kind) {
    case "once":
      return withVisibility({
        kind: "once",
        dueAt: normalizeIsoString(cadence.dueAt, "cadence.dueAt"),
      }) as LifeOpsCadence;
    case "daily":
      return withVisibility({
        kind: "daily",
        windows: normalizeWindowNames(cadence.windows, "cadence.windows", windowPolicy),
      }) as LifeOpsCadence;
    case "weekly": {
      if (!Array.isArray(cadence.weekdays) || cadence.weekdays.length === 0) {
        fail(400, "cadence.weekdays must contain at least one weekday");
      }
      const weekdays = [...new Set(cadence.weekdays.map((weekday) => Math.trunc(normalizeFiniteNumber(weekday, "cadence.weekdays"))))].sort(
        (left, right) => left - right,
      );
      if (weekdays.some((weekday) => weekday < 0 || weekday > 6)) {
        fail(400, "cadence.weekdays must use Sunday=0 through Saturday=6");
      }
      return withVisibility({
        kind: "weekly",
        weekdays,
        windows: normalizeWindowNames(cadence.windows, "cadence.windows", windowPolicy),
      }) as LifeOpsCadence;
    }
    case "times_per_day": {
      if (!Array.isArray(cadence.slots) || cadence.slots.length === 0) {
        fail(400, "cadence.slots must contain at least one slot");
      }
      const seen = new Set<string>();
      const slots = cadence.slots.map((slot, index) => {
        const key = requireNonEmptyString(slot.key, `cadence.slots[${index}].key`);
        if (seen.has(key)) {
          fail(400, `cadence.slots contains duplicate key \"${key}\"`);
        }
        seen.add(key);
        const label = requireNonEmptyString(slot.label, `cadence.slots[${index}].label`);
        const minuteOfDay = Math.trunc(
          normalizeFiniteNumber(slot.minuteOfDay, `cadence.slots[${index}].minuteOfDay`),
        );
        const durationMinutes = Math.trunc(
          normalizeFiniteNumber(
            slot.durationMinutes,
            `cadence.slots[${index}].durationMinutes`,
          ),
        );
        if (minuteOfDay < 0 || minuteOfDay >= DAY_MINUTES) {
          fail(400, `cadence.slots[${index}].minuteOfDay must be between 0 and 1439`);
        }
        if (durationMinutes <= 0 || durationMinutes > DAY_MINUTES) {
          fail(400, `cadence.slots[${index}].durationMinutes must be between 1 and 1440`);
        }
        return {
          key,
          label,
          minuteOfDay,
          durationMinutes,
        };
      });
      return withVisibility({
        kind: "times_per_day",
        slots,
      }) as LifeOpsCadence;
    }
    default:
      fail(400, "cadence.kind is not supported");
  }
}

function normalizeProgressionRule(
  rule: LifeOpsProgressionRule | undefined,
): LifeOpsProgressionRule {
  if (!rule || rule.kind === "none") {
    return { kind: "none" };
  }
  if (rule.kind !== "linear_increment") {
    fail(400, "progressionRule.kind is not supported");
  }
  const metric = requireNonEmptyString(rule.metric, "progressionRule.metric");
  const start = normalizeFiniteNumber(rule.start, "progressionRule.start");
  const step = normalizeFiniteNumber(rule.step, "progressionRule.step");
  if (step <= 0) {
    fail(400, "progressionRule.step must be greater than 0");
  }
  const normalized: LifeOpsProgressionRule = {
    kind: "linear_increment",
    metric,
    start,
    step,
  };
  const unit = normalizeOptionalString(rule.unit);
  if (unit) {
    normalized.unit = unit;
  }
  return normalized;
}

function normalizeReminderSteps(value: unknown): LifeOpsReminderStep[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(400, "reminderPlan.steps must contain at least one step");
  }
  const steps = value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      fail(400, `reminderPlan.steps[${index}] must be an object`);
    }
    const stepRecord = candidate as Record<string, unknown>;
    const channel = normalizeEnumValue(
      stepRecord.channel,
      `reminderPlan.steps[${index}].channel`,
      LIFEOPS_REMINDER_CHANNELS,
    );
    const offsetMinutes = Math.trunc(
      normalizeFiniteNumber(
        stepRecord.offsetMinutes,
        `reminderPlan.steps[${index}].offsetMinutes`,
      ),
    );
    if (offsetMinutes < 0) {
      fail(400, `reminderPlan.steps[${index}].offsetMinutes must be zero or greater`);
    }
    const label = requireNonEmptyString(stepRecord.label, `reminderPlan.steps[${index}].label`);
    return {
      channel,
      offsetMinutes,
      label,
    } satisfies LifeOpsReminderStep;
  });
  steps.sort((left, right) => left.offsetMinutes - right.offsetMinutes);
  return steps;
}

function normalizeReminderPlanDraft(
  reminderPlan: CreateLifeOpsDefinitionRequest["reminderPlan"] | UpdateLifeOpsDefinitionRequest["reminderPlan"] | undefined,
  mode: "create" | "update",
): { steps: LifeOpsReminderStep[]; mutePolicy: Record<string, unknown>; quietHours: Record<string, unknown> } | null | undefined {
  if (reminderPlan === undefined) {
    return mode === "create"
      ? {
          steps: DEFAULT_REMINDER_STEPS.map((step) => ({ ...step })),
          mutePolicy: {},
          quietHours: {},
        }
      : undefined;
  }
  if (reminderPlan === null) return null;
  return {
    steps: normalizeReminderSteps(reminderPlan.steps),
    mutePolicy: cloneRecord(reminderPlan.mutePolicy),
    quietHours: cloneRecord(reminderPlan.quietHours),
  };
}

function buildWindowStartDate(
  timeZone: string,
  dateOnly: Pick<ZonedDateParts, "year" | "month" | "day">,
  startMinute: number,
): Date {
  const dayOffset = Math.floor(startMinute / DAY_MINUTES);
  const minuteOfDay = startMinute % DAY_MINUTES;
  const localDate = addDaysToLocalDate(dateOnly, dayOffset);
  return buildUtcDateFromLocalParts(timeZone, {
    ...localDate,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    second: 0,
  });
}

function resolveUpcomingWindowStart(
  timeZone: string,
  windowPolicy: LifeOpsWindowPolicy,
  baseDate: Pick<ZonedDateParts, "year" | "month" | "day">,
  candidateNames: string[],
  fallbackMinute: number,
  notBefore: Date,
): Date {
  const matchingWindows = windowPolicy.windows
    .filter((window) => candidateNames.includes(window.name))
    .sort((left, right) => left.startMinute - right.startMinute);
  const candidateMinutes =
    matchingWindows.length > 0
      ? matchingWindows.map((window) => window.startMinute)
      : [fallbackMinute];
  for (let dayDelta = 0; dayDelta <= 2; dayDelta += 1) {
    const dateOnly = addDaysToLocalDate(baseDate, dayDelta);
    for (const minuteOfDay of candidateMinutes) {
      const candidate = buildWindowStartDate(timeZone, dateOnly, minuteOfDay);
      if (candidate.getTime() > notBefore.getTime()) {
        return candidate;
      }
    }
  }
  return buildWindowStartDate(
    timeZone,
    addDaysToLocalDate(baseDate, 1),
    candidateMinutes[0],
  );
}

function computeSnoozedUntil(
  definition: LifeOpsTaskDefinition,
  request: SnoozeLifeOpsOccurrenceRequest,
  now: Date,
): Date {
  if (request.preset) {
    const localNow = getZonedDateParts(now, definition.timezone);
    const today = {
      year: localNow.year,
      month: localNow.month,
      day: localNow.day,
    };
    switch (request.preset) {
      case "15m":
        return addMinutes(now, 15);
      case "30m":
        return addMinutes(now, 30);
      case "1h":
        return addMinutes(now, 60);
      case "tonight":
        return resolveUpcomingWindowStart(
          definition.timezone,
          definition.windowPolicy,
          today,
          ["evening", "night"],
          20 * 60,
          now,
        );
      case "tomorrow_morning": {
        const tomorrow = addDaysToLocalDate(today, 1);
        return resolveUpcomingWindowStart(
          definition.timezone,
          definition.windowPolicy,
          tomorrow,
          ["morning"],
          8 * 60,
          new Date(now.getTime() - 1),
        );
      }
      default:
        fail(400, "preset is not supported");
    }
  }
  const minutes = request.minutes ?? 30;
  const normalizedMinutes = Math.trunc(normalizeFiniteNumber(minutes, "minutes"));
  if (normalizedMinutes <= 0) {
    fail(400, "minutes must be greater than 0");
  }
  return addMinutes(now, normalizedMinutes);
}

function sortOverviewOccurrences(
  occurrences: LifeOpsOccurrenceView[],
): LifeOpsOccurrenceView[] {
  return [...occurrences].sort((left, right) => {
    const leftStart = new Date(left.relevanceStartAt).getTime();
    const rightStart = new Date(right.relevanceStartAt).getTime();
    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.title.localeCompare(right.title);
  });
}

function selectOverviewOccurrences(
  occurrences: LifeOpsOccurrenceView[],
): LifeOpsOccurrenceView[] {
  const visible = sortOverviewOccurrences(
    occurrences.filter(
      (occurrence) =>
        occurrence.state === "visible" || occurrence.state === "snoozed",
    ),
  );
  const pending = sortOverviewOccurrences(
    occurrences.filter((occurrence) => occurrence.state === "pending"),
  );
  const next: LifeOpsOccurrenceView[] = [];
  for (const occurrence of visible) {
    if (next.length >= MAX_OVERVIEW_OCCURRENCES) break;
    next.push(occurrence);
  }
  for (const occurrence of pending) {
    if (next.length >= MAX_OVERVIEW_OCCURRENCES) break;
    next.push(occurrence);
  }
  return next;
}

function buildActiveReminders(
  occurrences: LifeOpsOccurrenceView[],
  plansByDefinitionId: Map<string, LifeOpsReminderPlan>,
  now: Date,
): LifeOpsActiveReminderView[] {
  const reminders: LifeOpsActiveReminderView[] = [];
  for (const occurrence of occurrences) {
    const plan = plansByDefinitionId.get(occurrence.definitionId);
    if (!plan) continue;
    if (
      occurrence.state === "completed" ||
      occurrence.state === "skipped" ||
      occurrence.state === "expired" ||
      occurrence.state === "muted"
    ) {
      continue;
    }
    const anchorIso = occurrence.snoozedUntil ?? occurrence.relevanceStartAt;
    const anchorDate = new Date(anchorIso);
    for (const [stepIndex, step] of plan.steps.entries()) {
      const scheduledFor = addMinutes(anchorDate, step.offsetMinutes);
      if (scheduledFor.getTime() > now.getTime()) {
        continue;
      }
      reminders.push({
        occurrenceId: occurrence.id,
        definitionId: occurrence.definitionId,
        title: occurrence.title,
        channel: step.channel,
        stepIndex,
        stepLabel: step.label,
        scheduledFor: scheduledFor.toISOString(),
        dueAt: occurrence.dueAt,
        state: occurrence.state,
      });
    }
  }
  reminders.sort(
    (left, right) =>
      new Date(left.scheduledFor).getTime() - new Date(right.scheduledFor).getTime(),
  );
  return reminders.slice(0, MAX_OVERVIEW_REMINDERS);
}

export class LifeOpsService {
  private readonly repository: LifeOpsRepository;

  constructor(private readonly runtime: IAgentRuntime) {
    this.repository = new LifeOpsRepository(runtime);
  }

  private agentId(): string {
    return requireAgentId(this.runtime);
  }

  private async recordAudit(
    eventType: LifeOpsAuditEventType,
    ownerType: "definition" | "occurrence" | "goal",
    ownerId: string,
    reason: string,
    inputs: Record<string, unknown>,
    decision: Record<string, unknown>,
  ): Promise<void> {
    await this.repository.createAuditEvent(
      createLifeOpsAuditEvent({
        agentId: this.agentId(),
        eventType,
        ownerType,
        ownerId,
        reason,
        inputs,
        decision,
        actor: "user",
      }),
    );
  }

  private async getDefinitionRecord(
    definitionId: string,
  ): Promise<LifeOpsDefinitionRecord> {
    const definition = await this.repository.getDefinition(this.agentId(), definitionId);
    if (!definition) {
      fail(404, "life-ops definition not found");
    }
    const reminderPlan = definition.reminderPlanId
      ? await this.repository.getReminderPlan(this.agentId(), definition.reminderPlanId)
      : null;
    return { definition, reminderPlan };
  }

  private async getGoalRecord(goalId: string): Promise<LifeOpsGoalRecord> {
    const goal = await this.repository.getGoal(this.agentId(), goalId);
    if (!goal) {
      fail(404, "life-ops goal not found");
    }
    const links = await this.repository.listGoalLinksForGoal(this.agentId(), goalId);
    return { goal, links };
  }

  private async ensureGoalExists(goalId: string | null): Promise<string | null> {
    if (!goalId) return null;
    const goal = await this.repository.getGoal(this.agentId(), goalId);
    if (!goal) {
      fail(404, `goal ${goalId} does not exist`);
    }
    return goal.id;
  }

  private async syncGoalLink(definition: LifeOpsTaskDefinition): Promise<void> {
    await this.repository.deleteGoalLinksForLinked(
      definition.agentId,
      "definition",
      definition.id,
    );
    if (!definition.goalId) return;
    await this.repository.upsertGoalLink({
      id: crypto.randomUUID(),
      agentId: definition.agentId,
      goalId: definition.goalId,
      linkedType: "definition",
      linkedId: definition.id,
      createdAt: new Date().toISOString(),
    });
  }

  private async syncReminderPlan(
    definition: LifeOpsTaskDefinition,
    draft:
      | {
          steps: LifeOpsReminderStep[];
          mutePolicy: Record<string, unknown>;
          quietHours: Record<string, unknown>;
        }
      | null
      | undefined,
  ): Promise<LifeOpsReminderPlan | null> {
    if (draft === undefined) {
      return definition.reminderPlanId
        ? await this.repository.getReminderPlan(definition.agentId, definition.reminderPlanId)
        : null;
    }
    if (draft === null) {
      if (definition.reminderPlanId) {
        await this.repository.deleteReminderPlan(definition.agentId, definition.reminderPlanId);
      }
      definition.reminderPlanId = null;
      return null;
    }
    const existingPlan = definition.reminderPlanId
      ? await this.repository.getReminderPlan(definition.agentId, definition.reminderPlanId)
      : null;
    if (existingPlan) {
      const nextPlan: LifeOpsReminderPlan = {
        ...existingPlan,
        steps: draft.steps,
        mutePolicy: draft.mutePolicy,
        quietHours: draft.quietHours,
        updatedAt: new Date().toISOString(),
      };
      await this.repository.updateReminderPlan(nextPlan);
      definition.reminderPlanId = nextPlan.id;
      return nextPlan;
    }
    const createdPlan = createLifeOpsReminderPlan({
      agentId: definition.agentId,
      ownerType: "definition",
      ownerId: definition.id,
      steps: draft.steps,
      mutePolicy: draft.mutePolicy,
      quietHours: draft.quietHours,
    });
    await this.repository.createReminderPlan(createdPlan);
    definition.reminderPlanId = createdPlan.id;
    return createdPlan;
  }

  private async refreshDefinitionOccurrences(
    definition: LifeOpsTaskDefinition,
    now = new Date(),
  ): Promise<LifeOpsOccurrence[]> {
    const existingOccurrences = await this.repository.listOccurrencesForDefinition(
      definition.agentId,
      definition.id,
    );
    const materialized = materializeDefinitionOccurrences(
      definition,
      existingOccurrences,
      { now },
    );
    for (const occurrence of materialized) {
      await this.repository.upsertOccurrence(occurrence);
    }
    await this.repository.pruneNonTerminalOccurrences(
      definition.agentId,
      definition.id,
      materialized.map((occurrence) => occurrence.occurrenceKey),
    );
    return materialized;
  }

  private async getFreshOccurrence(
    occurrenceId: string,
    now = new Date(),
  ): Promise<{ definition: LifeOpsTaskDefinition; occurrence: LifeOpsOccurrence }> {
    const occurrence = await this.repository.getOccurrence(this.agentId(), occurrenceId);
    if (!occurrence) {
      fail(404, "life-ops occurrence not found");
    }
    const definition = await this.repository.getDefinition(
      this.agentId(),
      occurrence.definitionId,
    );
    if (!definition) {
      fail(404, "life-ops definition not found for occurrence");
    }
    if (definition.status === "active") {
      await this.refreshDefinitionOccurrences(definition, now);
    }
    const freshOccurrence = await this.repository.getOccurrence(this.agentId(), occurrenceId);
    if (!freshOccurrence) {
      fail(404, "life-ops occurrence not found after refresh");
    }
    return {
      definition,
      occurrence: freshOccurrence,
    };
  }

  async listDefinitions(): Promise<LifeOpsDefinitionRecord[]> {
    const definitions = await this.repository.listDefinitions(this.agentId());
    const plans = await this.repository.listReminderPlansForOwners(
      this.agentId(),
      "definition",
      definitions.map((definition) => definition.id),
    );
    const planMap = new Map(plans.map((plan) => [plan.ownerId, plan]));
    return definitions.map((definition) => ({
      definition,
      reminderPlan: planMap.get(definition.id) ?? null,
    }));
  }

  async getDefinition(definitionId: string): Promise<LifeOpsDefinitionRecord> {
    return this.getDefinitionRecord(definitionId);
  }

  async createDefinition(
    request: CreateLifeOpsDefinitionRequest,
  ): Promise<LifeOpsDefinitionRecord> {
    const agentId = this.agentId();
    const kind = normalizeEnumValue(request.kind, "kind", LIFEOPS_DEFINITION_KINDS);
    const title = requireNonEmptyString(request.title, "title");
    const description = normalizeOptionalString(request.description) ?? "";
    const originalIntent =
      normalizeOptionalString(request.originalIntent) ?? title;
    const timezone = normalizeTimeZone(request.timezone);
    const windowPolicy = normalizeWindowPolicy(request.windowPolicy, timezone);
    const cadence = normalizeCadence(request.cadence, windowPolicy);
    const progressionRule = normalizeProgressionRule(request.progressionRule);
    const reminderPlanDraft = normalizeReminderPlanDraft(request.reminderPlan, "create");
    const goalId = await this.ensureGoalExists(request.goalId ?? null);
    const definition = createLifeOpsTaskDefinition({
      agentId,
      kind,
      title,
      description,
      originalIntent,
      timezone,
      status: "active",
      priority: normalizePriority(request.priority),
      cadence,
      windowPolicy,
      progressionRule,
      reminderPlanId: null,
      goalId,
      source: normalizeOptionalString(request.source) ?? "manual",
      metadata: mergeMetadata(
        {},
        normalizeOptionalRecord(request.metadata, "metadata"),
      ),
    });
    await this.repository.createDefinition(definition);
    const reminderPlan = await this.syncReminderPlan(definition, reminderPlanDraft);
    if (definition.reminderPlanId !== null) {
      await this.repository.updateDefinition(definition);
    }
    await this.syncGoalLink(definition);
    await this.refreshDefinitionOccurrences(definition);
    await this.recordAudit(
      "definition_created",
      "definition",
      definition.id,
      "definition created",
      {
        request,
      },
      {
        kind: definition.kind,
        timezone: definition.timezone,
        cadence: definition.cadence,
        reminderPlanId: definition.reminderPlanId,
      },
    );
    return {
      definition,
      reminderPlan,
    };
  }

  async updateDefinition(
    definitionId: string,
    request: UpdateLifeOpsDefinitionRequest,
  ): Promise<LifeOpsDefinitionRecord> {
    const current = await this.getDefinitionRecord(definitionId);
    const nextTimezone = normalizeTimeZone(request.timezone ?? current.definition.timezone);
    const nextWindowPolicy = normalizeWindowPolicy(
      request.windowPolicy ?? current.definition.windowPolicy,
      nextTimezone,
    );
    const nextCadence = normalizeCadence(
      request.cadence ?? current.definition.cadence,
      nextWindowPolicy,
    );
    const nextStatus =
      request.status === undefined
        ? current.definition.status
        : normalizeEnumValue(
            request.status,
            "status",
            LIFEOPS_DEFINITION_STATUSES,
          );
    const nextDefinition: LifeOpsTaskDefinition = {
      ...current.definition,
      title:
        request.title !== undefined
          ? requireNonEmptyString(request.title, "title")
          : current.definition.title,
      description:
        request.description !== undefined
          ? normalizeOptionalString(request.description) ?? ""
          : current.definition.description,
      originalIntent:
        request.originalIntent !== undefined
          ? normalizeOptionalString(request.originalIntent) ?? current.definition.title
          : current.definition.originalIntent,
      timezone: nextTimezone,
      status: nextStatus,
      priority: normalizePriority(request.priority, current.definition.priority),
      cadence: nextCadence,
      windowPolicy: nextWindowPolicy,
      progressionRule:
        request.progressionRule !== undefined
          ? normalizeProgressionRule(request.progressionRule)
          : current.definition.progressionRule,
      goalId:
        request.goalId !== undefined
          ? await this.ensureGoalExists(request.goalId ?? null)
          : current.definition.goalId,
      metadata:
        request.metadata !== undefined
          ? mergeMetadata(
              current.definition.metadata,
              normalizeOptionalRecord(request.metadata, "metadata"),
            )
          : current.definition.metadata,
      updatedAt: new Date().toISOString(),
    };
    const reminderPlanDraft = normalizeReminderPlanDraft(request.reminderPlan, "update");
    await this.repository.updateDefinition(nextDefinition);
    const reminderPlan = await this.syncReminderPlan(nextDefinition, reminderPlanDraft);
    await this.repository.updateDefinition(nextDefinition);
    await this.syncGoalLink(nextDefinition);
    if (nextDefinition.status === "active") {
      await this.refreshDefinitionOccurrences(nextDefinition);
    }
    await this.recordAudit(
      "definition_updated",
      "definition",
      nextDefinition.id,
      "definition updated",
      {
        request,
      },
      {
        status: nextDefinition.status,
        cadence: nextDefinition.cadence,
        timezone: nextDefinition.timezone,
        reminderPlanId: nextDefinition.reminderPlanId,
      },
    );
    return {
      definition: nextDefinition,
      reminderPlan,
    };
  }

  async listGoals(): Promise<LifeOpsGoalRecord[]> {
    const goals = await this.repository.listGoals(this.agentId());
    const records: LifeOpsGoalRecord[] = [];
    for (const goal of goals) {
      const links = await this.repository.listGoalLinksForGoal(this.agentId(), goal.id);
      records.push({ goal, links });
    }
    return records;
  }

  async getGoal(goalId: string): Promise<LifeOpsGoalRecord> {
    return this.getGoalRecord(goalId);
  }

  async createGoal(request: CreateLifeOpsGoalRequest): Promise<LifeOpsGoalRecord> {
    const goal = createLifeOpsGoalDefinition({
      agentId: this.agentId(),
      title: requireNonEmptyString(request.title, "title"),
      description: normalizeOptionalString(request.description) ?? "",
      cadence:
        normalizeNullableRecord(request.cadence, "cadence") ?? null,
      supportStrategy:
        normalizeOptionalRecord(request.supportStrategy, "supportStrategy") ?? {},
      successCriteria:
        normalizeOptionalRecord(request.successCriteria, "successCriteria") ?? {},
      status:
        request.status === undefined
          ? "active"
          : normalizeEnumValue(request.status, "status", LIFEOPS_GOAL_STATUSES),
      reviewState:
        request.reviewState === undefined
          ? "idle"
          : normalizeEnumValue(
              request.reviewState,
              "reviewState",
              LIFEOPS_REVIEW_STATES,
            ),
      metadata: mergeMetadata(
        {},
        normalizeOptionalRecord(request.metadata, "metadata"),
      ),
    });
    await this.repository.createGoal(goal);
    await this.recordAudit(
      "goal_created",
      "goal",
      goal.id,
      "goal created",
      {
        request,
      },
      {
        status: goal.status,
        reviewState: goal.reviewState,
      },
    );
    return {
      goal,
      links: [],
    };
  }

  async updateGoal(
    goalId: string,
    request: UpdateLifeOpsGoalRequest,
  ): Promise<LifeOpsGoalRecord> {
    const current = await this.getGoalRecord(goalId);
    const nextGoal: LifeOpsGoalDefinition = {
      ...current.goal,
      title:
        request.title !== undefined
          ? requireNonEmptyString(request.title, "title")
          : current.goal.title,
      description:
        request.description !== undefined
          ? normalizeOptionalString(request.description) ?? ""
          : current.goal.description,
      cadence:
        request.cadence !== undefined
          ? normalizeNullableRecord(request.cadence, "cadence") ?? null
          : current.goal.cadence,
      supportStrategy:
        request.supportStrategy !== undefined
          ? requireRecord(request.supportStrategy, "supportStrategy")
          : current.goal.supportStrategy,
      successCriteria:
        request.successCriteria !== undefined
          ? requireRecord(request.successCriteria, "successCriteria")
          : current.goal.successCriteria,
      status:
        request.status !== undefined
          ? normalizeEnumValue(request.status, "status", LIFEOPS_GOAL_STATUSES)
          : current.goal.status,
      reviewState:
        request.reviewState !== undefined
          ? normalizeEnumValue(
              request.reviewState,
              "reviewState",
              LIFEOPS_REVIEW_STATES,
            )
          : current.goal.reviewState,
      metadata:
        request.metadata !== undefined
          ? mergeMetadata(
              current.goal.metadata,
              normalizeOptionalRecord(request.metadata, "metadata"),
            )
          : current.goal.metadata,
      updatedAt: new Date().toISOString(),
    };
    await this.repository.updateGoal(nextGoal);
    await this.recordAudit(
      "goal_updated",
      "goal",
      nextGoal.id,
      "goal updated",
      {
        request,
      },
      {
        status: nextGoal.status,
        reviewState: nextGoal.reviewState,
      },
    );
    return {
      goal: nextGoal,
      links: current.links,
    };
  }

  async getOverview(now = new Date()): Promise<LifeOpsOverview> {
    const definitions = await this.repository.listActiveDefinitions(this.agentId());
    for (const definition of definitions) {
      await this.refreshDefinitionOccurrences(definition, now);
    }
    const horizon = addMinutes(now, OVERVIEW_HORIZON_MINUTES).toISOString();
    const overviewOccurrences = await this.repository.listOccurrenceViewsForOverview(
      this.agentId(),
      horizon,
    );
    const selectedOccurrences = selectOverviewOccurrences(overviewOccurrences);
    const reminderPlans = await this.repository.listReminderPlansForOwners(
      this.agentId(),
      "definition",
      overviewOccurrences.map((occurrence) => occurrence.definitionId),
    );
    const plansByDefinitionId = new Map(
      reminderPlans.map((plan) => [plan.ownerId, plan]),
    );
    const goals = (await this.repository.listGoals(this.agentId())).filter(
      (goal) => goal.status === "active",
    );
    const reminders = buildActiveReminders(overviewOccurrences, plansByDefinitionId, now);
    return {
      occurrences: selectedOccurrences,
      goals,
      reminders,
      summary: {
        activeOccurrenceCount: overviewOccurrences.filter(
          (occurrence) =>
            occurrence.state === "visible" || occurrence.state === "snoozed",
        ).length,
        overdueOccurrenceCount: overviewOccurrences.filter((occurrence) => {
          if (!occurrence.dueAt) return false;
          const dueAt = new Date(occurrence.dueAt).getTime();
          return dueAt < now.getTime() && occurrence.state !== "completed";
        }).length,
        snoozedOccurrenceCount: overviewOccurrences.filter(
          (occurrence) => occurrence.state === "snoozed",
        ).length,
        activeReminderCount: reminders.length,
        activeGoalCount: goals.length,
      },
    };
  }

  async completeOccurrence(
    occurrenceId: string,
    request: CompleteLifeOpsOccurrenceRequest,
  ): Promise<LifeOpsOccurrenceView> {
    const now = new Date();
    const { definition, occurrence } = await this.getFreshOccurrence(occurrenceId, now);
    if (occurrence.state === "completed") {
      const current = await this.repository.getOccurrenceView(this.agentId(), occurrence.id);
      if (!current) {
        fail(404, "life-ops occurrence not found");
      }
      return current;
    }
    if (["skipped", "expired", "muted"].includes(occurrence.state)) {
      fail(409, `occurrence cannot be completed from state ${occurrence.state}`);
    }
    const updatedOccurrence: LifeOpsOccurrence = {
      ...occurrence,
      state: "completed",
      snoozedUntil: null,
      completionPayload: {
        completedAt: now.toISOString(),
        note: normalizeOptionalString(request.note) ?? null,
        metadata: cloneRecord(request.metadata),
        previousState: occurrence.state,
      },
      updatedAt: now.toISOString(),
    };
    await this.repository.updateOccurrence(updatedOccurrence);
    await this.recordAudit(
      "occurrence_completed",
      "occurrence",
      updatedOccurrence.id,
      "occurrence completed",
      {
        request,
      },
      {
        definitionId: updatedOccurrence.definitionId,
        occurrenceKey: updatedOccurrence.occurrenceKey,
      },
    );
    await this.refreshDefinitionOccurrences(definition, now);
    const view = await this.repository.getOccurrenceView(this.agentId(), updatedOccurrence.id);
    if (!view) {
      fail(404, "life-ops occurrence not found after completion");
    }
    return view;
  }

  async skipOccurrence(occurrenceId: string): Promise<LifeOpsOccurrenceView> {
    const now = new Date();
    const { definition, occurrence } = await this.getFreshOccurrence(occurrenceId, now);
    if (occurrence.state === "skipped") {
      const current = await this.repository.getOccurrenceView(this.agentId(), occurrence.id);
      if (!current) {
        fail(404, "life-ops occurrence not found");
      }
      return current;
    }
    if (["completed", "expired", "muted"].includes(occurrence.state)) {
      fail(409, `occurrence cannot be skipped from state ${occurrence.state}`);
    }
    const updatedOccurrence: LifeOpsOccurrence = {
      ...occurrence,
      state: "skipped",
      snoozedUntil: null,
      completionPayload: {
        skippedAt: now.toISOString(),
        previousState: occurrence.state,
      },
      updatedAt: now.toISOString(),
    };
    await this.repository.updateOccurrence(updatedOccurrence);
    await this.recordAudit(
      "occurrence_skipped",
      "occurrence",
      updatedOccurrence.id,
      "occurrence skipped",
      {},
      {
        definitionId: updatedOccurrence.definitionId,
        occurrenceKey: updatedOccurrence.occurrenceKey,
      },
    );
    await this.refreshDefinitionOccurrences(definition, now);
    const view = await this.repository.getOccurrenceView(this.agentId(), updatedOccurrence.id);
    if (!view) {
      fail(404, "life-ops occurrence not found after skip");
    }
    return view;
  }

  async snoozeOccurrence(
    occurrenceId: string,
    request: SnoozeLifeOpsOccurrenceRequest,
  ): Promise<LifeOpsOccurrenceView> {
    const now = new Date();
    const { occurrence, definition } = await this.getFreshOccurrence(occurrenceId, now);
    if (["completed", "skipped", "expired", "muted"].includes(occurrence.state)) {
      fail(409, `occurrence cannot be snoozed from state ${occurrence.state}`);
    }
    const snoozedUntil = computeSnoozedUntil(definition, request, now);
    if (snoozedUntil.getTime() <= now.getTime()) {
      fail(400, "snoozedUntil must be in the future");
    }
    const updatedOccurrence: LifeOpsOccurrence = {
      ...occurrence,
      state: "snoozed",
      snoozedUntil: snoozedUntil.toISOString(),
      updatedAt: now.toISOString(),
      metadata: {
        ...occurrence.metadata,
        snoozedAt: now.toISOString(),
        snoozePreset: request.preset ?? null,
      },
    };
    await this.repository.updateOccurrence(updatedOccurrence);
    await this.recordAudit(
      "occurrence_snoozed",
      "occurrence",
      updatedOccurrence.id,
      "occurrence snoozed",
      {
        request,
      },
      {
        snoozedUntil: updatedOccurrence.snoozedUntil,
      },
    );
    const view = await this.repository.getOccurrenceView(this.agentId(), updatedOccurrence.id);
    if (!view) {
      fail(404, "life-ops occurrence not found after snooze");
    }
    return view;
  }
}
