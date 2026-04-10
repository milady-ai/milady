import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const APP_DIR = path.resolve(TEST_DIR, "../..");
const MAIN_PATH = path.join(APP_DIR, "src", "main.tsx");

describe("app main deep links", () => {
  it("routes LifeOps returns and listens for desktop deep-link bridge events", () => {
    const source = readFileSync(MAIN_PATH, "utf8");

    expect(source).toContain('"lifeops"');
    expect(source).toContain("dispatchQueuedLifeOpsGithubCallbackFromUrl");
    expect(source).toContain('rpcMessage: "shareTargetReceived"');
    expect(source).toContain("handleDeepLink(url)");
  });
});
