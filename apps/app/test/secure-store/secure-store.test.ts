import { beforeEach, describe, expect, it } from "vitest";
import {
  type ClientAuditEvent,
  MemorySecureStore,
  migrateLegacyLocalStorage,
  setClientAuditEmitter,
  WebCryptoSecureStore,
} from "../../src/secure-store/index.ts";
import { createMemoryStorage } from "../helpers/browser-mocks";

describe("MemorySecureStore", () => {
  it("round-trips values", async () => {
    const store = new MemorySecureStore();
    await store.set("k", "v");
    expect(await store.get("k")).toBe("v");
    await store.remove("k");
    expect(await store.get("k")).toBeNull();
  });

  it("reports isEncryptedAtRest=false", () => {
    expect(new MemorySecureStore().isEncryptedAtRest).toBe(false);
  });
});

describe("WebCryptoSecureStore", () => {
  it("round-trips a value through AES-GCM + PBKDF2", async () => {
    if (typeof crypto?.subtle?.importKey !== "function") {
      // jsdom may not expose subtle.crypto with PBKDF2; skip if so.
      return;
    }
    const storage = createMemoryStorage();
    const store = new WebCryptoSecureStore({
      getPassphrase: async () => "correct-horse-battery-staple",
      storage,
    });
    await store.set("eliza.device.auth", "token-xyz");
    // The raw localStorage value MUST be ciphertext, not plaintext.
    const stored = storage.getItem("eliza.secure.v1:eliza.device.auth");
    expect(stored).toBeTruthy();
    expect(stored).not.toContain("token-xyz");
    const decrypted = await store.get("eliza.device.auth");
    expect(decrypted).toBe("token-xyz");
  });
});

describe("migrateLegacyLocalStorage", () => {
  beforeEach(() => {
    setClientAuditEmitter(null);
  });

  it("moves sensitive keys to secure store and nulls legacy localStorage", async () => {
    const storage = createMemoryStorage();
    storage.setItem("eliza.device.auth", "legacy-token");
    storage.setItem("eliza.device.identity", "device-uuid");
    storage.setItem("unrelated.key", "leave-me");
    const store = new MemorySecureStore();

    const events: ClientAuditEvent[] = [];
    setClientAuditEmitter((e) => events.push(e));

    const result = await migrateLegacyLocalStorage(store, storage);

    expect(result.moved).toContain("eliza.device.auth");
    expect(result.moved).toContain("eliza.device.identity");
    expect(await store.get("eliza.device.auth")).toBe("legacy-token");
    expect(storage.getItem("eliza.device.auth")).toBeNull();
    expect(storage.getItem("unrelated.key")).toBe("leave-me");
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.every((e) => e.action === "secret.update")).toBe(true);
  });

  it("is idempotent — second run is a no-op", async () => {
    const storage = createMemoryStorage();
    storage.setItem("eliza.device.auth", "legacy-token");
    const store = new MemorySecureStore();
    await migrateLegacyLocalStorage(store, storage);
    storage.setItem("eliza.device.auth", "should-not-be-migrated-again");
    const second = await migrateLegacyLocalStorage(store, storage);
    expect(second.moved).toEqual([]);
    // The legacy value remains because the migration sentinel prevents re-run.
    expect(storage.getItem("eliza.device.auth")).toBe(
      "should-not-be-migrated-again",
    );
  });
});
