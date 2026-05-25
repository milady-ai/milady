import { beforeEach, describe, expect, it } from "vitest";
import {
  type ClientAuditEvent,
  MemorySecureStore,
  setClientAuditEmitter,
} from "../../src/secure-store/index.ts";
import { createVisionConsentStore as createStore } from "../../src/security/index.ts";

describe("vision-consent", () => {
  beforeEach(() => setClientAuditEmitter(null));

  it("isAllowed is false by default", async () => {
    const store = createStore(new MemorySecureStore());
    expect(await store.isAllowed("local")).toBe(false);
    expect(await store.isAllowed("remote")).toBe(false);
  });

  it("grant + isAllowed + revoke flow", async () => {
    const events: ClientAuditEvent[] = [];
    setClientAuditEmitter((e) => events.push(e));
    const store = createStore(new MemorySecureStore());
    await store.grant({ provider: "remote", sessionId: "sess-1" });
    expect(await store.isAllowed("remote")).toBe(true);
    expect(await store.isAllowed("local")).toBe(true);
    await store.revoke("user_revoked");
    expect(await store.isAllowed("remote")).toBe(false);
    expect(events.map((e) => e.action)).toEqual([
      "vision.allowed",
      "vision.denied",
    ]);
  });

  it("local grant does not imply remote permission", async () => {
    const store = createStore(new MemorySecureStore());
    await store.grant({ provider: "local" });
    expect(await store.isAllowed("local")).toBe(true);
    expect(await store.isAllowed("remote")).toBe(false);
  });
});
