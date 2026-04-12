import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ProviderSwitchRouteContext } from "../../src/api/provider-switch-routes";
import { handleProviderSwitchRoutes } from "../../src/api/provider-switch-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

function buildCtx(
  overrides?: Partial<ProviderSwitchRouteContext>,
): ProviderSwitchRouteContext & {
  getStatus: () => number;
  getJson: () => unknown;
} {
  const { res, getStatus, getJson } = createMockHttpResponse();
  const req = createMockIncomingMessage({
    method: "POST",
    url: "/api/provider/switch",
  });

  return {
    req,
    res,
    method: "POST",
    pathname: "/api/provider/switch",
    state: { config: {} },
    json: vi.fn((response, data, status = 200) => {
      response.writeHead(status);
      response.end(JSON.stringify(data));
    }),
    error: vi.fn((response, message, status = 500) => {
      response.writeHead(status);
      response.end(JSON.stringify({ error: message }));
    }),
    readJsonBody: vi.fn(async () => ({ provider: "openai" })),
    saveElizaConfig: vi.fn(),
    scheduleRuntimeRestart: vi.fn(),
    providerSwitchInProgress: false,
    setProviderSwitchInProgress: vi.fn(),
    restartRuntime: vi.fn(async () => true),
    getStatus,
    getJson,
    ...overrides,
  };
}

describe("provider-switch-routes", () => {
  test("restarts the runtime immediately when hot restart is available", async () => {
    const ctx = buildCtx();

    const handled = await handleProviderSwitchRoutes(ctx);

    expect(handled).toBe(true);
    expect(ctx.saveElizaConfig).toHaveBeenCalledOnce();
    expect(ctx.restartRuntime).toHaveBeenCalledWith(
      "provider switch to openai",
    );
    expect(ctx.scheduleRuntimeRestart).not.toHaveBeenCalled();
    expect(ctx.setProviderSwitchInProgress).toHaveBeenNthCalledWith(1, true);
    expect(ctx.setProviderSwitchInProgress).toHaveBeenLastCalledWith(false);

    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).toMatchObject({
      success: true,
      provider: "openai",
      restarting: true,
    });
  });

  test("falls back to pending restart when hot restart is unavailable", async () => {
    const ctx = buildCtx({
      restartRuntime: vi.fn(async () => false),
    });

    const handled = await handleProviderSwitchRoutes(ctx);

    expect(handled).toBe(true);
    expect(ctx.restartRuntime).toHaveBeenCalledWith(
      "provider switch to openai",
    );
    expect(ctx.scheduleRuntimeRestart).toHaveBeenCalledWith(
      "provider switch to openai",
    );

    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).toMatchObject({
      success: true,
      provider: "openai",
      restarting: false,
    });
  });
});
