export function isFatalTodoDbError(err: unknown): boolean {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!message) return false;
  return /Failed query|relation .*todos|no such table|does not exist/i.test(
    message,
  );
}

export class TodoDbCircuitBreaker {
  private readonly disabledRuntimeKeys = new Set<string>();

  isOpen(runtimeKey: string): boolean {
    return this.disabledRuntimeKeys.has(runtimeKey);
  }

  open(runtimeKey: string): boolean {
    if (this.disabledRuntimeKeys.has(runtimeKey)) return false;
    this.disabledRuntimeKeys.add(runtimeKey);
    return true;
  }
}
