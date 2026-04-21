import type { IAgentRuntime, UUID } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { loadElizaConfig } from "../config/config.js";
import {
  loadOwnerContactRoutingHints,
  loadOwnerContactsConfig,
  type OwnerContactRoutingHint,
  resolveOwnerContactWithFallback,
} from "../config/owner-contacts.js";
import type {
  EscalationConfig,
  OwnerContactEntry,
  OwnerContactsConfig,
} from "../config/types.agent-defaults.js";
import { resolveOwnerEntityId } from "../runtime/owner-entity.js";
import {
  hasRuntimeSendHandler,
  logMissingSendHandlerOnce,
} from "./send-handler-availability.js";

export interface EscalationState {
  id: string;
  reason: string;
  text: string;
  currentStep: number;
  channelsSent: string[];
  startedAt: number;
  lastSentAt: number;
  resolved: boolean;
  resolvedAt?: number;
}

const DEFAULT_CHANNELS: string[] = ["client_chat"];
const DEFAULT_WAIT_MINUTES = 5;
const DEFAULT_MAX_RETRIES = 3;

const activeEscalations = new Map<string, EscalationState>();
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function loadEscalationConfig(): EscalationConfig {
  try {
    const cfg = loadElizaConfig();
    return cfg.agents?.defaults?.escalation ?? {};
  } catch {
    return {};
  }
}

function loadOwnerContacts(): OwnerContactsConfig {
  return loadOwnerContactsConfig({
    boundary: "escalation",
    operation: "owner_contacts_config",
    message:
      "[escalation] Failed to load owner contacts config; escalation delivery has no configured owner channels.",
  });
}

function resolveChannels(config: EscalationConfig): string[] {
  const channels = config.channels;
  return Array.isArray(channels) && channels.length > 0
    ? channels
    : DEFAULT_CHANNELS;
}

function resolveWaitMs(config: EscalationConfig): number {
  const mins =
    typeof config.waitMinutes === "number" && config.waitMinutes > 0
      ? config.waitMinutes
      : DEFAULT_WAIT_MINUTES;
  return mins * 60_000;
}

function resolveMaxRetries(config: EscalationConfig): number {
  return typeof config.maxRetries === "number" && config.maxRetries > 0
    ? config.maxRetries
    : DEFAULT_MAX_RETRIES;
}

