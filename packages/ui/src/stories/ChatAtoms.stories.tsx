import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { TypingIndicator, ChatEmptyState } from "../components/ui/chat-atoms";

const typingMeta = {
  title: "UI/ChatAtoms/TypingIndicator",
  component: TypingIndicator,
  tags: ["autodocs"],
  argTypes: {
    agentName: { control: "text" },
    agentAvatarSrc: { control: "text" },
  },
} satisfies Meta<typeof TypingIndicator>;

export default typingMeta;
type TypingStory = StoryObj<typeof typingMeta>;

export const Default: TypingStory = {
  args: { agentName: "Eliza" },
};

export const WithAvatar: TypingStory = {
  args: {
    agentName: "Eliza",
    agentAvatarSrc: "https://api.dicebear.com/7.x/bottts/svg?seed=eliza",
  },
};

// ChatEmptyState stories exported under a separate meta via a second file
// is the standard pattern, but we can also render it inline:

export const EmptyState: TypingStory = {
  render: () => (
    <div className="h-[400px] border border-border rounded-lg">
      <ChatEmptyState
        agentName="Eliza"
        suggestions={["Hello!", "How are you?", "Tell me a joke"]}
        onSuggestionClick={fn()}
      />
    </div>
  ),
};

export const EmptyStateCustomSuggestions: TypingStory = {
  render: () => (
    <div className="h-[400px] border border-border rounded-lg">
      <ChatEmptyState
        agentName="Milady"
        suggestions={["What can you do?", "Help me code", "Tell me about yourself"]}
        onSuggestionClick={fn()}
      />
    </div>
  ),
};
