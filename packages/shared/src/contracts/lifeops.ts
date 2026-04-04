export const LIFEOPS_TIME_WINDOW_NAMES = [
  "morning",
  "afternoon",
  "evening",
  "night",
  "custom",
] as const;

export type LifeOpsTimeWindowName = (typeof LIFEOPS_TIME_WINDOW_NAMES)[number];

export const LIFEOPS_DEFINITION_KINDS = ["task", "habit", "routine"] as const;
export type LifeOpsDefinitionKind = (typeof LIFEOPS_DEFINITION_KINDS)[number];

export const LIFEOPS_DEFINITION_STATUSES = [
  "active",
  "paused",
  "archived",
] as const;
export type LifeOpsDefinitionStatus =
  (typeof LIFEOPS_DEFINITION_STATUSES)[number];

export const LIFEOPS_OCCURRENCE_STATES = [
  "pending",
  "visible",
  "snoozed",
  "completed",
  "skipped",
  "expired",
  "muted",
] as const;
export type LifeOpsOccurrenceState =
  (typeof LIFEOPS_OCCURRENCE_STATES)[number];

export const LIFEOPS_GOAL_STATUSES = [
  "active",
  "paused",
  "archived",
  "satisfied",
] as const;
export type LifeOpsGoalStatus = (typeof LIFEOPS_GOAL_STATUSES)[number];

export const LIFEOPS_REVIEW_STATES = [
  "idle",
  "needs_attention",
  "on_track",
  "at_risk",
] as const;
export type LifeOpsGoalReviewState = (typeof LIFEOPS_REVIEW_STATES)[number];

export const LIFEOPS_WORKFLOW_STATUSES = [
  "active",
  "paused",
  "archived",
] as const;
export type LifeOpsWorkflowStatus = (typeof LIFEOPS_WORKFLOW_STATUSES)[number];

export const LIFEOPS_WORKFLOW_RUN_STATUSES = [
  "queued",
  "running",
  "success",
  "failed",
  "cancelled",
] as const;
export type LifeOpsWorkflowRunStatus =
  (typeof LIFEOPS_WORKFLOW_RUN_STATUSES)[number];

export const LIFEOPS_CONNECTOR_PROVIDERS = [
  "google",
  "x",
  "telegram",
  "discord",
  "twilio",
  "signal",
  "whatsapp",
  "imessage",
] as const;
export type LifeOpsConnectorProvider =
  (typeof LIFEOPS_CONNECTOR_PROVIDERS)[number];

export const LIFEOPS_CONNECTOR_MODES = ["local", "remote"] as const;
export type LifeOpsConnectorMode = (typeof LIFEOPS_CONNECTOR_MODES)[number];

export const LIFEOPS_REMINDER_CHANNELS = [
  "in_app",
  "sms",
  "voice",
  "telegram",
  "discord",
  "signal",
  "whatsapp",
  "imessage",
] as const;
export type LifeOpsReminderChannel =
  (typeof LIFEOPS_REMINDER_CHANNELS)[number];

export const LIFEOPS_CHANNEL_TYPES = [
  "in_app",
  "sms",
  "voice",
  "telegram",
  "discord",
  "signal",
  "whatsapp",
  "imessage",
  "x",
  "browser",
] as const;
export type LifeOpsChannelType = (typeof LIFEOPS_CHANNEL_TYPES)[number];

export const LIFEOPS_PRIVACY_CLASSES = ["private", "shared", "public"] as const;
export type LifeOpsPrivacyClass = (typeof LIFEOPS_PRIVACY_CLASSES)[number];

export const LIFEOPS_OWNER_TYPES = [
  "definition",
  "occurrence",
  "goal",
  "workflow",
  "calendar_event",
] as const;
export type LifeOpsOwnerType = (typeof LIFEOPS_OWNER_TYPES)[number];

export const LIFEOPS_AUDIT_EVENT_TYPES = [
  "definition_created",
  "definition_updated",
  "occurrence_generated",
  "occurrence_completed",
  "occurrence_skipped",
  "occurrence_snoozed",
  "goal_created",
  "goal_updated",
  "reminder_due",
  "reminder_delivered",
  "workflow_created",
  "workflow_run",
  "connector_grant_updated",
  "channel_policy_updated",
] as const;
export type LifeOpsAuditEventType =
  (typeof LIFEOPS_AUDIT_EVENT_TYPES)[number];

