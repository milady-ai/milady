/**
 * Route-level error propagation tests for on-chain endpoints (MW-02).
 *
 * Verifies that when registry/drop services ARE configured but throw
 * (timeout, nonce, contract errors), the global HTTP error handler maps
 * them to HTTP 500 responses with the error message.
 *
 * Strategy: mock the RegistryService/DropService constructors with classes
 * that throw domain-specific errors, and mock config to enable initialization.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { req } from "../../../../test/helpers/http";

// ── Error-throwing service mocks ────────────────────────────────────────────

class ThrowingRegistryService {
  static defaultCapabilitiesHash() {
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }
  async getStatus(): Promise<never> {
    throw new Error("timeout: tx took too long");
  }
  async register(): Promise<never> {
    throw new Error("nonce has already been used");
  }
  async updateTokenURI(): Promise<never> {
    throw new Error("replacement transaction underpriced");
  }
  async syncProfile(): Promise<never> {
    throw new Error("timeout: tx took too long");
  }
  async getChainId(): Promise<number> {
    return 1;
  }
}

class ThrowingDropService {
  async getStatus(): Promise<never> {
    throw new Error("call revert exception");
  }
  async mint(): Promise<never> {
    throw new Error("insufficient funds");
  }
  async mintShiny(): Promise<never> {
    throw new Error("insufficient funds for shiny");
  }
  async mintWithWhitelist(): Promise<never> {
    throw new Error("invalid proof");
  }
}

// ── Module mocks (hoisted by vitest) ────────────────────────────────────────

vi.mock("@miladyai/agent/api/tx-service", () => ({
  TxService: class MockTxService {
    address = "0x1111111111111111111111111111111111111111";
    getContract() {
      return {};
    }
  },
}));

vi.mock("@miladyai/agent/api/registry-service", () => ({
  RegistryService: ThrowingRegistryService,
}));

vi.mock("@miladyai/agent/api/drop-service", () => ({
  DropService: ThrowingDropService,
}));

vi.mock("@miladyai/agent/config/config", () => {
  const configData = {
    registry: {
      registryAddress: "0x2222222222222222222222222222222222222222",
      mainnetRpc: "http://mock-rpc",
      collectionAddress: "0x3333333333333333333333333333333333333333",
    },
    features: { dropEnabled: true },
    env: {
      EVM_PRIVATE_KEY:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  };
  return {
    loadElizaConfig: () => configData,
    saveElizaConfig: () => {},
    configFileExists: () => true,
  };
});

vi.mock("@miladyai/agent/services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

// ── Tests ───────────────────────────────────────────────────────────────────

const { startApiServer } = await import("@miladyai/agent/api/server");

describe("on-chain route error propagation (MW-02)", () => {
  let port: number;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
    // Allow async IIFE that initializes services to complete
    await new Promise((r) => setTimeout(r, 100));
  }, 30_000);

  afterAll(async () => {
    await close();
  });

  // ── Registry error paths ──────────────────────────────────────────────

  it("GET /api/registry/status returns 500 on service timeout", async () => {
    const { status, data } = await req(port, "GET", "/api/registry/status");
    expect(status).toBe(500);
    expect(data.error).toMatch(/timeout/i);
  });

  it("POST /api/registry/register returns 500 on nonce error", async () => {
    const { status, data } = await req(port, "POST", "/api/registry/register", {
      name: "TestAgent",
    });
    expect(status).toBe(500);
    expect(data.error).toMatch(/nonce/i);
  });

  it("POST /api/registry/update-uri returns 500 on tx underpriced", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/registry/update-uri",
      { tokenURI: "ipfs://test" },
    );
    expect(status).toBe(500);
    expect(data.error).toMatch(/underpriced/i);
  });

  it("POST /api/registry/sync returns 500 on timeout", async () => {
    const { status, data } = await req(port, "POST", "/api/registry/sync", {
      name: "TestAgent",
    });
    expect(status).toBe(500);
    expect(data.error).toMatch(/timeout/i);
  });

  // ── Drop error paths ──────────────────────────────────────────────────

  it("GET /api/drop/status returns 500 on contract revert", async () => {
    const { status, data } = await req(port, "GET", "/api/drop/status");
    expect(status).toBe(500);
    expect(data.error).toMatch(/revert/i);
  });

  it("POST /api/drop/mint returns 500 on insufficient funds", async () => {
    const { status, data } = await req(port, "POST", "/api/drop/mint", {
      name: "TestAgent",
    });
    expect(status).toBe(500);
    expect(data.error).toMatch(/insufficient funds/i);
  });

  it("POST /api/drop/mint with shiny returns 500 on service failure", async () => {
    const { status, data } = await req(port, "POST", "/api/drop/mint", {
      name: "TestAgent",
      shiny: true,
    });
    expect(status).toBe(500);
    expect(data.error).toMatch(/insufficient funds for shiny/i);
  });

  it("POST /api/drop/mint-whitelist returns 500 on invalid proof", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/drop/mint-whitelist",
      { name: "TestAgent", proof: ["0xabc"] },
    );
    expect(status).toBe(500);
    expect(data.error).toMatch(/invalid proof/i);
  });
});
