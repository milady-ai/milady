import type http from "node:http";

// Stub for the shopify route handler. Upstream commit c15213577 added the
// `handleShopifyRoute` import to server.ts and the matching `/api/shopify`
// dispatch block but didn't commit the route handler file itself, leaving
// `develop` in a state where server.ts can't resolve its own import. This
// stub lets the API server boot. Replace with the real implementation
// once upstream lands the missing module.
export async function handleShopifyRoute(
  _req: http.IncomingMessage,
  _res: http.ServerResponse,
  _pathname: string,
  _method: string,
): Promise<boolean> {
  return false;
}