export const LIFEOPS_ACTORS = ["agent", "user", "workflow", "connector"] as const;
export type LifeOpsActor = (typeof LIFEOPS_ACTORS)[number];

export interface LifeOpsTimeWindowDefinition {
  name: LifeOpsTimeWindowName;
  label: string;
  startMinute: number;
  endMinute: number;
}

export interface LifeOpsWindowPolicy {
  timezone: string;
  windows: LifeOpsTimeWindowDefinition[];
}

export interface LifeOpsDailySlot {
  key: string;
  label: string;
  minuteOfDay: number;
  durationMinutes: number;
}

export type LifeOpsCadence =
  | {
      kind: "once";
      dueAt: string;
      visibilityLeadMinutes?: number;
      visibilityLagMinutes?: number;
    }
  | {
      kind: "daily";
      windows: LifeOpsTimeWindowName[];
      visibilityLeadMinutes?: number;
      visibilityLagMinutes?: number;
    }
  | {
      kind: "times_per_day";
      slots: LifeOpsDailySlot[];
      visibilityLeadMinutes?: number;
      visibilityLagMinutes?: number;
    }
  | {
      kind: "weekly";
      weekdays: number[];
      windows: LifeOpsTimeWindowName[];
      visibilityLeadMinutes?: number;
      visibilityLagMinutes?: number;
    };

export type LifeOpsProgressionRule =
  | {
      kind: "none";
    }
  | {
      kind: "linear_increment";
      metric: string;
      start: number;
      step: number;
      unit?: string;
    };

export interface LifeOpsReminderStep {
  channel: LifeOpsReminderChannel;
  offsetMinutes: number;
  label: string;
}

