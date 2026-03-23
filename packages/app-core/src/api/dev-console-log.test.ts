import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isAllowedDevConsoleLogPath,
  readDevConsoleLogTail,
} from "./dev-console-log.js";

describe("dev-console-log", () => {
  it("isAllowedDevConsoleLogPath requires basename and .milady parent", () => {
    expect(isAllowedDevConsoleLogPath("/tmp/desktop-dev-console.log")).toBe(
      false,
    );
    expect(
      isAllowedDevConsoleLogPath("/tmp/.milady/desktop-dev-console.log"),
    ).toBe(true);
    expect(
      isAllowedDevConsoleLogPath("/repo/.milady/desktop-dev-console.log"),
    ).toBe(true);
    expect(
      isAllowedDevConsoleLogPath("/tmp/.evil/desktop-dev-console.log"),
    ).toBe(false);
    expect(
      isAllowedDevConsoleLogPath(
        "/repo/.milady/subdir/desktop-dev-console.log",
      ),
    ).toBe(false);
    expect(isAllowedDevConsoleLogPath("/etc/passwd")).toBe(false);
  });

  it("readDevConsoleLogTail returns last lines within byte budget", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-dev-log-"));
    const file = path.join(dir, "desktop-dev-console.log");
    const lines = Array.from({ length: 50 }, (_, i) => `line-${i}`);
    fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
    const r = readDevConsoleLogTail(file, { maxLines: 5, maxBytes: 10_000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body).toContain("line-49");
      expect(r.body).toContain("line-45");
      expect(r.body).not.toContain("line-0");
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
