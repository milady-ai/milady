import { describe, expect, test, vi } from "vitest";
import type { SubscriptionRouteContext } from "../../src/api/subscription-routes";
import { handleSubscriptionRoutes } from "../../src/api/subscription-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

function buildCtx(
  overrides: Partial<SubscriptionRouteContext> = {},
): SubscriptionRouteContext {
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method: "GET", url: "/" }),
    res,
    method: "GET",
    pathname: "/",
    json: vi.fn((r, data, status = 200) => {
      r.writeHead(status);
      r.end(JSON.stringify(data));
    }),
    error: vi.fn((r, message, status = 500) => {
      r.writeHead(status);
      r.end(JSON.stringify({ error: message }));
    }),
    readJsonBody: vi.fn(async () => null),
    state: {
      config: {},
    },
    saveConfig: vi.fn(),
    loadSubscriptionAuth: vi.fn(async () => ({
      getSubscriptionStatus: vi.fn(() => ({ anthropic: "active" })),
      startAnthropicLogin: vi.fn(),
      startCodexLogin: vi.fn(),
      saveCredentials: vi.fn(),
      applySubscriptionCredentials: vi.fn(),
      deleteCredentials: vi.fn(),
    })),
    ...overrides,
  };
}

describe("handleSubscriptionRoutes", () => {
  test("returns false for unrelated path", async () => {
    const ctx = buildCtx({ pathname: "/api/other" });
    const handled = await handleSubscriptionRoutes(ctx);
    expect(handled).toBe(false);
  });

  test("GET /api/subscription/status returns provider status", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const providerStatuses = { anthropic: "active", openai: "inactive" };
    const ctx = buildCtx({
      method: "GET",
      pathname: "/api/subscription/status",
      res,
      loadSubscriptionAuth: vi.fn(async () => ({
        getSubscriptionStatus: vi.fn(() => providerStatuses),
        startAnthropicLogin: vi.fn(),
        startCodexLogin: vi.fn(),
        saveCredentials: vi.fn(),
        applySubscriptionCredentials: vi.fn(),
        deleteCredentials: vi.fn(),
      })),
    });

    const handled = await handleSubscriptionRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({ providers: providerStatuses });
  });

  test("GET /api/subscription/status returns 500 when loadSubscriptionAuth throws", async () => {
    const { res, getStatus } = createMockHttpResponse();
    const ctx = buildCtx({
      method: "GET",
      pathname: "/api/subscription/status",
      res,
      loadSubscriptionAuth: vi.fn(async () => {
        throw new Error("auth module unavailable");
      }),
    });

    const handled = await handleSubscriptionRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(500);
  });

  test("POST /api/subscription/anthropic/setup-token trims and persists the token", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const saveConfig = vi.fn();
    const ctx = buildCtx({
      method: "POST",
      pathname: "/api/subscription/anthropic/setup-token",
      res,
      saveConfig,
      readJsonBody: vi.fn(async () => ({ token: "  sk-ant-oat01-test-token  " })),
      state: {
        config: {
          env: {
            EXISTING_KEY: "existing-value",
          },
        },
      },
    });

    const handled = await handleSubscriptionRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({ success: true });
    expect(
      (ctx.state.config.env as Record<string, unknown>).__anthropicSubscriptionToken,
    ).toBe("sk-ant-oat01-test-token");
    expect(
      (ctx.state.config.env as Record<string, unknown>).EXISTING_KEY,
    ).toBe("existing-value");
    expect(saveConfig).toHaveBeenCalledWith(ctx.state.config);
  });

  test("DELETE /api/subscription/anthropic-subscription clears saved token and invalid runtime route only", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const deleteCredentials = vi.fn();
    const saveConfig = vi.fn();
    const ctx = buildCtx({
      method: "DELETE",
      pathname: "/api/subscription/anthropic-subscription",
      res,
      saveConfig,
      state: {
        config: {
          env: {
            __anthropicSubscriptionToken: "sk-ant-oat01-delete-me",
          },
          agents: {
            defaults: {
              subscriptionProvider: "anthropic-subscription",
            },
          },
          serviceRouting: {
            llmText: {
              backend: "anthropic-subscription",
              transport: "direct",
            },
            rpc: {
              backend: "elizacloud",
              transport: "cloud-proxy",
              accountId: "elizacloud",
            },
          },
        },
      },
      loadSubscriptionAuth: vi.fn(async () => ({
        getSubscriptionStatus: vi.fn(),
        startAnthropicLogin: vi.fn(),
        startCodexLogin: vi.fn(),
        saveCredentials: vi.fn(),
        applySubscriptionCredentials: vi.fn(),
        deleteCredentials,
      })),
    });

    const handled = await handleSubscriptionRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({ success: true });
    expect(deleteCredentials).toHaveBeenCalledWith("anthropic-subscription");
    expect(
      (ctx.state.config.env as Record<string, unknown>).__anthropicSubscriptionToken,
    ).toBeUndefined();
    expect(ctx.state.config.agents?.defaults?.subscriptionProvider).toBeUndefined();
    expect(ctx.state.config.serviceRouting).toEqual({
      rpc: {
        backend: "elizacloud",
        transport: "cloud-proxy",
        accountId: "elizacloud",
      },
    });
    expect(saveConfig).toHaveBeenCalledWith(ctx.state.config);
  });

  test("DELETE /api/subscription/openai-codex clears only the matching runtime route", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const deleteCredentials = vi.fn();
    const saveConfig = vi.fn();
    const ctx = buildCtx({
      method: "DELETE",
      pathname: "/api/subscription/openai-codex",
      res,
      saveConfig,
      state: {
        config: {
          agents: {
            defaults: {
              subscriptionProvider: "openai-codex",
            },
          },
          serviceRouting: {
            llmText: {
              backend: "openai-subscription",
              transport: "direct",
            },
            embeddings: {
              backend: "elizacloud",
              transport: "cloud-proxy",
              accountId: "elizacloud",
            },
          },
        },
      },
      loadSubscriptionAuth: vi.fn(async () => ({
        getSubscriptionStatus: vi.fn(),
        startAnthropicLogin: vi.fn(),
        startCodexLogin: vi.fn(),
        saveCredentials: vi.fn(),
        applySubscriptionCredentials: vi.fn(),
        deleteCredentials,
      })),
    });

    const handled = await handleSubscriptionRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({ success: true });
    expect(deleteCredentials).toHaveBeenCalledWith("openai-codex");
    expect(ctx.state.config.agents?.defaults?.subscriptionProvider).toBeUndefined();
    expect(ctx.state.config.serviceRouting).toEqual({
      embeddings: {
        backend: "elizacloud",
        transport: "cloud-proxy",
        accountId: "elizacloud",
      },
    });
    expect(saveConfig).toHaveBeenCalledWith(ctx.state.config);
  });
});
