function hasRequestForPath(
  requests: readonly string[],
  pathname: string,
): boolean {
  return requests.some((request) => request.endsWith(` ${pathname}`));
}

export interface PackagedRendererBootstrapProbe {
  ok: boolean;
  apiBase: string | null;
  bootApiBase: string | null;
  legacyApiBase: string | null;
  status: number | null;
  error?: string;
}

export function getPackagedRendererBootstrapProbeScript(): string {
  return `(async () => {
    try {
      const bootSymbol = Symbol.for("elizaos.app.boot-config");
      const bootConfig =
        window.__ELIZAOS_APP_BOOT_CONFIG__ ??
        window.__ELIZA_APP_BOOT_CONFIG__ ??
        window[bootSymbol]?.current ??
        null;
      const bootApiBase =
        typeof bootConfig?.apiBase === "string" ? bootConfig.apiBase : null;
      const legacyApiBase =
        typeof window.__ELIZA_API_BASE__ === "string"
          ? window.__ELIZA_API_BASE__
          : null;
      const response = await fetch("/api/status", { cache: "no-store" });
      return {
        ok: true,
        apiBase: bootApiBase ?? legacyApiBase,
        bootApiBase,
        legacyApiBase,
        status: response.status,
      };
    } catch (error) {
      return {
        ok: false,
        apiBase: null,
        bootApiBase: null,
        legacyApiBase: null,
        status: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })()`;
}

export function isPackagedRendererBootstrapProbeReady(
  probe: PackagedRendererBootstrapProbe,
  expectedApiBase: string,
): boolean {
  return (
    probe.ok &&
    probe.apiBase === expectedApiBase &&
    typeof probe.status === "number" &&
    probe.status >= 200 &&
    probe.status < 500
  );
}

export function hasPackagedRendererBootstrapRequests(
  requests: readonly string[],
): boolean {
  if (hasRequestForPath(requests, "/api/status")) {
    return true;
  }

  // The splash-first startup flow can pause after the renderer fetches config
  // but before it reaches stream/drop endpoints. /api/config is renderer-owned
  // in this packaged bootstrap path; main-process heartbeat traffic does not hit it.
  if (hasRequestForPath(requests, "/api/config")) {
    return true;
  }

  // On a fresh install the renderer stays on the splash "Press Start" screen
  // and never makes API calls. The main process still fires heartbeat menu
  // refresh immediately on launch, which hits /api/triggers. Accepting this
  // as a valid bootstrap signal proves the packaged app started and is
  // communicating with the overridden API base (MILADY_DESKTOP_TEST_API_BASE).
  if (hasRequestForPath(requests, "/api/triggers")) {
    return true;
  }

  return (
    hasRequestForPath(requests, "/api/drop/status") ||
    hasRequestForPath(requests, "/api/stream/settings")
  );
}
