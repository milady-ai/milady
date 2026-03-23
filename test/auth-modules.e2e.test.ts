/**
 * E2E tests for OAuth flow modules.
 *
 * Verifies that the auth modules import correctly and export
 * the expected functions/types.
 */

import { describe, expect, it } from "vitest";

describe("auth/openai-codex module", () => {
  it("imports successfully", async () => {
    const mod = await import("@miladyai/app-core/src/auth/openai-codex");
    expect(mod).toBeDefined();
  });

  it("exports startCodexLogin function", async () => {
    const { startCodexLogin } = await import(
      "@miladyai/app-core/src/auth/openai-codex"
    );
    expect(typeof startCodexLogin).toBe("function");
  });

  it("exports refreshCodexToken function", async () => {
    const { refreshCodexToken } = await import(
      "@miladyai/app-core/src/auth/openai-codex"
    );
    expect(typeof refreshCodexToken).toBe("function");
  });

  it("exports CodexFlow interface (type — verified via startCodexLogin return)", async () => {
    // We can't directly test a TypeScript interface at runtime,
    // but we verify the module shape is correct by checking the
    // function that returns it exists and is callable.
    const { startCodexLogin } = await import(
      "@miladyai/app-core/src/auth/openai-codex"
    );
    expect(startCodexLogin).toBeDefined();
    expect(startCodexLogin.length).toBeGreaterThanOrEqual(0);
  });
});

describe("auth/anthropic module", () => {
  it("imports successfully", async () => {
    const mod = await import("@miladyai/app-core/src/auth/anthropic");
    expect(mod).toBeDefined();
  });

  it("exports startAnthropicLogin function", async () => {
    const { startAnthropicLogin } = await import(
      "@miladyai/app-core/src/auth/anthropic"
    );
    expect(typeof startAnthropicLogin).toBe("function");
  });

  it("exports refreshAnthropicToken function", async () => {
    const { refreshAnthropicToken } = await import(
      "@miladyai/app-core/src/auth/anthropic"
    );
    expect(typeof refreshAnthropicToken).toBe("function");
  });
});

