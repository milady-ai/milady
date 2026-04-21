// @vitest-environment jsdom

import { ChatMessage } from "@miladyai/ui";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

describe("ChatMessage actions", () => {
  it("reveals assistant actions on tap when hover is unavailable", async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          ChatMessage,
          {
            message: {
              id: "assistant-1",
              role: "assistant",
              text: "hello there",
              timestamp: 1,
            },
            labels: { play: "aria.playMessage" },
            onSpeak: vi.fn(),
            onCopy: vi.fn(),
          },
          React.createElement("span", null, "hello there"),
        ),
      );
    });

    const actionButtonsBeforeTap = tree.root.findAll(
      (node) =>
        node.type === "button" && node.props["aria-label"] === "Copy message",
    );
    expect(actionButtonsBeforeTap).toHaveLength(1);
    expect(
      tree.root.findAll(
        (node) =>
          typeof node.props.className === "string" &&
          node.props.className.includes("pointer-events-none opacity-0"),
      ),
    ).toHaveLength(1);

    await act(async () => {
      tree.root
        .findByProps({ "data-testid": "chat-message" })
        .props.onTouchEnd({
          target: {
            closest: () => null,
          },
        });
    });

    tree.root.findByProps({ "aria-label": "Copy message" });
    expect(
      tree.root.findAll(
        (node) =>
          typeof node.props.className === "string" &&
          node.props.className.includes("opacity-100"),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findByProps({ "aria-label": "aria.playMessage" }),
    ).toBeDefined();
  });

  it("renders copy and play actions for assistant messages", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          ChatMessage,
          {
            message: {
              id: "assistant-1",
              role: "assistant",
              text: "hello there",
              timestamp: 1,
            },
            labels: { play: "aria.playMessage" },
            onSpeak: vi.fn(),
            onCopy: vi.fn(),
          },
          React.createElement("span", null, "hello there"),
        ),
      );
    });

    expect(
      tree.root.findByProps({ "aria-label": "Copy message" }),
    ).toBeDefined();
    expect(
      tree.root.findByProps({ "aria-label": "aria.playMessage" }),
    ).toBeDefined();
  });

  it("plays assistant messages from the message action button", async () => {
    const onSpeak = vi.fn();

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          ChatMessage,
          {
            message: {
              id: "assistant-1",
              role: "assistant",
              text: "hello there",
              timestamp: 1,
            },
            labels: { play: "aria.playMessage" },
            onSpeak,
            onCopy: vi.fn(),
          },
          React.createElement("span", null, "hello there"),
        ),
      );
    });

    const playButton = tree.root.findByProps({
      "aria-label": "aria.playMessage",
    });
    await act(async () => {
      playButton.props.onClick();
    });

    expect(onSpeak).toHaveBeenCalledWith("assistant-1", "hello there");
  });

  it("edits and resends user messages from the inline editor", async () => {
    const onEdit = vi.fn(async () => true);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          ChatMessage,
          {
            message: {
              id: "user-1",
              role: "user",
              text: "old text",
              timestamp: 1,
            },
            onEdit,
            labels: {
              edit: "aria.editMessage",
              cancel: "common.cancel",
              saveAndResend: "Save and resend",
              saving: "Saving...",
            },
          },
          React.createElement("span", null, "old text"),
        ),
      );
    });

    const editButton = tree.root.findByProps({
      "aria-label": "aria.editMessage",
    });
    await act(async () => {
      editButton.props.onClick();
    });

    const textarea = tree.root.findByProps({
      "aria-label": "aria.editMessage",
    });
    await act(async () => {
      textarea.props.onChange({ target: { value: "edited text" } });
    });

    const saveButton = tree.root
      .findAllByType("button")
      .find((button) =>
        button.children.some((child) => child === "Save and resend"),
      );
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton?.props.onClick();
    });

    expect(onEdit).toHaveBeenCalledWith("user-1", "edited text");
  });

  it("does not render a retry action for interrupted assistant messages", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          ChatMessage,
          {
            message: {
              id: "assistant-1",
              role: "assistant",
              text: "partial",
              interrupted: true,
              timestamp: 1,
            },
            labels: {
              play: "aria.playMessage",
              responseInterrupted: "chatmessage.ResponseInterrupte",
            },
            onSpeak: vi.fn(),
            onCopy: vi.fn(),
          },
          React.createElement("span", null, "partial"),
        ),
      );
    });

    expect(
      tree.root.findAllByProps({ "aria-label": "Retry message" }),
    ).toHaveLength(0);
  });

  it("uses the emphasized user bubble treatment for editable user messages", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          ChatMessage,
          {
            message: {
              id: "user-1",
              role: "user",
              text: "hello there",
              timestamp: 1,
            },
            onEdit: vi.fn(async () => true),
            labels: { edit: "aria.editMessage" },
          },
          React.createElement("span", null, "hello there"),
        ),
      );
    });

    expect(
      tree.root.findAll(
        (node) =>
          typeof node.props.className === "string" &&
          node.props.className.includes("border-accent/24"),
      ).length,
    ).toBeGreaterThan(0);
  });

  it("keeps the user message action rail inline beside the bubble", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          ChatMessage,
          {
            message: {
              id: "user-1",
              role: "user",
              text: "hello there",
              timestamp: 1,
            },
            onCopy: vi.fn(),
            onEdit: vi.fn(async () => true),
            labels: { edit: "aria.editMessage" },
          },
          React.createElement("span", null, "hello there"),
        ),
      );
    });

    const actionRail = tree.root.find(
      (node) =>
        node.type === "div" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("inline-flex items-center gap-1") &&
        node.props.className.includes("whitespace-nowrap"),
    );

    expect(actionRail).toBeDefined();
    expect(
      actionRail.findByProps({ "aria-label": "Copy message" }),
    ).toBeDefined();
    expect(
      actionRail.findByProps({ "aria-label": "aria.editMessage" }),
    ).toBeDefined();
  });
});
