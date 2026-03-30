import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ELIZA_PATH = path.resolve(__dirname, "eliza.ts");

describe("server-only signal cleanup guard", () => {
  const source = fs.readFileSync(ELIZA_PATH, "utf8");

  it("prevents duplicate cleanup when SIGINT/SIGTERM fire repeatedly", () => {
    expect(source).toContain("let isCleaningUp = false;");
    expect(source).toContain("if (isCleaningUp) {");
    expect(source).toContain("isCleaningUp = true;");
  });
});
