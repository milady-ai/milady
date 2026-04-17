import { describe, expect, test } from "vitest";
import {
  addUserWhitelistEntry,
  defaultWhitelistDomains,
  extractRegistrableDomain,
  isWhitelisted,
  loadEffectiveWhitelist,
  normalizeWhitelistEntry,
  type WhitelistStorage,
} from "./whitelist.js";

function memoryStorage(initial: readonly string[] = []): WhitelistStorage {
  let state: readonly string[] = initial;
  return {
    async getUserDomains() {
      return state;
    },
    async setUserDomains(domains) {
      state = [...domains];
    },
  };
}

describe("extractRegistrableDomain", () => {
  test("parses https URLs", () => {
    expect(extractRegistrableDomain("https://github.com/login")).toBe(
      "github.com",
    );
    expect(extractRegistrableDomain("https://mail.google.com/mail/u/0")).toBe(
      "google.com",
    );
  });
  test("handles bare hosts", () => {
    expect(extractRegistrableDomain("github.com")).toBe("github.com");
    expect(extractRegistrableDomain("www.github.com")).toBe("github.com");
  });
  test("trailing dots, casing", () => {
    expect(extractRegistrableDomain("GitHub.com.")).toBe("github.com");
  });
  test("rejects junk", () => {
    expect(extractRegistrableDomain("")).toBeNull();
    expect(extractRegistrableDomain("   ")).toBeNull();
    expect(extractRegistrableDomain("localhost")).toBeNull();
    expect(extractRegistrableDomain("127.0.0.1")).toBeNull();
    expect(extractRegistrableDomain("single")).toBeNull();
  });
});

describe("isWhitelisted (subdomain handling)", () => {
  const domains = ["github.com", "google.com"];

  test("matches exact registrable domain", () => {
    const r = isWhitelisted("https://github.com/login", domains);
    expect(r.allowed).toBe(true);
    expect(r.matched).toBe("github.com");
    expect(r.registrableDomain).toBe("github.com");
  });
  test("matches subdomain via parent entry", () => {
    const r = isWhitelisted("https://mail.google.com/u/0", domains);
    expect(r.allowed).toBe(true);
    expect(r.matched).toBe("google.com");
  });
  test("does not match unrelated domain", () => {
    const r = isWhitelisted(
      "http://sketchy-phishing-clone.example/login",
      domains,
    );
    expect(r.allowed).toBe(false);
    expect(r.registrableDomain).toBe("sketchy-phishing-clone.example");
  });
  test("does not match a domain that only shares a suffix string", () => {
    const r = isWhitelisted("https://notgithub.com/", domains);
    // notgithub.com does NOT end with ".github.com" and is not equal to it
    expect(r.allowed).toBe(false);
  });
  test("rejects URL we cannot parse", () => {
    const r = isWhitelisted("", domains);
    expect(r.allowed).toBe(false);
    expect(r.registrableDomain).toBeNull();
  });
  test("rejects localhost and IPs", () => {
    expect(isWhitelisted("http://localhost:3000/", domains).allowed).toBe(
      false,
    );
    expect(isWhitelisted("http://127.0.0.1/", domains).allowed).toBe(false);
  });
});

describe("normalizeWhitelistEntry", () => {
  test("strips scheme, path, case", () => {
    expect(normalizeWhitelistEntry("https://GitHub.com/foo")).toBe(
      "github.com",
    );
    expect(normalizeWhitelistEntry("mail.google.com")).toBe("google.com");
  });
  test("rejects obvious junk", () => {
    expect(normalizeWhitelistEntry("")).toBeNull();
    expect(normalizeWhitelistEntry("   ")).toBeNull();
  });
});

describe("defaultWhitelistDomains", () => {
  test("contains required popular sites", () => {
    const defaults = defaultWhitelistDomains();
    for (const required of [
      "github.com",
      "google.com",
      "stripe.com",
      "figma.com",
      "notion.so",
    ]) {
      expect(defaults).toContain(required);
    }
  });
});

describe("loadEffectiveWhitelist + addUserWhitelistEntry", () => {
  test("merges defaults with user entries, dedupes", async () => {
    const storage = memoryStorage();
    const result = await addUserWhitelistEntry(
      storage,
      "https://custom.example.test/foo",
    );
    expect(result.added).toBe(true);
    expect(result.normalized).toBe("example.test");
    const effective = await loadEffectiveWhitelist(storage);
    expect(effective).toContain("example.test");
    expect(effective).toContain("github.com");
    // duplicate add is a no-op
    const again = await addUserWhitelistEntry(storage, "example.test");
    expect(again.added).toBe(false);
  });
  test("rejects invalid entries", async () => {
    const storage = memoryStorage();
    const result = await addUserWhitelistEntry(storage, "  ");
    expect(result.added).toBe(false);
    expect(result.normalized).toBeNull();
  });
});
