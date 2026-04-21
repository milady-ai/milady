import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMiladyMainApiHeaders,
  postCloudDisconnectFromMain,
} from "../cloud-disconnect-from-main";

vi.mock("../native/agent", () => ({
  getAgentManager: () => ({ getPort: () => 31337 }),
  configureDesktopLocalApiAuth: () => "test-token",
}));

describe("postCloudDisconnectFromMain", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns ok when probe and disconnect succeed", async () => {
    const fetchImpl = vi.fn(
      async (input: string, init?: RequestInit): Promise<Response> => {
        if (input.endsWith("/api/status") && init?.method !== "POST") {
          return new Response(JSON.stringify({ state: "running" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (
          input.endsWith("/api/cloud/disconnect") &&
          init?.method === "POST"
        ) {
          const auth =
            init?.headers &&
            typeof init.headers === "object" &&
            "Authorization" in init.headers
              ? String(
                  (init.headers as Record<string, string>).Authorization ?? "",
                )
              : "";
          expect(auth).toBe("Bearer test-token");
          return new Response(
            JSON.stringify({ ok: true, status: "disconnected" }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response("not found", { status: 404 });
      },
    );

    const result = await postCloudDisconnectFromMain({ fetchImpl });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("returns error when disconnect returns non-OK", async () => {
    const fetchImpl = vi.fn(
      async (input: string, init?: RequestInit): Promise<Response> => {
        if (input.endsWith("/api/status") && init?.method !== "POST") {
          return new Response(JSON.stringify({ state: "running" }), {
            status: 200,
          });
        }
        if (input.endsWith("/api/cloud/disconnect")) {
          return new Response(JSON.stringify({ error: "nope" }), {
            status: 500,
          });
        }
        return new Response("", { status: 404 });
      },
    );

    const result = await postCloudDisconnectFromMain({ fetchImpl });
    expect(result).toEqual({ ok: false, error: "nope" });
  });

  it("probes renderer api base with renderer bearer first (external / Vite proxy)", async () => {
    const fetchImpl = vi.fn(
      async (input: string, init?: RequestInit): Promise<Response> => {
        const auth =
          init?.headers &&
          typeof init.headers === "object" &&
          "Authorization" in init.headers
            ? String(
                (init.headers as Record<string, string>).Authorization ?? "",
              )
            : "";
        if (
          input.includes("127.0.0.1:31337") &&
          input.endsWith("/api/status")
        ) {
          return new Response("", { status: 401 });
        }
        if (input.includes("127.0.0.1:2138") && input.endsWith("/api/status")) {
          expect(auth).toBe("Bearer from-renderer");
          return new Response(JSON.stringify({ state: "running" }), {
            status: 200,
          });
        }
        if (
          input.includes("127.0.0.1:2138") &&
          input.endsWith("/api/cloud/disconnect")
        ) {
          expect(auth).toBe("Bearer from-renderer");
          return new Response(
            JSON.stringify({ ok: true, status: "disconnected" }),
            { status: 200 },
          );
        }
        return new Response("unexpected", { status: 404 });
      },
    );

    const result = await postCloudDisconnectFromMain({
      fetchImpl,
      apiBaseOverride: "http://127.0.0.1:2138",
      bearerTokenOverride: "from-renderer",
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("buildMiladyMainApiHeaders", () => {
  it("includes bearer token from env when set", () => {
    const prev = process.env.MILADY_API_TOKEN;
    process.env.MILADY_API_TOKEN = "env-tok";
    try {
      const h = buildMiladyMainApiHeaders();
      expect(h.Authorization).toBe("Bearer env-tok");
    } finally {
      if (prev === undefined) {
        delete process.env.MILADY_API_TOKEN;
      } else {
        process.env.MILADY_API_TOKEN = prev;
      }
    }
  });

  it("prefers bearer override over MILADY_API_TOKEN", () => {
    const prev = process.env.MILADY_API_TOKEN;
    process.env.MILADY_API_TOKEN = "env-tok";
    try {
      const h = buildMiladyMainApiHeaders(undefined, "override-tok");
      expect(h.Authorization).toBe("Bearer override-tok");
    } finally {
      if (prev === undefined) {
        delete process.env.MILADY_API_TOKEN;
      } else {
        process.env.MILADY_API_TOKEN = prev;
      }
    }
  });
});
