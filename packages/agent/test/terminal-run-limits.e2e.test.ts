import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startApiServer } from "../src/api/server";
import { req } from "../../../test/helpers/http";
import { saveEnv } from "../../../test/helpers/test-utils";

describe("Terminal run validation and limit guards", () => {
  const TEST_CLIENT_ID = "terminal-run-limits-e2e";
  let port: number;
  let close: () => Promise<void>;
  let envBackup: { restore: () => void };

  beforeAll(async () => {
    envBackup = saveEnv(
      "ELIZA_TERMINAL_MAX_CONCURRENT",
      "ELIZA_TERMINAL_MAX_DURATION_MS",
      "ELIZA_TERMINAL_MAX_CONCURRENT",
      "ELIZA_TERMINAL_MAX_DURATION_MS",
    );
    const result = await startApiServer({ port: 0 });
    port = result.port;
    close = result.close;
  });

  beforeEach(async () => {
    await req(port, "PUT", "/api/permissions/shell", { enabled: true });
    delete process.env.ELIZA_TERMINAL_MAX_CONCURRENT;
    delete process.env.ELIZA_TERMINAL_MAX_DURATION_MS;
    delete process.env.ELIZA_TERMINAL_MAX_CONCURRENT;
    delete process.env.ELIZA_TERMINAL_MAX_DURATION_MS;
  });

  afterAll(async () => {
    await close();
    envBackup.restore();
  });

  it("rejects commands longer than 4096 characters", async () => {
    const { status, data } = await req(port, "POST", "/api/terminal/run", {
      command: "x".repeat(4097),
      clientId: TEST_CLIENT_ID,
    });

    expect(status).toBe(400);
    expect(data).toHaveProperty(
      "error",
      "Command exceeds maximum length (4096 chars)",
    );
  });

  it("enforces max concurrent terminal runs", async () => {
    process.env.ELIZA_TERMINAL_MAX_CONCURRENT = "1";

    const first = await req(port, "POST", "/api/terminal/run", {
      command: 'node -e "setTimeout(() => process.exit(0), 1200)"',
      clientId: TEST_CLIENT_ID,
    });
    expect(first.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 60));

    const second = await req(port, "POST", "/api/terminal/run", {
      command: "echo second",
      clientId: TEST_CLIENT_ID,
    });
    expect(second.status).toBe(429);
    expect(second.data.error).toContain("Too many active terminal runs");

    await new Promise((resolve) => setTimeout(resolve, 1300));
  });
});
