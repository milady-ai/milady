import type {
  ConversationMessage,
  StreamEventEnvelope,
} from "@miladyai/app-core/api";
import { useApp } from "@miladyai/app-core/state";
import { useEffect, useMemo, useRef } from "react";
import { CHANNEL_COLORS, getEventSource, getEventText } from "./helpers";

export function ChatContent({
  events,
  messages,
}: {
  events: StreamEventEnvelope[];
  messages: ConversationMessage[];
}) {
  const { t } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);

  const recentExchanges = useMemo(() => {
    const exchanges: Array<{
      id: string;
      role: "user" | "assistant" | "event";
      text: string;
      source?: string;
      from?: string;
      ts: number;
    }> = [];

    // Build lookup from events for username resolution
    const eventFromLookup = new Map<string, string>();
    for (const evt of events) {
      if (evt.stream !== "message") continue;
      const p = evt.payload as Record<string, unknown>;
      const text = typeof p.text === "string" ? p.text.trim() : "";
      const from = typeof p.from === "string" ? p.from : "";
      if (text && from) eventFromLookup.set(text, from);
    }

    for (const msg of messages.slice(-8)) {
      exchanges.push({
        id: msg.id,
        role: msg.role,
        text: msg.text,
        source: msg.source,
        from: msg.from ?? eventFromLookup.get(msg.text.trim()),
        ts: msg.timestamp,
      });
    }

    const assistantEvents = events
      .filter((e) => e.stream === "assistant")
      .slice(-4);
    for (const evt of assistantEvents) {
      const text = getEventText(evt);
      if (!exchanges.some((e) => e.text === text)) {
        exchanges.push({
          id: evt.eventId,
          role: "event",
          text,
          source: getEventSource(evt),
          ts: evt.ts,
        });
      }
    }

    return exchanges.sort((a, b) => a.ts - b.ts).slice(-10);
  }, [events, messages]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when exchanges change
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [recentExchanges]);

  return (
    <div
      ref={scrollRef}
      className="h-full w-full space-y-3 overflow-y-auto px-4 py-4 sm:px-5"
    >
      {recentExchanges.length === 0 ? (
        <div className="flex h-full items-center justify-center py-8">
          <div className="max-w-md rounded-3xl border border-border/55 bg-card/90 px-6 py-8 text-center shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
              Stream Chat
            </p>
            <p className="mt-2 text-lg font-semibold tracking-[-0.02em] text-txt">
              The room is quiet right now
            </p>
            <p className="mt-3 text-sm leading-6 text-muted">
              {t("chatcontent.WaitingForMessages")}
            </p>
          </div>
        </div>
      ) : (
        recentExchanges.map((exchange) => {
          const agentLike =
            exchange.role === "assistant" || exchange.role === "event";
          const channelStyle =
            exchange.role === "user" && exchange.source
              ? CHANNEL_COLORS[exchange.source]
              : undefined;
          return (
            <div
              key={exchange.id}
              className={`flex w-full ${agentLike ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[min(88%,42rem)] rounded-2xl border px-4 py-3 shadow-sm sm:max-w-[min(78%,42rem)] ${
                  agentLike
                    ? "border-accent/30 bg-accent/10 text-txt-strong"
                    : channelStyle
                      ? `${channelStyle.bg} ${channelStyle.border} text-txt`
                      : "border-border/55 bg-card/92 text-txt"
                }`}
              >
                <div className="mb-1.5 flex min-w-0 items-center gap-2">
                  <div
                    className={`min-w-0 truncate text-[10px] font-medium uppercase tracking-[0.18em] ${
                      agentLike
                        ? "text-accent-fg"
                        : (channelStyle?.text ?? "text-muted-strong")
                    }`}
                  >
                    {exchange.role === "user"
                      ? exchange.from
                        ? `@${exchange.from}`
                        : (exchange.source ?? "viewer")
                      : "agent"}
                  </div>
                  {exchange.source && agentLike ? (
                    <span className="inline-flex min-w-0 items-center rounded-full border border-border/45 bg-bg-hover/70 px-2 py-0.5 text-[10px] text-muted-strong">
                      <span className="truncate">{exchange.source}</span>
                    </span>
                  ) : null}
                </div>
                <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {exchange.text}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
