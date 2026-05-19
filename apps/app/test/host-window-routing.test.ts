import { describe, expect, it } from "vitest";

import {
  getWindowNavigationPath,
  isAppWindowRoute,
  isDetachedWindowShell,
  isPillWindowShell,
  resolveWindowShellRoute,
  shouldInstallMainWindowOnboardingPatches,
} from "../src/host-window-routing";

describe("host window routing", () => {
  it("resolves main, pill, settings, and detached surface shells", () => {
    expect(resolveWindowShellRoute("")).toEqual({ mode: "main" });
    expect(resolveWindowShellRoute("?shell=pill")).toEqual({ mode: "pill" });
    expect(resolveWindowShellRoute("?shell=settings&tab=voice")).toEqual({
      mode: "settings",
      tab: "voice",
    });
    expect(resolveWindowShellRoute("?shell=surface&tab=chat")).toEqual({
      mode: "surface",
      tab: "chat",
    });
    expect(resolveWindowShellRoute("?shell=surface&tab=unknown")).toEqual({
      mode: "main",
    });
  });

  it("classifies shell routes for main, pill, and detached windows", () => {
    const mainRoute = resolveWindowShellRoute("");
    const pillRoute = resolveWindowShellRoute("?shell=pill");
    const settingsRoute = resolveWindowShellRoute("?shell=settings");

    expect(shouldInstallMainWindowOnboardingPatches(mainRoute)).toBe(true);
    expect(shouldInstallMainWindowOnboardingPatches(pillRoute)).toBe(false);
    expect(isPillWindowShell(pillRoute)).toBe(true);
    expect(isDetachedWindowShell(settingsRoute)).toBe(true);
  });

  it("uses hash navigation for file URLs and app windows", () => {
    expect(
      getWindowNavigationPath({
        protocol: "file:",
        search: "",
        hash: "#/chat",
        pathname: "/index.html",
      }),
    ).toBe("/chat");
    expect(
      getWindowNavigationPath({
        protocol: "https:",
        search: "?appWindow=1",
        hash: "#/settings",
        pathname: "/",
      }),
    ).toBe("/settings");
    expect(
      getWindowNavigationPath({
        protocol: "https:",
        search: "",
        hash: "#/ignored",
        pathname: "/browser",
      }),
    ).toBe("/browser");
  });

  it("detects app-window routes from query state", () => {
    expect(isAppWindowRoute({ search: "?appWindow=1" })).toBe(true);
    expect(isAppWindowRoute({ search: "?appWindow=0" })).toBe(false);
  });
});
