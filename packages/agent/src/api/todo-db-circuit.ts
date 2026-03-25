export class TodoDbCircuitBreaker {
  private readonly failures = new Map<string, number>();
  private readonly openKeys = new Set<string>();
  private readonly threshold: number;

  constructor(threshold = 2) {
    this.threshold = threshold;
  }

  isOpen(runtimeKey: string): boolean {
    return this.openKeys.has(runtimeKey);
  }

  open(runtimeKey: string): boolean {
    const count = (this.failures.get(runtimeKey) ?? 0) + 1;
    this.failures.set(runtimeKey, count);
    if (count < this.threshold) return false;
    if (this.openKeys.has(runtimeKey)) return false;
    this.openKeys.add(runtimeKey);
    return true;
  }
}

export function isFatalTodoDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("failed query") ||
    msg.includes('from "todos"') ||
    msg.includes('relation "todos"') ||
    msg.includes("no such table") ||
    msg.includes("db.select")
  );
}
