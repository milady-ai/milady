/**
 * Shared HTTP helper for e2e tests.
 */

import http from "node:http";

export type HttpResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  data: Record<string, unknown>;
};

/**
 * Make an HTTP request to a local test server.
 */
export function req(
  port: number,
  method: string,
  path: string,
  body?: Record<string, unknown> | string,
  headersOrContentType?:
    | Record<string, string>
    | string,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const contentType =
      typeof headersOrContentType === "string"
        ? headersOrContentType
        : "application/json";
    const extraHeaders =
      typeof headersOrContentType === "object" ? headersOrContentType : {};

    const b =
      body !== undefined
        ? typeof body === "string"
          ? body
          : JSON.stringify(body)
        : undefined;

    const r = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": contentType,
          ...(b ? { "Content-Length": Buffer.byteLength(b) } : {}),
          ...extraHeaders,
        },
      },
      (res) => {
        const ch: Buffer[] = [];
        res.on("data", (c: Buffer) => ch.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(ch).toString("utf-8");
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            data = { _raw: raw };
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, data });
        });
      },
    );
    r.on("error", reject);
    if (b) r.write(b);
    r.end();
  });
}
