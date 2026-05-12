/**
 * Tests for the pairing-token client polling helper in `lib/open-web-ui.ts`.
 *
 * Covers the new 202 → poll → 200 flow that pairs with the server-side
 * auto-resume change in `apps/api/v1/eliza/agents/[agentId]/pairing-token`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/runtime-config", () => ({
  CLOUD_BASE: "https://cloud.test",
  getCloudAgentApiPath: (agentId?: string, suffix?: string) =>
    `/api/v1/eliza/agents${agentId ? `/${agentId}` : ""}${
      suffix ? `/${suffix}` : ""
    }`,
  rewriteAgentUiUrl: (url: string) => url,
}));

import { redirectPopupToCloudAgent } from "../lib/open-web-ui";

const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN_URL = `https://cloud.test/api/v1/eliza/agents/${AGENT_ID}/pairing-token`;

interface FakePopup {
  closed: boolean;
  location: { href: string };
  document: { getElementById: (id: string) => HTMLElement | null };
}

function makeFakePopup(): FakePopup {
  return {
    closed: false,
    location: { href: "" },
    document: { getElementById: () => null },
  };
}

function readyResponse(redirectUrl: string): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data: { token: "tok-1", redirectUrl, expiresIn: 60 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function pendingResponse(
  retryAfterSec = 0,
  payload: Record<string, unknown> = {},
): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        agentId: AGENT_ID,
        status: "starting",
        retryAfterMs: retryAfterSec * 1000,
        ...payload,
      },
    }),
    {
      status: 202,
      headers: {
        "content-type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}

describe("redirectPopupToCloudAgent", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("redirects immediately when server returns 200", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        readyResponse("https://agent.test/pair?token=tok-1"),
      );
    const popup = makeFakePopup();

    await redirectPopupToCloudAgent(
      popup as unknown as Window,
      AGENT_ID,
      "key",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      TOKEN_URL,
      expect.objectContaining({ method: "POST" }),
    );
    expect(popup.location.href).toBe("https://agent.test/pair?token=tok-1");
  });

  it("polls through a 202, then redirects on 200", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(pendingResponse(0))
      .mockResolvedValueOnce(
        readyResponse("https://agent.test/pair?token=tok-2"),
      );
    const popup = makeFakePopup();

    await redirectPopupToCloudAgent(
      popup as unknown as Window,
      AGENT_ID,
      "key",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(popup.location.href).toBe("https://agent.test/pair?token=tok-2");
  });

  it("does not redirect when the popup closes during polling", async () => {
    const popup = makeFakePopup();
    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => {
        popup.closed = true;
        return pendingResponse(0);
      })
      .mockResolvedValueOnce(
        readyResponse("https://agent.test/pair?token=tok-3"),
      );

    await redirectPopupToCloudAgent(
      popup as unknown as Window,
      AGENT_ID,
      "key",
    );

    expect(popup.location.href).toBe("");
  });

  it("propagates a non-202 error response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: false, error: "Agent in error state" }),
        { status: 500, headers: { "content-type": "application/json" } },
      ),
    );
    const popup = makeFakePopup();

    await expect(
      redirectPopupToCloudAgent(popup as unknown as Window, AGENT_ID, "key"),
    ).rejects.toThrow(/Pairing token 500/);
  });
});
