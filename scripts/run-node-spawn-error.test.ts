import { describe, expect, it, vi } from "vitest";

describe("spawn error handler pattern", () => {
  it("calls process.exit when spawn emits error", () => {
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit called");
    });
    const { EventEmitter } = require("node:events");
    const child = new EventEmitter();

    child.on("error", (err: Error) => {
      process.exit(1);
    });

    expect(() => child.emit("error", new Error("spawn ENOENT"))).toThrow(
      "exit called",
    );
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
