import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSpanMock,
  loggerWarnMock,
  loggerErrorMock,
  spanSuccessMock,
  spanFailureMock,
} = vi.hoisted(() => ({
  createSpanMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  spanSuccessMock: vi.fn(),
  spanFailureMock: vi.fn(),
}));

vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    warn: loggerWarnMock,
    error: loggerErrorMock,
    debug: vi.fn(),
  },
}));

vi.mock("../src/diagnostics/integration-observability", () => ({
  createIntegrationTelemetrySpan: createSpanMock,
}));

import { sendTwilioSms } from "../src/lifeops/twilio";
import { postToX } from "../src/lifeops/x-poster";

describe("life-ops integration observability", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    createSpanMock.mockReset();
    loggerWarnMock.mockReset();
    loggerErrorMock.mockReset();
    spanSuccessMock.mockReset();
    spanFailureMock.mockReset();
    createSpanMock.mockReturnValue({
      success: spanSuccessMock,
      failure: spanFailureMock,
    });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("logs Twilio HTTP failures with telemetry", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "carrier rejected" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await sendTwilioSms({
      credentials: {
        accountSid: "AC123",
        authToken: "secret",
        fromPhoneNumber: "+14155550199",
      },
      to: "+14155550101",
      body: "Reminder body",
    });

    expect(result).toEqual({
      ok: false,
      status: 502,
      error: "carrier rejected",
    });
    expect(createSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        boundary: "lifeops",
        operation: "twilio_sms",
      }),
    );
    expect(spanFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 502,
        errorKind: "http_error",
      }),
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        boundary: "lifeops",
        integration: "twilio",
        operation: "twilio_sms",
        statusCode: 502,
      }),
      "[lifeops] Twilio request failed: carrier rejected",
    );
  });

  it("logs Twilio network failures with telemetry", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNRESET"));

    const result = await sendTwilioSms({
      credentials: {
        accountSid: "AC123",
        authToken: "secret",
        fromPhoneNumber: "+14155550199",
      },
      to: "+14155550101",
      body: "Reminder body",
    });

    expect(result).toEqual({
      ok: false,
      status: null,
      error: "connect ECONNRESET",
    });
    expect(createSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        boundary: "lifeops",
        operation: "twilio_sms",
      }),
    );
    expect(spanFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorKind: "network_error",
      }),
    );
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        boundary: "lifeops",
        integration: "twilio",
        operation: "twilio_sms",
      }),
      "[lifeops] Twilio request failed: connect ECONNRESET",
    );
  });

  it("logs X network failures with telemetry", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));

    const result = await postToX({
      text: "Ship the patch.",
      credentials: {
        apiKey: "api-key",
        apiSecretKey: "api-secret",
        accessToken: "access-token",
        accessTokenSecret: "access-secret",
      },
    });

    expect(result).toEqual({
      ok: false,
      status: null,
      error: "socket hang up",
      category: "network",
    });
    expect(createSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        boundary: "lifeops",
        operation: "x_post",
      }),
    );
    expect(spanFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorKind: "network",
      }),
    );
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        boundary: "lifeops",
        integration: "x",
        operation: "x_post",
      }),
      "[lifeops] X post failed: socket hang up",
    );
  });

  it("records success spans for successful X posts", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "tweet-1" } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await postToX({
      text: "Ship the patch.",
      credentials: {
        apiKey: "api-key",
        apiSecretKey: "api-secret",
        accessToken: "access-token",
        accessTokenSecret: "access-secret",
      },
    });

    expect(result).toEqual({
      ok: true,
      status: 201,
      postId: "tweet-1",
      category: "success",
    });
    expect(spanSuccessMock).toHaveBeenCalledWith({ statusCode: 201 });
    expect(loggerWarnMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });
});
