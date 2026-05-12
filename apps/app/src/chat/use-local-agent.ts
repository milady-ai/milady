/**
 * `useLocalAgent` — thin React wrapper around the iOS local runtime boot
 * module. Returns `{ ready: false }` when not applicable (non-iOS, mode
 * !== "local", or runtime failed to start) so callers can fall through
 * to cloud paths with no extra branching.
 *
 * The hook subscribes to the document-level custom events emitted by
 * `ios-local-runtime-boot.ts` so that messages produced by the on-device
 * agent (including out-of-band replies dispatched via `agent-log`) flow
 * back to React components.
 */

import { useCallback, useEffect, useState } from "react";
import {
  getLocalAgentStatus,
  IOS_LOCAL_AGENT_ERROR_EVENT,
  IOS_LOCAL_AGENT_REPLY_EVENT,
  isIosLocalRuntimeReady,
  type LocalAgentReply,
  type LocalAgentStatus,
  sendLocalAgentMessage,
} from "../ios-local-runtime-boot";

export interface UseLocalAgentResult {
  ready: boolean;
  status: LocalAgentStatus;
  lastReply: LocalAgentReply | null;
  lastError: string | null;
  sendMessage: (
    text: string,
    conversationId?: string,
  ) => Promise<LocalAgentReply>;
  refreshStatus: () => Promise<void>;
}

function readReplyDetail(event: Event): LocalAgentReply | null {
  if (!(event instanceof CustomEvent)) return null;
  const detail = event.detail;
  if (
    detail &&
    typeof detail === "object" &&
    "reply" in detail &&
    typeof (detail as { reply: unknown }).reply === "string"
  ) {
    return detail as LocalAgentReply;
  }
  return null;
}

function readErrorDetail(event: Event): string | null {
  if (!(event instanceof CustomEvent)) return null;
  const detail = event.detail;
  if (typeof detail === "string") return detail;
  if (
    detail &&
    typeof detail === "object" &&
    "message" in detail &&
    typeof (detail as { message: unknown }).message === "string"
  ) {
    return (detail as { message: string }).message;
  }
  return null;
}

/**
 * Subscribe to the iOS local runtime. Always safe to call — on any
 * platform / runtime mode other than iOS local, this returns
 * `{ ready: false }` and `sendMessage` rejects.
 */
export function useLocalAgent(): UseLocalAgentResult {
  const [ready, setReady] = useState<boolean>(() => isIosLocalRuntimeReady());
  const [status, setStatus] = useState<LocalAgentStatus>(() => ({
    ready: isIosLocalRuntimeReady(),
  }));
  const [lastReply, setLastReply] = useState<LocalAgentReply | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const next = await getLocalAgentStatus();
    setStatus(next);
    setReady(next.ready);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = (): void => {
      if (cancelled) return;
      void refreshStatus();
    };
    tick();
    // Poll until the runtime reports ready. Once ready, we stop polling
    // and rely on the document-level events for state changes.
    const interval = window.setInterval(() => {
      if (cancelled || isIosLocalRuntimeReady()) {
        window.clearInterval(interval);
        return;
      }
      tick();
    }, 500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshStatus]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const onReply = (event: Event): void => {
      const detail = readReplyDetail(event);
      if (detail) setLastReply(detail);
    };
    const onError = (event: Event): void => {
      const detail = readErrorDetail(event);
      if (detail) setLastError(detail);
    };

    document.addEventListener(IOS_LOCAL_AGENT_REPLY_EVENT, onReply);
    document.addEventListener(IOS_LOCAL_AGENT_ERROR_EVENT, onError);
    return () => {
      document.removeEventListener(IOS_LOCAL_AGENT_REPLY_EVENT, onReply);
      document.removeEventListener(IOS_LOCAL_AGENT_ERROR_EVENT, onError);
    };
  }, []);

  const sendMessage = useCallback(
    async (text: string, conversationId?: string): Promise<LocalAgentReply> => {
      const reply = await sendLocalAgentMessage(text, conversationId);
      setLastReply(reply);
      return reply;
    },
    [],
  );

  return {
    ready,
    status,
    lastReply,
    lastError,
    sendMessage,
    refreshStatus,
  };
}
