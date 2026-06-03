export type LogFn = (
  obj: Record<string, unknown> | string | Error,
  msg?: string,
  ...args: unknown[]
) => void;

export interface Logger {
  level: string;
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal: LogFn;
  success: LogFn;
  progress: LogFn;
  log: LogFn;
  clear: () => void;
  child: (bindings: Record<string, unknown>) => Logger;
}

export interface LoggerBindings extends Record<string, unknown> {
  level?: string;
  namespace?: string;
  namespaces?: string[];
  maxMemoryLogs?: number;
  __forceType?: "browser" | "node";
}

export interface LogEntry {
  time: number;
  level?: number | string;
  msg: string;
  agentName?: string;
  agentId?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export type LogListener = (entry: LogEntry) => void;

export const __loggerTestHooks: { __noop: () => void };
export function addLogListener(listener: LogListener): () => void;
export function removeLogListener(listener: LogListener): void;
export const customLevels: Record<string, number>;
export function logPrompt(
  modelType: string,
  prompt: string,
  metadata?: {
    agentName?: string;
    agentId?: string;
    runId?: string;
    provider?: string;
    caller?: string;
    [key: string]: unknown;
  },
): string;
export function logResponse(
  modelType: string,
  response: string,
  metadata?: {
    agentName?: string;
    agentId?: string;
    runId?: string;
    provider?: string;
    duration?: number;
    promptSlug?: string;
    [key: string]: unknown;
  },
): string;
export function logChatIn(params: {
  agentName: string;
  agentId: string;
  roomId: string;
  messageId: string;
  text: string;
  source?: string;
}): string;
export function logChatOut(params: {
  agentName: string;
  agentId: string;
  roomId: string;
  action: string;
  text?: string;
  emoji?: string;
  providers?: string[];
  reasoning?: string;
  actions?: string[];
}): string;
export function createLogger(bindings?: LoggerBindings | boolean): Logger;
export const recentLogs: () => string;
export const logger: Logger;
export const elizaLogger: Logger;
export default logger;
