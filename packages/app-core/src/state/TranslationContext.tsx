/**
 * Standalone translation context — extracted from AppContext.
 *
 * Components that only need the `t()` function should use `useTranslation()`
 * instead of `useApp()` to avoid re-rendering on unrelated state changes.
 *
 * The `t()` function is memoized on `uiLanguage` — it only changes when
 * the user switches language, which is extremely rare after initial load.
 */

import { createContext, type ReactNode, useContext, useMemo } from "react";
import { createTranslator, type UiLanguage } from "../i18n";

export type TranslateFn = (
  key: string,
  vars?: Record<string, string | number | boolean | null | undefined>,
) => string;

interface TranslationContextValue {
  t: TranslateFn;
  uiLanguage: string;
}

const TranslationCtx = createContext<TranslationContextValue | null>(null);

export function TranslationProvider({
  uiLanguage,
  children,
}: {
  uiLanguage: UiLanguage | string;
  children: ReactNode;
}) {
  const t = useMemo(() => createTranslator(uiLanguage), [uiLanguage]);
  const value = useMemo(
    () => ({ t, uiLanguage: String(uiLanguage) }),
    [t, uiLanguage],
  );
  return (
    <TranslationCtx.Provider value={value}>
      {children}
    </TranslationCtx.Provider>
  );
}

/**
 * Use this hook in components that only need translation.
 * Falls back to `useApp().t` if no TranslationProvider is mounted
 * (backwards-compatible during incremental migration).
 */
export function useTranslation(): TranslationContextValue {
  const ctx = useContext(TranslationCtx);
  if (ctx) return ctx;
  // Fallback for test environments
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
    return { t: (k: string) => k, uiLanguage: "en" };
  }
  throw new Error(
    "useTranslation must be used within TranslationProvider or AppProvider",
  );
}
