/**
 * Character context — a bridge layer for AppContext's character/VRM state.
 *
 * AppProvider owns character state and passes it through CharacterProvider.
 * Components use useCharacter() for VRM index, avatar URLs, and theme
 * without subscribing to all of AppContext.
 */

import { createContext, type ReactNode, useContext } from "react";
import type { UiTheme } from "./ui-preferences";

// ── Types ───────────────────────────────────────────────────────────

export interface CharacterContextValue {
  selectedVrmIndex: number;
  customVrmUrl: string;
  customBackgroundUrl: string;
  uiTheme: UiTheme;
}

const CharacterCtx = createContext<CharacterContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────

export function CharacterProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: CharacterContextValue;
}) {
  return (
    <CharacterCtx.Provider value={value}>
      {children}
    </CharacterCtx.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────────────

export function useCharacter(): CharacterContextValue {
  const ctx = useContext(CharacterCtx);
  if (ctx) return ctx;
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
    return {
      selectedVrmIndex: 1,
      customVrmUrl: "",
      customBackgroundUrl: "",
      uiTheme: "dark" as UiTheme,
    };
  }
  throw new Error(
    "useCharacter must be used within CharacterProvider or AppProvider",
  );
}
