import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { WechatMessageContext, WechatMessageType } from "./types";

const WECHAT_TYPE_MAP: Record<
  number,
  { type: WechatMessageType; scope: "private" | "group" }
> = {
  60001: { type: "text", scope: "private" },
  80001: { type: "text", scope: "group" },
};

export interface CallbackServerOptions {
  port: number;
  apiKey: string;
  onMessage: (msg: WechatMessageContext) => void;
  signal?: AbortSignal;
  accountId?: string;
}

export function startCallbackServer(options: CallbackServerOptions): {
  close: () => void;
  port: number;
} {
  const { port, apiKey, onMessage, signal, accountId } = options;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // Only accept POST to webhook path
    const expectedPath = accountId
      ? `/webhook/wechat/${accountId}`
      : "/webhook/wechat";

    if (req.method !== "POST" || !req.url?.startsWith(expectedPath)) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    // Validate API key
    const incomingKey = req.headers["x-api-key"];
    if (incomingKey !== apiKey) {
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }

    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const payload = JSON.parse(body) as Record<string, unknown>;
        const message = normalizePayload(payload);
        if (message) {
          onMessage(message);
        }
        res.writeHead(200);
        res.end("OK");
      } catch {
        res.writeHead(400);
        res.end("Bad Request");
      }
    });
  });

  server.listen(port, () => {
    console.log(`[wechat] Webhook server listening on port ${port}`);
  });

  server.on("error", (err: Error) => {
    if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
      console.error(
        `[wechat] Port ${port} already in use — webhook server failed to start`,
      );
    } else {
      console.error(`[wechat] Webhook server error:`, err);
    }
  });

  if (signal) {
    signal.addEventListener("abort", () => {
      server.close();
    });
  }

  return {
    close: () => server.close(),
    port,
  };
}

function normalizePayload(
  payload: Record<string, unknown>,
): WechatMessageContext | null {
  // Support two payload formats: nested "raw" and flattened "proxy"
  const data =
    (payload.data as Record<string, unknown>) ??
    (payload.content ? payload : null);

  if (!data) {
    console.warn("[wechat] Unrecognized webhook payload format");
    return null;
  }

  const typeCode = Number(data.type ?? data.msgType ?? 0);
  const mapping = WECHAT_TYPE_MAP[typeCode];

  // For unmapped types, check if it looks like an image
  let msgType: WechatMessageType = "unknown";
  let scope: "private" | "group" = "private";

  if (mapping) {
    msgType = mapping.type;
    scope = mapping.scope;
  } else if (typeCode >= 60002 && typeCode <= 60010) {
    // Private media types
    msgType = "image";
    scope = "private";
  } else if (typeCode >= 80002 && typeCode <= 80010) {
    // Group media types
    msgType = "image";
    scope = "group";
  }

  if (msgType === "unknown") {
    console.warn(`[wechat] Unknown message type code: ${typeCode}`);
    return null;
  }

  const sender = String(data.sender ?? data.from ?? "");
  const recipient = String(data.recipient ?? data.to ?? "");
  const content = String(data.content ?? data.text ?? "");
  const timestamp = Number(data.timestamp ?? Date.now());
  const msgId = String(data.msgId ?? data.id ?? `${sender}-${timestamp}`);

  // Group detection
  const isGroup = scope === "group" || sender.includes("@chatroom");
  const threadId = isGroup
    ? String(data.roomId ?? data.threadId ?? sender)
    : undefined;
  const groupSubject = isGroup
    ? String(data.roomName ?? data.groupName ?? threadId ?? "")
    : undefined;

  // Image URL extraction
  const imageUrl =
    msgType === "image"
      ? String(data.imageUrl ?? data.mediaUrl ?? data.url ?? "")
      : undefined;

  return {
    id: msgId,
    type: msgType,
    sender,
    recipient,
    content,
    timestamp,
    threadId,
    group: groupSubject ? { subject: groupSubject } : undefined,
    imageUrl: imageUrl || undefined,
    raw: payload,
  };
}
