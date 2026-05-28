/**
 * Audit emit shim for SecureStore + related client-side privileged
 * operations.
 *
 * The full audit dispatcher lives in `@elizaos/security` and runs in the
 * host process (Electrobun bun, or the agent runtime). The client cannot
 * import it directly because dispatcher fan-out includes server-side
 * sinks. Instead the client serializes a structured envelope and forwards
 * it to the host through a single well-known callback (or, in headless
 * tests, a no-op).
 *
 * Hosts wire this by calling `setClientAuditEmitter` once at boot with a
 * function that forwards to the real `@elizaos/security` dispatcher with
 * `actor = { kind: "user", id: <currentUserId> }`.
 *
 * SOC2 refs: CC6.1, CC7.2.
 */

export type ClientAuditAction =
  | "secret.access"
  | "secret.create"
  | "secret.update"
  | "secret.delete"
  | "vision.allowed"
  | "vision.denied"
  | "agent.spawn"
  | "agent.terminate"
  | "plugin.denied"
  | "auth.session.revoke"
  | "kms.key.access";

export interface ClientAuditEvent {
  action: ClientAuditAction;
  result: "success" | "failure" | "denied";
  metadata?: Record<string, string | number | boolean>;
  resource?: { type: string; id: string };
}

export type ClientAuditEmitter = (event: ClientAuditEvent) => void;

let emitter: ClientAuditEmitter | null = null;

export function setClientAuditEmitter(fn: ClientAuditEmitter | null): void {
  emitter = fn;
}

export function emitClientAudit(event: ClientAuditEvent): void {
  if (!emitter) {
    // No host wired — silently no-op. Tests assert via override.
    return;
  }
  try {
    emitter(event);
  } catch {
    // Audit emit must never throw into product code paths. The host-side
    // dispatcher is responsible for its own observability.
  }
}
