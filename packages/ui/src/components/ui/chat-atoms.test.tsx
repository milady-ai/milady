import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TypingIndicator, ChatEmptyState } from "./chat-atoms";

describe("TypingIndicator", () => {
  it("renders agent name", () => {
    render(<TypingIndicator agentName="Alice" />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("renders avatar image when src provided", () => {
    render(
      <TypingIndicator agentName="Alice" agentAvatarSrc="/avatar.png" />,
    );
    const img = screen.getByAltText("Alice avatar");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/avatar.png");
  });

  it("renders initial when no avatar", () => {
    render(<TypingIndicator agentName="Bob" />);
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("renders uppercase initial", () => {
    render(<TypingIndicator agentName="charlie" />);
    expect(screen.getByText("C")).toBeInTheDocument();
  });
});

describe("ChatEmptyState", () => {
  it("renders agent name", () => {
    render(<ChatEmptyState agentName="Alice" />);
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
  });

  it("renders default suggestions", () => {
    render(<ChatEmptyState agentName="Alice" />);
    expect(screen.getByText("Hello!")).toBeInTheDocument();
    expect(screen.getByText("How are you?")).toBeInTheDocument();
  });

  it("renders custom suggestions", () => {
    render(
      <ChatEmptyState agentName="Alice" suggestions={["Custom one"]} />,
    );
    expect(screen.getByText("Custom one")).toBeInTheDocument();
  });

  it("calls onSuggestionClick when suggestion clicked", () => {
    const onClick = vi.fn();
    render(
      <ChatEmptyState
        agentName="Alice"
        suggestions={["Greet"]}
        onSuggestionClick={onClick}
      />,
    );
    fireEvent.click(screen.getByText("Greet"));
    expect(onClick).toHaveBeenCalledWith("Greet");
  });
});
