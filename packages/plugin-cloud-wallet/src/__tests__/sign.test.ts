import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { canonicalJson, signEnvelope } from "../bridge/sign.ts";

describe("canonicalJson", () => {
  it("produces key-sorted stable output", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(`{"a":2,"b":1}`);
    expect(canonicalJson({ a: { y: 1, x: 2 } })).toBe(`{"a":{"x":2,"y":1}}`);
  });

  it("preserves array order", () => {
    expect(canonicalJson([3, 1, 2])).toBe(`[3,1,2]`);
  });

  it("serializes the canonical envelope shape with stable ordering", () => {
    // The cloud verifies: {clientAddress, payload:{method,params}, timestamp, nonce}
    const str = canonicalJson({
      nonce: "n",
      timestamp: 1,
      payload: { params: [1, 2], method: "m" },
      clientAddress: "0xabc",
    });
    expect(str).toBe(
      `{"clientAddress":"0xabc","nonce":"n","payload":{"method":"m","params":[1,2]},"timestamp":1}`,
    );
  });

  it("handles null/primitives", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson("x")).toBe(`"x"`);
    expect(canonicalJson(42)).toBe("42");
  });
});

describe("signEnvelope", () => {
  const pk = generatePrivateKey();

  it("is deterministic given the same nonce+timestamp", async () => {
    const a = await signEnvelope({
      method: "m",
      params: [{ x: 1 }],
      privateKey: pk,
      nonce: "n1",
      timestamp: 1000,
    });
    const b = await signEnvelope({
      method: "m",
      params: [{ x: 1 }],
      privateKey: pk,
      nonce: "n1",
      timestamp: 1000,
    });
    expect(a.signature).toBe(b.signature);
  });

  it("matches the on-wire envelope shape", async () => {
    const env = await signEnvelope({
      method: "eth_signMessage",
      params: ["0xabc", "hello"],
      privateKey: pk,
      nonce: "n1",
      timestamp: 42,
    });
    expect(env.clientAddress).toBe(privateKeyToAccount(pk).address);
    expect(env.payload).toEqual({
      method: "eth_signMessage",
      params: ["0xabc", "hello"],
    });
    expect(env.nonce).toBe("n1");
    expect(env.timestamp).toBe(42);
    expect(env.signature.startsWith("0x")).toBe(true);
    // walletId must NOT be on the envelope.
    expect((env as Record<string, unknown>).walletId).toBeUndefined();
  });

  it("includes generated nonce and timestamp when omitted", async () => {
    const env = await signEnvelope({
      method: "m",
      params: [],
      privateKey: pk,
    });
    expect(typeof env.nonce).toBe("string");
    expect(env.nonce.length).toBeGreaterThan(10);
    expect(typeof env.timestamp).toBe("number");
  });

  it("optional correlationId rides on the envelope (but not canonical input)", async () => {
    const a = await signEnvelope({
      method: "m",
      params: [],
      privateKey: pk,
      nonce: "n",
      timestamp: 1,
    });
    const b = await signEnvelope({
      method: "m",
      params: [],
      privateKey: pk,
      nonce: "n",
      timestamp: 1,
      correlationId: "corr-abc",
    });
    expect(a.signature).toBe(b.signature);
    expect(b.correlationId).toBe("corr-abc");
    expect(a.correlationId).toBeUndefined();
  });

  it("produces different signatures for different params", async () => {
    const a = await signEnvelope({
      method: "m",
      params: [1],
      privateKey: pk,
      nonce: "n1",
      timestamp: 1,
    });
    const b = await signEnvelope({
      method: "m",
      params: [2],
      privateKey: pk,
      nonce: "n1",
      timestamp: 1,
    });
    expect(a.signature).not.toBe(b.signature);
  });
});
