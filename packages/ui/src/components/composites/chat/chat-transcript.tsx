import type * as React from "react";

import { memo } from "react";

import { ChatBubble } from "./chat-bubble";
import { ChatMessage } from "./chat-message";
import type {
  ChatMessageData,
  ChatMessageLabels,
  ChatVariant,
} from "./chat-types";

export interface ChatTranscriptProps {
  agentName?: string;
  carryoverMessages?: ChatMessageData[];
  carryoverOpacity?: number;
  labels?: ChatMessageLabels;
  messages: ChatMessageData[];
  onCopy?: (text: string) => void;
  onDelete?: (messageId: string) => void;
  onEdit?: (messageId: string, text: string) => Promise<boolean> | boolean;
  onSpeak?: (messageId: string, text: string) => void;
  renderMessageContent?: (message: ChatMessageData) => React.ReactNode;
  typingIndicator?: React.ReactNode;
  variant?: ChatVariant;
}

function renderTranscriptMessageContent(
  message: ChatMessageData,
  renderMessageContent?: (message: ChatMessageData) => React.ReactNode,
) {
  return renderMessageContent?.(message) ?? message.text;
}

export const ChatTranscript = memo(function ChatTranscript({
  agentName = "Agent",
  carryoverMessages = [],
  carryoverOpacity = 1,
  labels,
  messages,
  onCopy,
  onDelete,
  onEdit,
  onSpeak,
  renderMessageContent,
  typingIndicator,
  variant = "default",
}: ChatTranscriptProps) {
  if (variant === "game-modal") {
    return (
      <div className="flex min-h-full w-full flex-col justify-end gap-4 px-1 py-4">
        {carryoverMessages.map((message) => {
          const isUser = message.role === "user";
          return (
            <div
              key={`carryover-${message.id}`}
              data-testid="companion-message-row"
              data-companion-carryover="true"
              className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
              style={{ opacity: carryoverOpacity }}
            >
              <ChatBubble
                tone={isUser ? "user" : "assistant"}
                className={`max-w-[min(85%,24rem)] rounded-2xl px-4 py-3 text-[15px] leading-relaxed backdrop-blur-md ${
                  isUser ? "rounded-br-sm" : "rounded-bl-sm"
                }`}
              >
                <div
                  className="break-words"
                  style={{ fontFamily: "var(--font-chat)" }}
                >
                  {renderTranscriptMessageContent(
                    message,
                    renderMessageContent,
                  )}
                </div>
              </ChatBubble>
            </div>
          );
        })}
        {messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <div
              key={message.id}
              data-testid="companion-message-row"
              className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
            >
              <ChatBubble
                tone={isUser ? "user" : "assistant"}
                className={`max-w-[min(85%,24rem)] rounded-2xl px-4 py-3 text-[15px] leading-relaxed backdrop-blur-md ${
                  isUser ? "rounded-br-sm" : "rounded-bl-sm"
                }`}
              >
                <div
                  className="break-words"
                  style={{ fontFamily: "var(--font-chat)" }}
                >
                  {renderTranscriptMessageContent(
                    message,
                    renderMessageContent,
                  )}
                </div>
              </ChatBubble>
            </div>
          );
        })}
        {typingIndicator}
      </div>
    );
  }

  return (
    <div className="w-full space-y-1.5">
      {messages.map((message, index) => {
        const previousMessage = index > 0 ? messages[index - 1] : null;
        const isGrouped = previousMessage?.role === message.role;

        return (
          <ChatMessage
            key={message.id}
            message={message}
            isGrouped={isGrouped}
            agentName={agentName}
            labels={labels}
            onCopy={onCopy}
            onDelete={onDelete}
            onEdit={onEdit}
            onSpeak={onSpeak}
          >
            {renderTranscriptMessageContent(message, renderMessageContent)}
          </ChatMessage>
        );
      })}
      {typingIndicator}
    </div>
  );
});
