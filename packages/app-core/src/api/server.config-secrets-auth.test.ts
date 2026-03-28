/**
 * Auth tests for sensitive config/secrets/connector/wallet mutation endpoints
 * (MW-04). Verifies that the global isAuthorized gate rejects unauthenticated
 * requests and accepts authenticated ones for all critical ingress paths.
 *
 * These are unit tests of the exported isAuthorized/extractAuthToken functions
 * combined with HTTP-level integration tests verifying the server enforces
 * auth on mutation routes.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { req } from "../../../../test/helpers/http";
import { _resetAuthRateLimiter } from "./auth";
import { startApiServer } from "./server";

// Prevent mcp-marketplace import side effects
vi.mock("../services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

/** Convenience wrapper: translates the old `{ body, token }` call convention. */
function authReq(
  port: number,
  method: string,
  path: string,
  opts?: { body?: Record<string, unknown>; token?: string },
) {
  const headers: Record<string, string> | undefined = opts?.token
    ? { Authorization: `Bearer ${opts.token}` }
    : undefined;
  return req(port, method, path, opts?.body, headers);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("sensitive endpoint auth gates (MW-04)", () => {
  let port: number;
  let close: () => Promise<void>;
  const TOKEN = "test-auth-token-mw04";
  const WRONG_TOKEN = "wrong-token-should-be-rejected";
  const prevToken = process.env.ELIZA_API_TOKEN;

  beforeAll(async () => {
    process.env.ELIZA_API_TOKEN = TOKEN;
    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
  }, 30_000);

  beforeEach(() => {
    _resetAuthRateLimiter();
  });

  afterAll(async () => {
    await close();
    if (prevToken === undefined) {
      delete process.env.ELIZA_API_TOKEN;
    } else {
      process.env.ELIZA_API_TOKEN = prevToken;
    }
  });

  // ── Config mutation ─────────────────────────────────────────────────

  describe("PUT /api/config", () => {
    it("rejects unauthenticated config mutation with 401", async () => {
      const { status, data } = await authReq(port, "PUT", "/api/config", {
        body: { agentName: "hacked" },
      });
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated config mutation", async () => {
      const { status } = await authReq(port, "PUT", "/api/config", {
        body: { agentName: "TestAgent" },
        token: TOKEN,
      });
      expect(status).not.toBe(401);
    });

    it("rejects config mutation with wrong token", async () => {
      const { status, data } = await authReq(port, "PUT", "/api/config", {
        body: { agentName: "hacked" },
        token: WRONG_TOKEN,
      });
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });
  });

  // ── Secrets mutation ──────────────────────────────────────────────

  describe("PUT /api/secrets", () => {
    it("rejects unauthenticated secrets update with 401", async () => {
      const { status, data } = await authReq(port, "PUT", "/api/secrets", {
        body: { OPENAI_API_KEY: "stolen" },
      });
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated secrets update", async () => {
      const { status } = await authReq(port, "PUT", "/api/secrets", {
        body: {},
        token: TOKEN,
      });
      expect(status).not.toBe(401);
    });

    it("rejects secrets update with wrong token", async () => {
      const { status, data } = await authReq(port, "PUT", "/api/secrets", {
        body: { OPENAI_API_KEY: "stolen" },
        token: WRONG_TOKEN,
      });
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });
  });

  // ── Connector mutation ────────────────────────────────────────────

  describe("POST /api/connectors", () => {
    it("rejects unauthenticated connector creation with 401", async () => {
      const { status, data } = await authReq(port, "POST", "/api/connectors", {
        body: { name: "telegram", config: {} },
      });
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated connector creation", async () => {
      const { status } = await authReq(port, "POST", "/api/connectors", {
        body: { name: "telegram", config: {} },
        token: TOKEN,
      });
      expect(status).not.toBe(401);
    });

    it("rejects connector creation with wrong token", async () => {
      const { status, data } = await authReq(port, "POST", "/api/connectors", {
        body: { name: "telegram", config: {} },
        token: WRONG_TOKEN,
      });
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });
  });

  // ── MCP config mutation ───────────────────────────────────────────

  describe("PUT /api/mcp/config", () => {
    it("rejects unauthenticated MCP config update with 401", async () => {
      const { status, data } = await authReq(port, "PUT", "/api/mcp/config", {
        body: { servers: {} },
      });
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated MCP config update", async () => {
      const { status } = await authReq(port, "PUT", "/api/mcp/config", {
        body: { servers: {} },
        token: TOKEN,
      });
      expect(status).not.toBe(401);
    });

    it("rejects MCP config update with wrong token", async () => {
      const { status, data } = await authReq(port, "PUT", "/api/mcp/config", {
        body: { servers: {} },
        token: WRONG_TOKEN,
      });
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });
  });

  // ── Wallet mutation ───────────────────────────────────────────────

  describe("POST /api/wallet/generate", () => {
    it("rejects unauthenticated wallet generation with 401", async () => {
      const { status, data } = await authReq(
        port,
        "POST",
        "/api/wallet/generate",
        {
          body: { chain: "evm" },
        },
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated wallet generation", async () => {
      const { status } = await authReq(port, "POST", "/api/wallet/generate", {
        body: { chain: "evm" },
        token: TOKEN,
      });
      expect(status).not.toBe(401);
    });

    it("rejects wallet generation with wrong token", async () => {
      const { status, data } = await authReq(
        port,
        "POST",
        "/api/wallet/generate",
        {
          body: { chain: "evm" },
          token: WRONG_TOKEN,
        },
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });
  });

  describe("PUT /api/wallet/config", () => {
    it("rejects unauthenticated wallet config update with 401", async () => {
      const { status, data } = await authReq(
        port,
        "PUT",
        "/api/wallet/config",
        {
          body: { alchemyApiKey: "stolen" },
        },
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated wallet config update", async () => {
      const { status } = await authReq(port, "PUT", "/api/wallet/config", {
        body: {},
        token: TOKEN,
      });
      expect(status).not.toBe(401);
    });

    it("rejects wallet config update with wrong token", async () => {
      const { status, data } = await authReq(
        port,
        "PUT",
        "/api/wallet/config",
        {
          body: { alchemyApiKey: "stolen" },
          token: WRONG_TOKEN,
        },
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });
  });

  // ── Agent restart ─────────────────────────────────────────────────

  describe("POST /api/agent/restart", () => {
    it("rejects unauthenticated agent restart with 401", async () => {
      const { status, data } = await authReq(
        port,
        "POST",
        "/api/agent/restart",
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated agent restart", async () => {
      const { status } = await authReq(port, "POST", "/api/agent/restart", {
        token: TOKEN,
      });
      // 501 is expected (no onRestart handler), but NOT 401
      expect(status).not.toBe(401);
    });

    it("rejects agent restart with wrong token", async () => {
      const { status, data } = await authReq(
        port,
        "POST",
        "/api/agent/restart",
        {
          token: WRONG_TOKEN,
        },
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });
  });

  // ── Connector deletion ───────────────────────────────────────────

  describe("DELETE /api/connectors/:name", () => {
    it("rejects unauthenticated connector deletion with 401", async () => {
      const { status, data } = await req(
        port,
        "DELETE",
        "/api/connectors/telegram",
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated connector deletion", async () => {
      const { status } = await authReq(
        port,
        "DELETE",
        "/api/connectors/telegram",
        {
          token: TOKEN,
        },
      );
      expect(status).not.toBe(401);
    });

    it("rejects connector deletion with wrong token", async () => {
      const { status, data } = await req(
        port,
        "DELETE",
        "/api/connectors/telegram",
        { token: WRONG_TOKEN },
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });
  });

  // ── MCP server creation ─────────────────────────────────────────

  describe("POST /api/mcp/config/server", () => {
    it("rejects unauthenticated MCP server creation with 401", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/mcp/config/server",
        { body: { name: "evil-server", command: "cat /etc/passwd" } },
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated MCP server creation", async () => {
      const { status } = await authReq(port, "POST", "/api/mcp/config/server", {
        body: { name: "test-server", command: "echo" },
        token: TOKEN,
      });
      expect(status).not.toBe(401);
    });

    it("rejects MCP server creation with wrong token", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/mcp/config/server",
        {
          body: { name: "evil", command: "cat /etc/passwd" },
          token: WRONG_TOKEN,
        },
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });
  });

  // ── MCP server deletion ─────────────────────────────────────────

  describe("DELETE /api/mcp/config/server/:name", () => {
    it("rejects unauthenticated MCP server deletion with 401", async () => {
      const { status, data } = await req(
        port,
        "DELETE",
        "/api/mcp/config/server/evil-server",
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated MCP server deletion", async () => {
      const { status } = await authReq(
        port,
        "DELETE",
        "/api/mcp/config/server/test-server",
        { token: TOKEN },
      );
      expect(status).not.toBe(401);
    });

    it("rejects MCP server deletion with wrong token", async () => {
      const { status, data } = await req(
        port,
        "DELETE",
        "/api/mcp/config/server/evil-server",
        { token: WRONG_TOKEN },
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });
  });

  // ── Wallet import ───────────────────────────────────────────────

  describe("POST /api/wallet/import", () => {
    it("rejects unauthenticated wallet import with 401", async () => {
      const { status, data } = await authReq(
        port,
        "POST",
        "/api/wallet/import",
        {
          body: { chain: "evm", privateKey: "0xSTOLEN" },
        },
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated wallet import", async () => {
      const { status } = await authReq(port, "POST", "/api/wallet/import", {
        body: { chain: "evm", privateKey: "0xTEST" },
        token: TOKEN,
      });
      expect(status).not.toBe(401);
    });

    it("rejects wallet import with wrong token", async () => {
      const { status, data } = await authReq(
        port,
        "POST",
        "/api/wallet/import",
        {
          body: { chain: "evm", privateKey: "0xSTOLEN" },
          token: WRONG_TOKEN,
        },
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });
  });

  // ── Wallet export ───────────────────────────────────────────────

  describe("POST /api/wallet/export", () => {
    it("rejects unauthenticated wallet export with 401", async () => {
      const { status, data } = await authReq(
        port,
        "POST",
        "/api/wallet/export",
        {
          body: { chain: "evm" },
        },
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated wallet export", async () => {
      const { status } = await authReq(port, "POST", "/api/wallet/export", {
        body: { chain: "evm" },
        token: TOKEN,
      });
      // Not 401 — may fail for other reasons (no wallet configured) but auth gate passes
      expect(status).not.toBe(401);
    });

    it("rejects wallet export with wrong token", async () => {
      const { status, data } = await authReq(
        port,
        "POST",
        "/api/wallet/export",
        {
          body: { chain: "evm" },
          token: WRONG_TOKEN,
        },
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });
  });

  // ── Terminal execution ────────────────────────────────────────────

  describe("POST /api/terminal/run", () => {
    it("rejects unauthenticated terminal execution with 401", async () => {
      const { status, data } = await authReq(
        port,
        "POST",
        "/api/terminal/run",
        {
          body: { command: "echo hacked" },
        },
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated terminal execution", async () => {
      const { status } = await authReq(port, "POST", "/api/terminal/run", {
        body: { command: "echo test" },
        token: TOKEN,
      });
      expect(status).not.toBe(401);
    });

    it("rejects terminal execution with wrong token", async () => {
      const { status, data } = await authReq(
        port,
        "POST",
        "/api/terminal/run",
        {
          body: { command: "echo hacked" },
          token: WRONG_TOKEN,
        },
      );
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });
  });
});
