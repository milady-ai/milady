export type AppCommandId =
  | "agent.run"
  | "agent.cancel"
  | "settings.open"
  | "updates.check"
  | "notes.search";

export type Permission =
  | "read:user-content"
  | "write:user-content"
  | "network:model-provider"
  | "network:update-host"
  | "system:open-window"
  | "system:apply-update";

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type AppError = {
  code:
    | "invalid-input"
    | "permission-denied"
    | "confirmation-required"
    | "cancelled"
    | "timeout"
    | "model-unavailable"
    | "tool-failed"
    | "internal";
  message: string;
  recoverable: boolean;
};

export type AuditEvent = {
  at: string;
  action: AppCommandId | string;
  decision: "allowed" | "denied" | "confirmed" | "failed";
  permissions: Permission[];
  // Never include raw prompts, transcripts, secrets, or full user documents.
  metadata?: Record<string, string | number | boolean | null>;
};
