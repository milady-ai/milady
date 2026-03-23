// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { NavigationProvider } from "./NavigationContext";

// Import the hook directly since it's not publicly exported
import { useNavigation } from "./NavigationContext";

function wrapper({ children }: { children: ReactNode }) {
  return <NavigationProvider>{children}</NavigationProvider>;
}

describe("NavigationProvider", () => {
  it("defaults to companion tab", () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });
    expect(result.current.tab).toBe("companion");
    expect(result.current.uiShellMode).toBe("companion");
  });

  it("setTab updates tab", () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });
    act(() => {
      result.current.setTab("settings");
    });
    expect(result.current.tab).toBe("settings");
  });

  it("switchUiShellMode to native uses lastNativeTab", () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });
    // Switch to native — should use whatever lastNativeTab is
    act(() => {
      result.current.switchUiShellMode("native");
    });
    expect(result.current.uiShellMode).toBe("native");
    // Tab should be a non-companion tab
    expect(result.current.tab).not.toBe("companion");
  });

  it("sub-tabs have correct defaults", () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });
    expect(result.current.appsSubTab).toBe("browse");
    expect(result.current.agentSubTab).toBe("character");
    expect(result.current.pluginsSubTab).toBe("features");
    expect(result.current.databaseSubTab).toBe("tables");
  });
});
