import type http from "node:http";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { billingRouteMock, compatRouteMock } = vi.hoisted(() => ({
  billingRouteMock: vi.fn(async () => true),
  compatRouteMock: vi.fn(async () => true),
}));

vi.mock("@miladyai/agent/api/cloud-billing-routes", () => ({
  handleCloudBillingRoute: billingRouteMock,
}));

vi.mock("@miladyai/agent/api/cloud-compat-routes", () => ({
  handleCloudCompatRoute: compatRouteMock,
}));

vi.mock("@miladyai/agent/config/config", () => ({
  loadElizaConfig: vi.fn(() => ({})),
  saveElizaConfig: vi.fn(),
}));

vi.mock("./auth", () => ({
  ensureCompatApiAuthorized: vi.fn(() => true),
  ensureCompatSensitiveRouteAuthorized: vi.fn(() => true),
  getCompatApiToken: vi.fn(() => null),
}));

import { handleMiladyCompatRoute } from "./server";

function makeRes() {
  return {
    statusCode: 200,
    setHeader() {},
    end() {},
  } as unknown as http.ServerResponse;
}

describe("handleMiladyCompatRoute cloud proxy wrappers", () => {
  beforeEach(() => {
    billingRouteMock.mockClear();
    compatRouteMock.mockClear();
  });

  it("passes runtime through to the billing proxy handler", async () => {
    const runtime = { agentId: "agent-123", character: { secrets: {} } };

    const handled = await handleMiladyCompatRoute(
      {
        method: "GET",
        url: "/api/cloud/billing/summary",
      } as http.IncomingMessage,
      makeRes(),
      { current: runtime } as never,
    );

    expect(handled).toBe(true);
    expect(billingRouteMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "/api/cloud/billing/summary",
      "GET",
      expect.objectContaining({
        runtime,
      }),
    );
  });

  it("passes runtime through to the compat proxy handler", async () => {
    const runtime = { agentId: "agent-123", character: { secrets: {} } };

    const handled = await handleMiladyCompatRoute(
      {
        method: "GET",
        url: "/api/cloud/compat/agents",
      } as http.IncomingMessage,
      makeRes(),
      { current: runtime } as never,
    );

    expect(handled).toBe(true);
    expect(compatRouteMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "/api/cloud/compat/agents",
      "GET",
      expect.objectContaining({
        runtime,
      }),
    );
  });
});
