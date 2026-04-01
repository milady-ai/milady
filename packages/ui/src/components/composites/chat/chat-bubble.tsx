import type * as React from "react";

import { cn } from "../../../lib/utils";

export type ChatBubbleTone = "assistant" | "user";

export interface ChatBubbleProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: ChatBubbleTone;
}

const CHAT_BUBBLE_BASE_CLASSNAME =
  "relative border whitespace-pre-wrap break-words";
const CHAT_BUBBLE_ASSISTANT_CLASSNAME =
  "border border-border/32 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_90%,transparent),color-mix(in_srgb,var(--bg)_96%,transparent))] text-txt shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_18px_26px_-24px_rgba(15,23,42,0.1)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_20px_28px_-24px_rgba(0,0,0,0.22)]";
const CHAT_BUBBLE_USER_CLASSNAME =
  "border border-accent/24 bg-[linear-gradient(180deg,rgba(var(--accent-rgb),0.14),rgba(var(--accent-rgb),0.05))] text-txt-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_18px_26px_-24px_rgba(var(--accent-rgb),0.18)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_28px_-24px_rgba(0,0,0,0.22)]";

export function ChatBubble({
  tone = "assistant",
  className,
  ...props
}: ChatBubbleProps) {
  return (
    <div
      className={cn(
        CHAT_BUBBLE_BASE_CLASSNAME,
        tone === "user"
          ? CHAT_BUBBLE_USER_CLASSNAME
          : CHAT_BUBBLE_ASSISTANT_CLASSNAME,
        className,
      )}
      {...props}
    />
  );
}