async function sendToChannel(
  runtime: IAgentRuntime,
  channel: string,
  text: string,
  ownerContacts: OwnerContactsConfig,
  routingHints: Record<string, OwnerContactRoutingHint>,
  ownerEntityId: string | null,
): Promise<boolean> {
  const hint = routingHints[channel] ?? null;
  const resolvedContact =
    resolveOwnerContactWithFallback({
      ownerContacts,
      source: channel,
      ownerEntityId,
    }) ??
    (hint
      ? resolveOwnerContactWithFallback({
          ownerContacts,
          source: hint.source,
          ownerEntityId,
        })
      : null);
  const contact: OwnerContactEntry | undefined =
    resolvedContact?.contact ??
    (hint
      ? {
          entityId: hint.entityId ?? undefined,
          channelId: hint.channelId ?? undefined,
          roomId: hint.roomId ?? undefined,
        }
      : undefined);
  if (!contact) {
    logger.warn(
      `[escalation] No owner contact configured for channel "${channel}"`,
    );
    return false;
  }

  try {
    const targetSource = resolvedContact?.source ?? channel;
    if (
      targetSource === "client_chat" &&
      !hasRuntimeSendHandler(runtime, targetSource)
    ) {
      logMissingSendHandlerOnce("escalation", targetSource);
      return false;
    }

    await runtime.sendMessageToTarget(
      {
        source: targetSource,
        entityId: contact.entityId as UUID | undefined,
        channelId: contact.channelId,
        roomId: contact.roomId as UUID | undefined,
      } as Parameters<typeof runtime.sendMessageToTarget>[0],
      {
        text,
        source: targetSource,
        metadata: {
          urgency: "urgent",
          escalation: true,
          routeSource: targetSource,
          routeResolution: hint?.resolvedFrom ?? "config",
          routeEndpoint:
            contact.channelId ?? contact.roomId ?? contact.entityId ?? null,
          routeLastResponseAt: hint?.lastResponseAt ?? null,
          routeLastResponseChannel: hint?.lastResponseChannel ?? null,
        },
      },
    );
    return true;
  } catch (err) {
    logger.warn(
      `[escalation] Failed to send to channel "${channel}"`,
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}

async function ownerRespondedSince(
  runtime: IAgentRuntime,
  ownerContacts: OwnerContactsConfig,
  routingHints: Record<string, OwnerContactRoutingHint>,
  ownerEntityId: string | null,
  sinceTimestamp: number,
): Promise<boolean> {
  const entityIds = new Set<string>();
  if (ownerEntityId) {
    entityIds.add(ownerEntityId);
  }
  for (const contact of Object.values(ownerContacts)) {
    if (contact.entityId) entityIds.add(contact.entityId);
  }
  for (const hint of Object.values(routingHints)) {
    if (hint.entityId) entityIds.add(hint.entityId);
  }

  for (const entityId of entityIds) {
    try {
      const rooms = await runtime.getRoomsForParticipant(entityId as UUID);
      if (!rooms || rooms.length === 0) continue;

      const messages = await runtime.getMemoriesByRoomIds({
        roomIds: rooms as UUID[],
        tableName: "messages",
        limit: 20,
      });

      const ownerMessage = messages.find(
        (m) =>
          m.entityId === entityId &&
          m.createdAt != null &&
          m.createdAt > sinceTimestamp,
      );
      if (ownerMessage) return true;
    } catch (err) {
      logger.debug(
        `[escalation] Error checking owner response for entity ${entityId}`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return false;
}

function scheduleCheck(
  runtime: IAgentRuntime,
  escalationId: string,
  delayMs: number,
): void {
  const existing = pendingTimers.get(escalationId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    pendingTimers.delete(escalationId);
    try {
      await EscalationService.checkEscalation(runtime, escalationId);
    } catch (err) {
      logger.error(
        "[escalation] Scheduled check failed",
        err instanceof Error ? err.message : String(err),
      );
    }
  }, delayMs);

  pendingTimers.set(escalationId, timer);
}

let idCounter = 0;

export class EscalationService {
  static async startEscalation(
    runtime: IAgentRuntime,
    reason: string,
    text: string,
  ): Promise<EscalationState> {
    const existing = EscalationService.getActiveEscalationSync();
    if (existing) {
      existing.reason = `${existing.reason}; ${reason}`;
      existing.text = `${existing.text}\n---\n${text}`;
      logger.info(
        `[escalation] Coalesced into active escalation ${existing.id}`,
      );
      return existing;
    }

    const config = loadEscalationConfig();
    const channels = resolveChannels(config);
    const ownerContacts = loadOwnerContacts();
    const routingHints = await loadOwnerContactRoutingHints(
      runtime,
      ownerContacts,
    );
    const ownerEntityId = await resolveOwnerEntityId(runtime);
    const waitMs = resolveWaitMs(config);

    idCounter += 1;
    const escalationId = `esc-${Date.now()}-${idCounter}`;
    const now = Date.now();

    const state: EscalationState = {
      id: escalationId,
      reason,
      text,
      currentStep: 0,
      channelsSent: [],
      startedAt: now,
      lastSentAt: now,
      resolved: false,
    };

    activeEscalations.set(escalationId, state);

    const firstChannel = channels[0];
    if (firstChannel) {
      const sent = await sendToChannel(
        runtime,
        firstChannel,
        text,
        ownerContacts,
        routingHints,
        ownerEntityId,
      );
      if (sent) {
        state.channelsSent.push(firstChannel);
      }
    }

    const maxRetries = resolveMaxRetries(config);
    if (channels.length > 1 || maxRetries > 1) {
      scheduleCheck(runtime, escalationId, waitMs);
    }

    logger.info(
      `[escalation] Started ${escalationId}: channel=${channels[0]}, reason="${reason}"`,
    );

    return state;
  }

  static async checkEscalation(
    runtime: IAgentRuntime,
    escalationId: string,
  ): Promise<void> {
    const state = activeEscalations.get(escalationId);
    if (!state || state.resolved) return;

    const config = loadEscalationConfig();
    const channels = resolveChannels(config);
    const ownerContacts = loadOwnerContacts();
    const routingHints = await loadOwnerContactRoutingHints(
      runtime,
      ownerContacts,
    );
    const ownerEntityId = await resolveOwnerEntityId(runtime);
    const maxRetries = resolveMaxRetries(config);
    const waitMs = resolveWaitMs(config);

    const responded = await ownerRespondedSince(
      runtime,
      ownerContacts,
      routingHints,
      ownerEntityId,
      state.lastSentAt,
    );

    if (responded) {
      EscalationService.resolveEscalation(escalationId);
      return;
    }

    state.currentStep += 1;

    if (state.currentStep >= maxRetries) {
      logger.warn(
        `[escalation] ${escalationId}: max retries (${maxRetries}) reached — giving up`,
      );
      state.resolved = true;
      state.resolvedAt = Date.now();
      return;
    }

    const nextChannelIndex = state.currentStep % channels.length;
    const nextChannel = channels[nextChannelIndex];
    if (nextChannel) {
      const sent = await sendToChannel(
        runtime,
        nextChannel,
        state.text,
        ownerContacts,
        routingHints,
        ownerEntityId,
      );
      if (sent) {
        state.channelsSent.push(nextChannel);
      }
      state.lastSentAt = Date.now();
    }

    if (state.currentStep + 1 < maxRetries) {
      scheduleCheck(runtime, escalationId, waitMs);
    }
  }

  static resolveEscalation(escalationId: string): void {
    const state = activeEscalations.get(escalationId);
    if (!state || state.resolved) return;

    state.resolved = true;
    state.resolvedAt = Date.now();

    const timer = pendingTimers.get(escalationId);
    if (timer) {
      clearTimeout(timer);
      pendingTimers.delete(escalationId);
    }

    logger.info(`[escalation] Resolved ${escalationId}`);
  }

  static getActiveEscalationSync(): EscalationState | null {
    for (const state of activeEscalations.values()) {
      if (!state.resolved) return state;
    }
    return null;
  }

  static async getActiveEscalation(
    _runtime: IAgentRuntime,
  ): Promise<EscalationState | null> {
    return EscalationService.getActiveEscalationSync();
  }

  static _reset(): void {
    for (const timer of pendingTimers.values()) clearTimeout(timer);
    pendingTimers.clear();
    activeEscalations.clear();
    idCounter = 0;
  }
}