export interface LifeOpsReminderPlan {
  id: string;
  agentId: string;
  ownerType: LifeOpsOwnerType;
  ownerId: string;
  steps: LifeOpsReminderStep[];
  mutePolicy: Record<string, unknown>;
  quietHours: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LifeOpsTaskDefinition {
  id: string;
  agentId: string;
  kind: LifeOpsDefinitionKind;
  title: string;
  description: string;
  originalIntent: string;
  timezone: string;
  status: LifeOpsDefinitionStatus;
  priority: number;
  cadence: LifeOpsCadence;
  windowPolicy: LifeOpsWindowPolicy;
  progressionRule: LifeOpsProgressionRule;
  reminderPlanId: string | null;
  goalId: string | null;
  source: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LifeOpsOccurrence {
  id: string;
  agentId: string;
  definitionId: string;
  occurrenceKey: string;
  scheduledAt: string | null;
  dueAt: string | null;
  relevanceStartAt: string;
  relevanceEndAt: string;
  windowName: string | null;
  state: LifeOpsOccurrenceState;
  snoozedUntil: string | null;
  completionPayload: Record<string, unknown> | null;
  derivedTarget: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LifeOpsOccurrenceView extends LifeOpsOccurrence {
  definitionKind: LifeOpsDefinitionKind;
  definitionStatus: LifeOpsDefinitionStatus;
  title: string;
  description: string;
  priority: number;
  timezone: string;
  source: string;
  goalId: string | null;
}

export interface LifeOpsGoalDefinition {
  id: string;
  agentId: string;
  title: string;
  description: string;
  cadence: Record<string, unknown> | null;
  supportStrategy: Record<string, unknown>;
  successCriteria: Record<string, unknown>;
  status: LifeOpsGoalStatus;
  reviewState: LifeOpsGoalReviewState;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LifeOpsGoalLink {
  id: string;
  agentId: string;
  goalId: string;
  linkedType: LifeOpsOwnerType;
  linkedId: string;
  createdAt: string;
}

export interface LifeOpsWorkflowDefinition {
  id: string;
  agentId: string;
  title: string;
  triggerType: string;
  schedule: Record<string, unknown>;
  actionPlan: Record<string, unknown>;
  permissionPolicy: Record<string, unknown>;
  status: LifeOpsWorkflowStatus;
  createdBy: LifeOpsActor;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LifeOpsWorkflowRun {
  id: string;
  agentId: string;
  workflowId: string;
  startedAt: string;
  finishedAt: string | null;
  status: LifeOpsWorkflowRunStatus;
  result: Record<string, unknown>;
  auditRef: string | null;
}

export interface LifeOpsReminderAttempt {
  id: string;
  agentId: string;
  planId: string;
  ownerType: LifeOpsOwnerType;
  ownerId: string;
  occurrenceId: string | null;
  channel: LifeOpsReminderChannel;
  stepIndex: number;
  scheduledFor: string;
  attemptedAt: string | null;
  outcome: string;
  connectorRef: string | null;
  deliveryMetadata: Record<string, unknown>;
}

export interface LifeOpsConnectorGrant {
  id: string;
  agentId: string;
  provider: LifeOpsConnectorProvider;
  identity: Record<string, unknown>;
  grantedScopes: string[];
  capabilities: string[];
  tokenRef: string | null;
  mode: LifeOpsConnectorMode;
  metadata: Record<string, unknown>;
  lastRefreshAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LifeOpsChannelPolicy {
  id: string;
  agentId: string;
  channelType: LifeOpsChannelType;
  channelRef: string;
  privacyClass: LifeOpsPrivacyClass;
  allowReminders: boolean;
  allowEscalation: boolean;
  allowPosts: boolean;
  requireConfirmationForActions: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LifeOpsAuditEvent {
  id: string;
  agentId: string;
  eventType: LifeOpsAuditEventType;
  ownerType: LifeOpsOwnerType;
  ownerId: string;
  reason: string;
  inputs: Record<string, unknown>;
  decision: Record<string, unknown>;
  actor: LifeOpsActor;
  createdAt: string;
}

export interface LifeOpsActiveReminderView {
  occurrenceId: string;
  definitionId: string;
  title: string;
  channel: LifeOpsReminderChannel;
  stepIndex: number;
  stepLabel: string;
  scheduledFor: string;
  dueAt: string | null;
  state: LifeOpsOccurrenceState;
}

export interface LifeOpsOverviewSummary {
  activeOccurrenceCount: number;
  overdueOccurrenceCount: number;
  snoozedOccurrenceCount: number;
  activeReminderCount: number;
  activeGoalCount: number;
}

export interface LifeOpsOverview {
  occurrences: LifeOpsOccurrenceView[];
  goals: LifeOpsGoalDefinition[];
  reminders: LifeOpsActiveReminderView[];
  summary: LifeOpsOverviewSummary;
}

export interface CreateLifeOpsDefinitionRequest {
  kind: LifeOpsDefinitionKind;
  title: string;
  description?: string;
  originalIntent?: string;
  timezone?: string;
  priority?: number;
  cadence: LifeOpsCadence;
  windowPolicy?: LifeOpsWindowPolicy;
  progressionRule?: LifeOpsProgressionRule;
  reminderPlan?: {
    steps: LifeOpsReminderStep[];
    mutePolicy?: Record<string, unknown>;
    quietHours?: Record<string, unknown>;
  } | null;
  goalId?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateLifeOpsDefinitionRequest {
  title?: string;
  description?: string;
  originalIntent?: string;
  timezone?: string;
  priority?: number;
  cadence?: LifeOpsCadence;
  windowPolicy?: LifeOpsWindowPolicy;
  progressionRule?: LifeOpsProgressionRule;
  status?: LifeOpsDefinitionStatus;
  reminderPlan?: {
    steps: LifeOpsReminderStep[];
    mutePolicy?: Record<string, unknown>;
    quietHours?: Record<string, unknown>;
  } | null;
  goalId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateLifeOpsGoalRequest {
  title: string;
  description?: string;
  cadence?: Record<string, unknown> | null;
  supportStrategy?: Record<string, unknown>;
  successCriteria?: Record<string, unknown>;
  status?: LifeOpsGoalStatus;
  reviewState?: LifeOpsGoalReviewState;
  metadata?: Record<string, unknown>;
}

export interface UpdateLifeOpsGoalRequest {
  title?: string;
  description?: string;
  cadence?: Record<string, unknown> | null;
  supportStrategy?: Record<string, unknown>;
  successCriteria?: Record<string, unknown>;
  status?: LifeOpsGoalStatus;
  reviewState?: LifeOpsGoalReviewState;
  metadata?: Record<string, unknown>;
}

export interface SnoozeLifeOpsOccurrenceRequest {
  minutes?: number;
  preset?: "15m" | "30m" | "1h" | "tonight" | "tomorrow_morning";
}

export interface CompleteLifeOpsOccurrenceRequest {
  note?: string;
  metadata?: Record<string, unknown>;
}
