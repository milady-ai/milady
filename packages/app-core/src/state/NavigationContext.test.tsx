// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { NavigationProvider, useNavigation } from "./NavigationContext";
import type { NavigationContextValue } from "./NavigationContext";

const defaultValue: NavigationContextValue = {
  tab: "companion",
  uiShellMode: "companion",
  lastNativeTab: "chat",
  appsSubTab: "browse",
  agentSubTab: "character",
  pluginsSubTab: "features",
  databaseSubTab: "tables",
  setTab: () => {},
  setTabRaw: () => {},
  setUiShellMode: () => {},
  switchUiShellMode: () => {},
  switchShellView: () => {},
  setAppsSubTab: () => {},
  setAgentSubTab: () => {},
  setPluginsSubTab: () => {},
  setDatabaseSubTab: () => {},
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NavigationProvider value={defaultValue}>{children}</NavigationProvider>
  );
}

describe("NavigationProvider", () => {
  it("provides navigation values from AppProvider", () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });
    expect(result.current.tab).toBe("companion");
    expect(result.current.uiShellMode).toBe("companion");
  });

  it("exposes sub-tab defaults", () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });
    expect(result.current.appsSubTab).toBe("browse");
    expect(result.current.agentSubTab).toBe("character");
    expect(result.current.pluginsSubTab).toBe("features");
    expect(result.current.databaseSubTab).toBe("tables");
  });

  it("passes through custom values", () => {
    const custom: NavigationContextValue = {
      ...defaultValue,
      tab: "settings",
      uiShellMode: "native",
    };
    const customWrapper = ({ children }: { children: ReactNode }) => (
      <NavigationProvider value={custom}>{children}</NavigationProvider>
    );
    const { result } = renderHook(() => useNavigation(), {
      wrapper: customWrapper,
    });
    expect(result.current.tab).toBe("settings");
    expect(result.current.uiShellMode).toBe("native");
  });
});
