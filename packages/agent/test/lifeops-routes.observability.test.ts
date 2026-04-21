import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSpanMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  serviceGetGoogleStatusMock,
  spanSuccessMock,
  spanFailureMock,
} = vi.hoisted(() => ({
  createSpanMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  serviceGetGoogleStatusMock: vi.fn(),
  spanSuccessMock: vi.fn(),
  spanFailureMock: vi.fn(),
}));

vi.mock("@elizaos/core", () => ({
  logger: {
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
    debug: vi.fn(),
  },
  stringToUuid: (value: string) => value,
}));

vi.mock("../src/diagnostics/integration-observability", () => ({
  createIntegrationTelemetrySpan: createSpanMock,
}));

vi.mock("../src/lifeops/service", () => {
  class MockLifeOpsServiceError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = "LifeOpsServiceError";
      this.status = status;
    }
  }

  class MockLifeOpsService {
    async getGoogleConnectorStatus(...args: unknown[]) {
      return serviceGetGoogleStatusMock(...args);
    }
  }

  return {
    LifeOpsService: MockLifeOpsService,
    LifeOpsServiceError: MockLifeOpsServiceError,
  };
});

import { handleLifeOpsRoutes } from "../src/api/lifeops-routes";
import { LifeOpsServiceError } from "../src/lifeops/service";

function createContext(
  overrides: Partial<Parameters<typeof handleLifeOpsRoutes>[0]> = {},
) {
  const res = { statusCode: 200 } as ServerResponse;
  return {
    req: {} as IncomingMessage,
    res,
    method: "GET",
    pathname: "/api/lifeops/connectors/google/status",
    url: new URL("http://localhost/api/lifeops/connectors/google/status"),
    state: {
      runtime: {} as never,
      adminEntityId: null,
    },
    json: vi.fn(),
    error: vi.fn(),
    readJsonBody: vi.fn(async () => null),
    decodePathComponent: vi.fn((raw: string) => raw),
    ...overrides,
  };
}

describe("life-ops route observability", () => {
  beforeEach(() => {
    createSpanMock.mockReset();
    loggerInfoMock.mockReset();
    loggerWarnMock.mockReset();
    loggerErrorMock.mockReset();
    serviceGetGoogleStatusMock.mockReset();
    spanSuccessMock.mockReset();
    spanFailureMock.mockReset();
    createSpanMock.mockReturnValue({
      success: spanSuccessMock,
      failure: spanFailureMock,
    });
  });

  it("records success spans for handled routes", async () => {
    serviceGetGoogleStatusMock.mockResolvedValue({
      provider: "google",
      connected: false,
      reason: "disconnected",
    });
    const ctx = createContext();

    const handled = await handleLifeOpsRoutes(ctx);

    expect(handled).toBe(true);
    expect(createSpanMock).toHaveBeenCalledWith({
      boundary: "lifeops",
      operation: "GET /api/lifeops/connectors/google/status",
    });
    expect(spanSuccessMock).toHaveBeenCalledWith({ statusCode: 200 });
    expect(ctx.json).toHaveBeenCalledWith(ctx.res, {
      provider: "google",
      connected: false,
      reason: "disconnected",
    });
  });

  it("logs and records failure spans for handled service errors", async () => {
    serviceGetGoogleStatusMock.mockRejectedValue(
      new LifeOpsServiceError(409, "Google connector needs re-authentication."),
    );
    const ctx = createContext();

    const handled = await handleLifeOpsRoutes(ctx);

    expect(handled).toBe(true);
    expect(spanFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        errorKind: "lifeops_service_error",
      }),
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        boundary: "lifeops",
        operation: "GET /api/lifeops/connectors/google/status",
        statusCode: 409,
      }),
      "[lifeops] Route failed: Google connector needs re-authentication.",
    );
    expect(ctx.error).toHaveBeenCalledWith(
      ctx.res,
      "Google connector needs re-authentication.",
      409,
    );
  });

  it("logs runtime-unavailable failures without constructing the service", async () => {
    const ctx = createContext({
      state: {
        runtime: null,
        adminEntityId: null,
      },
    });

    const handled = await handleLifeOpsRoutes(ctx);

    expect(handled).toBe(true);
    expect(spanFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        errorKind: "runtime_unavailable",
      }),
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        boundary: "lifeops",
        operation: "GET /api/lifeops/connectors/google/status",
        statusCode: 503,
      }),
      "[lifeops] Route rejected because agent runtime is unavailable",
    );
    expect(ctx.error).toHaveBeenCalledWith(
      ctx.res,
      "Agent runtime is not available",
      503,
    );
  });

  it("turns retryable lifeops storage bootstrap failures into a 503", async () => {
    serviceGetGoogleStatusMock.mockRejectedValue(
      new Error(
        "Failed query: CREATE TABLE IF NOT EXISTS life_task_definitions",
      ),
    );
    const ctx = createContext();

    const handled = await handleLifeOpsRoutes(ctx);

    expect(handled).toBe(true);
    expect(spanFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        errorKind: "lifeops_storage_unavailable",
      }),
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        boundary: "lifeops",
        operation: "GET /api/lifeops/connectors/google/status",
        statusCode: 503,
      }),
      "[lifeops] Route unavailable: Life Ops storage is still initializing. Refresh in a moment.",
    );
    expect(ctx.error).toHaveBeenCalledWith(
      ctx.res,
      "Life Ops storage is still initializing. Refresh in a moment.",
      503,
    );
  });

  it("logs unhandled route crashes before rethrowing", async () => {
    serviceGetGoogleStatusMock.mockRejectedValue(new Error("boom"));
    const ctx = createContext();

    await expect(handleLifeOpsRoutes(ctx)).rejects.toThrow("boom");

    expect(spanFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorKind: "unhandled_error",
      }),
    );
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        boundary: "lifeops",
        operation: "GET /api/lifeops/connectors/google/status",
      }),
      "[lifeops] Route crashed: boom",
    );
  });
});
