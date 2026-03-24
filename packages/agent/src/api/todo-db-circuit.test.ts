import { describe, expect, it } from "vitest";
import { isFatalTodoDbError, TodoDbCircuitBreaker } from "./todo-db-circuit";

describe("isFatalTodoDbError", () => {
  it("detects common todo table query failures", () => {
    expect(
      isFatalTodoDbError(
        new Error('Failed query: select * from "todos" where id = $1'),
      ),
    ).toBe(true);
    expect(
      isFatalTodoDbError(new Error('relation "todos" does not exist')),
    ).toBe(true);
    expect(isFatalTodoDbError(new Error("no such table: todos"))).toBe(true);
  });

  it("ignores non-fatal/unrelated errors", () => {
    expect(isFatalTodoDbError(new Error("network timeout"))).toBe(false);
    expect(isFatalTodoDbError("")).toBe(false);
    expect(isFatalTodoDbError(null)).toBe(false);
  });
});

describe("TodoDbCircuitBreaker", () => {
  it("opens once per runtime key", () => {
    const breaker = new TodoDbCircuitBreaker();
    expect(breaker.isOpen("a")).toBe(false);
    expect(breaker.open("a")).toBe(true);
    expect(breaker.isOpen("a")).toBe(true);
    expect(breaker.open("a")).toBe(false);
  });
});
