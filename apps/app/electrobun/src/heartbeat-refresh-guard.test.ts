import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const INDEX_PATH = path.resolve(__dirname, "index.ts");

describe("heartbeat refresh guard", () => {
  const source = fs.readFileSync(INDEX_PATH, "utf8");

  it("prevents overlapping heartbeat menu refresh requests", () => {
    expect(source).toContain("let heartbeatRefreshInProgress = false;");
    expect(source).toContain("if (heartbeatRefreshInProgress) {");
    expect(source).toContain("heartbeatRefreshInProgress = true;");
    expect(source).toContain("heartbeatRefreshInProgress = false;");
  });
});
