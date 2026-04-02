function hasRequestForPath(
  requests: readonly string[],
  pathname: string,
): boolean {
  return requests.some((request) => request.endsWith(` ${pathname}`));
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

  return (
    hasRequestForPath(requests, "/api/drop/status") ||
    hasRequestForPath(requests, "/api/stream/settings")
  );
}
