import { describe, expect, it, vi } from "vitest";
import { createIntegrationTelemetrySpan } from "./integration-observability.js";

describe("createIntegrationTelemetrySpan", () => {
  it("logs expected transient lifeops failures at info level", () => {
    const sink = {
      info: vi.fn(),
      warn: vi.fn(),
    };
    const span = createIntegrationTelemetrySpan(
      {
        boundary: "lifeops",
        operation: "GET /api/lifeops/overview",
      },
      {
        now: () => 100,
        sink,
      },
    );

    span.failure({
      statusCode: 503,
      errorKind: "lifeops_storage_unavailable",
    });

    expect(sink.info).toHaveBeenCalledTimes(1);
    expect(sink.warn).not.toHaveBeenCalled();
  });

  it("keeps non-transient failures at warn level", () => {
    const sink = {
      info: vi.fn(),
      warn: vi.fn(),
    };
    const span = createIntegrationTelemetrySpan(
      {
        boundary: "lifeops",
        operation: "POST /api/lifeops/definitions",
      },
      {
        now: () => 100,
        sink,
      },
    );

    span.failure({
      statusCode: 500,
      errorKind: "lifeops_service_error",
    });

    expect(sink.warn).toHaveBeenCalledTimes(1);
    expect(sink.info).not.toHaveBeenCalled();
  });
});
