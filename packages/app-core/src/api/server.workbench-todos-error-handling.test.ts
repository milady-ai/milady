import { describe, expect, it } from "vitest";

describe("handleTaskBackedWorkbenchTodoRoute error handling", () => {
  it("wraps runtime task operations in an operation-specific 500 handler", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const serverPath = path.resolve(import.meta.dirname, "server.ts");
    const source = fs.readFileSync(serverPath, "utf-8");

    const handlerIdx = source.indexOf(
      "async function handleTaskBackedWorkbenchTodoRoute",
    );
    expect(handlerIdx).toBeGreaterThan(-1);

    const nearbyCode = source.slice(handlerIdx, handlerIdx + 12000);
    expect(nearbyCode).toContain('let operation = "route"');
    expect(nearbyCode).toContain("catch (err)");
    expect(nearbyCode).toContain("`[workbench/todos] ${operation} failed:");
    expect(nearbyCode).toContain(
      "sendJsonErrorResponse(res, 500, `Failed to ${operation}`)",
    );
  });
});
