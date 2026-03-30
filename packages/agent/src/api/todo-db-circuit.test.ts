import { describe, expect, it } from "vitest";
import { isFatalTodoDbError, TodoDbCircuitBreaker } from "./todo-db-circuit";

describe("TodoDbCircuitBreaker", () => {
  it("opens only after threshold failures", () => {
    const circuit = new TodoDbCircuitBreaker(2);
    const key = "agent-1";

    expect(circuit.isOpen(key)).toBe(false);
    expect(circuit.open(key)).toBe(false);
    expect(circuit.isOpen(key)).toBe(false);
    expect(circuit.open(key)).toBe(true);
    expect(circuit.isOpen(key)).toBe(true);
    expect(circuit.open(key)).toBe(false);
  });
});

describe("isFatalTodoDbError", () => {
  it("matches known todo table query failure signatures", () => {
    expect(isFatalTodoDbError(new Error('Failed query: select * from "todos"'))).toBe(true);
    expect(isFatalTodoDbError(new Error("relation \"todos\" does not exist"))).toBe(true);
    expect(isFatalTodoDbError(new Error("no such table: todos"))).toBe(true);
    expect(isFatalTodoDbError(new Error("db.select is not a function"))).toBe(true);
  });

  it("ignores non-fatal and non-error values", () => {
    expect(isFatalTodoDbError(new Error("network timeout"))).toBe(false);
    expect(isFatalTodoDbError("failed query")).toBe(false);
    expect(isFatalTodoDbError(null)).toBe(false);
  });
});
