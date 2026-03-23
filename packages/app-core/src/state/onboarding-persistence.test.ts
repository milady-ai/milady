import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadPersistedOnboardingComplete,
  savePersistedOnboardingComplete,
} from "./persistence";

const STORAGE_KEY = "eliza:onboarding-complete";

describe("onboarding completion persistence", () => {
  let store: Record<string, string>;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    store = {};
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it("returns false when localStorage is empty", () => {
    expect(loadPersistedOnboardingComplete()).toBe(false);
  });

  it("returns true when localStorage has '1'", () => {
    store[STORAGE_KEY] = "1";
    expect(loadPersistedOnboardingComplete()).toBe(true);
  });

  it("returns false for any non-'1' value", () => {
    store[STORAGE_KEY] = "true";
    expect(loadPersistedOnboardingComplete()).toBe(false);

    store[STORAGE_KEY] = "0";
    expect(loadPersistedOnboardingComplete()).toBe(false);
  });

  it("savePersistedOnboardingComplete(true) sets '1'", () => {
    savePersistedOnboardingComplete(true);
    expect(store[STORAGE_KEY]).toBe("1");
  });

  it("savePersistedOnboardingComplete(false) removes the key", () => {
    store[STORAGE_KEY] = "1";
    savePersistedOnboardingComplete(false);
    expect(store[STORAGE_KEY]).toBeUndefined();
  });

  it("round-trips correctly", () => {
    savePersistedOnboardingComplete(true);
    expect(loadPersistedOnboardingComplete()).toBe(true);

    savePersistedOnboardingComplete(false);
    expect(loadPersistedOnboardingComplete()).toBe(false);
  });
});
