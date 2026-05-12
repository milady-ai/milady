// node:https — same surface as node:http. URLSession handles TLS internally so
// the bridge is the same. Default protocol differs.

import http, {
  request as httpRequest,
  get as httpGet,
  createServer as httpCreateServer,
  Agent as HttpAgent,
  Server,
  ServerResponse,
  IncomingMessage,
  ClientRequest,
  METHODS,
  STATUS_CODES,
} from "./http.js";
import type { RequestOptions } from "./http.js";

export function request(
  optsOrUrl: RequestOptions | string | URL,
  optsOrCb?: RequestOptions | ((res: IncomingMessage) => void),
  cb?: (res: IncomingMessage) => void,
): ClientRequest {
  if (typeof optsOrUrl === "object" && !(optsOrUrl instanceof URL)) {
    optsOrUrl = { ...optsOrUrl, protocol: "https:" };
  }
  return httpRequest(optsOrUrl, optsOrCb, cb);
}

export function get(
  optsOrUrl: RequestOptions | string | URL,
  optsOrCb?: RequestOptions | ((res: IncomingMessage) => void),
  cb?: (res: IncomingMessage) => void,
): ClientRequest {
  if (typeof optsOrUrl === "object" && !(optsOrUrl instanceof URL)) {
    optsOrUrl = { ...optsOrUrl, protocol: "https:" };
  }
  return httpGet(optsOrUrl, optsOrCb, cb);
}

export const createServer = httpCreateServer;
export const Agent = HttpAgent;
export const globalAgent = new HttpAgent();
export { Server, ServerResponse, IncomingMessage, ClientRequest, METHODS, STATUS_CODES };

export default {
  ...http,
  request,
  get,
  Agent,
  globalAgent,
};
