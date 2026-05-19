export type DetachedSurfaceTab =
  | "browser"
  | "chat"
  | "release"
  | "triggers"
  | "plugins"
  | "connectors"
  | "cloud";

export type WindowShellRoute =
  | { mode: "main" }
  | { mode: "pill" }
  | { mode: "settings"; tab?: string }
  | { mode: "surface"; tab: DetachedSurfaceTab };

export type DetachedWindowShellRoute = Exclude<
  WindowShellRoute,
  { mode: "main" } | { mode: "pill" }
>;

export function resolveWindowShellRoute(
  search = typeof window !== "undefined" ? window.location.search : "",
): WindowShellRoute {
  const params = new URLSearchParams(search);
  const shell = params.get("shell");

  if (shell === "pill") {
    return { mode: "pill" };
  }

  if (shell === "settings") {
    const tab = params.get("tab")?.trim() || undefined;
    return tab ? { mode: "settings", tab } : { mode: "settings" };
  }

  if (shell === "surface") {
    const tab = params.get("tab");
    if (
      tab === "browser" ||
      tab === "chat" ||
      tab === "release" ||
      tab === "triggers" ||
      tab === "plugins" ||
      tab === "connectors" ||
      tab === "cloud"
    ) {
      return { mode: "surface", tab };
    }
  }

  return { mode: "main" };
}

export function isPillWindowShell(
  route: WindowShellRoute,
): route is { mode: "pill" } {
  return route.mode === "pill";
}

export function isDetachedWindowShell(
  route: WindowShellRoute,
): route is DetachedWindowShellRoute {
  return route.mode !== "main" && route.mode !== "pill";
}

export function shouldInstallMainWindowOnboardingPatches(
  route: WindowShellRoute,
): boolean {
  return route.mode === "main";
}

export function isAppWindowRoute(
  location: Pick<Location, "search"> | undefined = typeof window === "undefined"
    ? undefined
    : window.location,
): boolean {
  if (!location) return false;
  try {
    return new URLSearchParams(location.search).get("appWindow") === "1";
  } catch {
    return false;
  }
}

function shouldUseHashNavigation(
  location:
    | Pick<Location, "hash" | "pathname" | "protocol" | "search">
    | undefined = typeof window === "undefined" ? undefined : window.location,
): boolean {
  if (!location) return false;
  return location.protocol === "file:" || isAppWindowRoute(location);
}

export function getWindowNavigationPath(
  location:
    | Pick<Location, "hash" | "pathname" | "protocol" | "search">
    | undefined = typeof window === "undefined" ? undefined : window.location,
): string {
  if (!location) return "/";
  return shouldUseHashNavigation(location)
    ? location.hash.replace(/^#/, "") || "/"
    : location.pathname;
}

function pathForDetachedShell(route: DetachedWindowShellRoute): string {
  if (route.mode === "settings") return "/settings";

  switch (route.tab) {
    case "browser":
      return "/browser";
    case "chat":
      return "/chat";
    case "release":
      return "/settings";
    case "triggers":
      return "/automations";
    case "plugins":
      return "/apps/plugins";
    case "connectors":
      return "/connectors";
    case "cloud":
      return "/settings";
  }
}

export function syncDetachedShellLocation(
  route: DetachedWindowShellRoute,
): boolean {
  if (typeof window === "undefined") return false;
  const nextUrl = new URL(window.location.href);
  nextUrl.pathname = pathForDetachedShell(route);
  window.history.replaceState(null, "", nextUrl.toString());
  return true;
}
