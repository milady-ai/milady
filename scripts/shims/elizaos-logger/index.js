const listeners = new Set();

function toConsoleArgs(args) {
  return args.length === 0 ? [""] : args;
}

export const __loggerTestHooks = { __noop: () => {} };

export function addLogListener(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function removeLogListener(listener) {
  listeners.delete(listener);
}

export const customLevels = {
  trace: 10,
  debug: 20,
  success: 27,
  progress: 28,
  log: 29,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

function makeSlug(prefix) {
  return `${prefix}-${Date.now().toString(36)}`;
}

export function logPrompt() {
  return makeSlug("prompt");
}

export function logResponse() {
  return makeSlug("response");
}

export function logChatIn() {
  return makeSlug("chat-in");
}

export function logChatOut() {
  return makeSlug("chat-out");
}

export function createLogger(bindings = {}) {
  const normalizedBindings = typeof bindings === "boolean" ? {} : bindings;
  const log = (level, args) => {
    for (const listener of listeners) {
      try {
        listener({
          time: Date.now(),
          level,
          msg: String(args[0] ?? ""),
          ...normalizedBindings,
        });
      } catch {}
    }
    const method =
      level === "fatal" ? "error" : level === "trace" ? "debug" : level;
    (console[method] ?? console.log)(...toConsoleArgs(args));
  };
  const logger = {
    level: String(normalizedBindings.level ?? "info"),
    trace: (...args) => log("trace", args),
    debug: (...args) => log("debug", args),
    info: (...args) => log("info", args),
    warn: (...args) => log("warn", args),
    error: (...args) => log("error", args),
    fatal: (...args) => log("fatal", args),
    success: (...args) => log("info", args),
    progress: (...args) => log("info", args),
    log: (...args) => log("log", args),
    clear: () => {},
    child: (childBindings = {}) =>
      createLogger({ ...normalizedBindings, ...childBindings }),
  };
  return logger;
}

export const recentLogs = () => "";
export const logger = createLogger();
export const elizaLogger = logger;
export default logger;
