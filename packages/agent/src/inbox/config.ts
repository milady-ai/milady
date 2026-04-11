import { loadElizaConfig } from "../config/config.js";
import type { InboxTriageConfig } from "./types.js";

/**
 * Load inbox triage configuration from the agent config file.
 * Falls back to sensible defaults when not configured.
 */
export function loadInboxTriageConfig(): InboxTriageConfig {
  try {
    const cfg = loadElizaConfig();
    const raw = cfg.agents?.defaults?.inboxTriage as
      | InboxTriageConfig
      | undefined;
    if (raw && typeof raw === "object") {
      return { ...DEFAULT_CONFIG, ...raw };
    }
  } catch {
    // Config loading failed; use defaults
  }
  return { ...DEFAULT_CONFIG };
}

const DEFAULT_CONFIG: InboxTriageConfig = {
  enabled: false,
  triageCron: "0 * * * *",
  digestCron: "0 8 * * *",
  digestTimezone: undefined,
  channels: [
    "discord",
    "telegram",
    "signal",
    "imessage",
    "whatsapp",
    "gmail",
  ],
  prioritySenders: [],
  priorityChannels: [],
  autoReply: {
    enabled: false,
    confidenceThreshold: 0.85,
    senderWhitelist: [],
    channelWhitelist: [],
    maxAutoRepliesPerHour: 5,
  },
  triageRules: {
    alwaysUrgent: [],
    alwaysIgnore: [],
    alwaysNotify: [],
  },
  digestDeliveryChannel: "client_chat",
  retentionDays: 30,
};
