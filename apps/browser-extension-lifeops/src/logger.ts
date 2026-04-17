/**
 * Browser-safe structured logger shim.
 *
 * The elizaOS runtime logger is Node-only. This extension runs inside a
 * service worker / content script / popup, so we use a small structured
 * shim that writes JSON lines to the host console. All log entries go
 * through this module — direct console usage is disallowed per project
 * conventions (CLAUDE.md commandment 9).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  readonly [key: string]: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let minLevel: LogLevel = "info";

export function setMinLevel(level: LogLevel): void {
  minLevel = level;
}

function shouldEmit(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function emit(
  level: LogLevel,
  scope: string,
  message: string,
  fields?: LogFields,
): void {
  if (!shouldEmit(level)) {
    return;
  }
  const entry = {
    level,
    scope,
    message,
    ts: new Date().toISOString(),
    ...(fields ?? {}),
  };
  // eslint-disable-next-line no-console -- this module is the sole wrapper around console
  const sink =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  sink(`[${scope}] ${message}`, entry);
}

export interface ScopedLogger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export function createLogger(scope: string): ScopedLogger {
  return {
    debug: (message, fields) => emit("debug", scope, message, fields),
    info: (message, fields) => emit("info", scope, message, fields),
    warn: (message, fields) => emit("warn", scope, message, fields),
    error: (message, fields) => emit("error", scope, message, fields),
  };
}
