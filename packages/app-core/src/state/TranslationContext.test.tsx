// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { TranslationProvider, useTranslation } from "./TranslationContext";

function wrapper({ children }: { children: ReactNode }) {
  return <TranslationProvider uiLanguage="en">{children}</TranslationProvider>;
}

describe("TranslationProvider", () => {
  it("provides t() that translates keys", () => {
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(typeof result.current.t).toBe("function");
    // Known key returns non-empty string
    const translated = result.current.t("common.cancel");
    expect(translated).toBeTruthy();
    expect(typeof translated).toBe("string");
  });

  it("provides uiLanguage", () => {
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.uiLanguage).toBe("en");
  });

  it("returns key when translation is missing", () => {
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.t("nonexistent.key.12345")).toBe(
      "nonexistent.key.12345",
    );
  });
});
