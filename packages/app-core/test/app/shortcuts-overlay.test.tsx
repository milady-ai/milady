// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => ({ t: (key: string) => key }),
}));

// Mock @miladyai/ui Dialog components to render inline (no Radix portals)
// so react-test-renderer does not crash with parentInstance.children.indexOf.
vi.mock("@miladyai/ui", () => {
  const passthrough = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("div", props, children);
  return {
    Dialog: ({
      children,
      open,
    }: React.PropsWithChildren<{ open?: boolean; onOpenChange?: unknown }>) =>
      open ? React.createElement(React.Fragment, null, children) : null,
    DialogContent: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("div", { role: "dialog", ...props }, children),
    DialogHeader: passthrough,
    DialogTitle: passthrough,
    DialogDescription: passthrough,
    DialogFooter: passthrough,
    DialogTrigger: passthrough,
    DialogClose: passthrough,
    DialogOverlay: passthrough,
    DialogPortal: passthrough,
    Button: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement("button", { type: "button", ...props }, children),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement("input", props),
    Z_BASE: 0,
    Z_DROPDOWN: 10,
    Z_STICKY: 20,
    Z_MODAL_BACKDROP: 50,
    Z_MODAL: 100,
    Z_DIALOG_OVERLAY: 160,
    Z_DIALOG: 170,
    Z_OVERLAY: 200,
    Z_TOOLTIP: 300,
    Z_SYSTEM_BANNER: 9998,
    Z_SYSTEM_CRITICAL: 9999,
    Z_SHELL_OVERLAY: 10000,
    Z_GLOBAL_EMOTE: 11000,
    Z_SELECT_FLOAT: 12000,
    SELECT_FLOATING_LAYER_NAME: "config-select",
    SELECT_FLOATING_LAYER_Z_INDEX: 12000,
    SELECT_FLOATING_LAYER_CLASSNAME: "z-[12000]",
  };
});

import { ShortcutsOverlay } from "@miladyai/app-core/components";
import { COMMON_SHORTCUTS } from "@miladyai/app-core/hooks";

let addListenerSpy: ReturnType<typeof vi.spyOn>;

function getLatestKeydownHandler(): (event: KeyboardEvent) => void {
  const keydownCalls = addListenerSpy.mock.calls.filter(
    (call: unknown[]) => call[0] === "keydown" && typeof call[1] === "function",
  );
  const latestCall = keydownCalls.at(-1);
  if (!latestCall) {
    throw new Error("Expected ShortcutsOverlay to register a keydown handler");
  }
  return latestCall[1] as (event: KeyboardEvent) => void;
}

function findText(
  root: TestRenderer.ReactTestInstance,
  value: string,
): TestRenderer.ReactTestInstance[] {
  return root.findAll((node: TestRenderer.ReactTestInstance) =>
    node.children.some((child) => child === value),
  );
}

describe("ShortcutsOverlay", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    addListenerSpy = vi.spyOn(window, "addEventListener");
  });

  it("opens on Shift+? and renders the shared shortcuts list", () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(React.createElement(ShortcutsOverlay));
    });

    expect(tree.toJSON()).toBeNull();

    const preventDefault = vi.fn();
    act(() => {
      getLatestKeydownHandler()({
        shiftKey: true,
        key: "?",
        preventDefault,
        target: { tagName: "DIV" },
      } as KeyboardEvent);
    });

    const dialog = tree.root.findByProps({ role: "dialog" });
    expect(dialog).toBeDefined();
    expect(findText(tree.root, "Open command palette")).toHaveLength(1);
    expect(tree.root.findAllByType("kbd" as React.ElementType)).toHaveLength(
      COMMON_SHORTCUTS.length,
    );
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("ignores the toggle shortcut while typing in an input", () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(React.createElement(ShortcutsOverlay));
    });

    const preventDefault = vi.fn();
    act(() => {
      getLatestKeydownHandler()({
        shiftKey: true,
        key: "?",
        preventDefault,
        target: { tagName: "INPUT" },
      } as KeyboardEvent);
    });

    expect(tree.toJSON()).toBeNull();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("closes on Escape once opened", () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(React.createElement(ShortcutsOverlay));
    });

    act(() => {
      getLatestKeydownHandler()({
        shiftKey: true,
        key: "?",
        preventDefault: vi.fn(),
        target: { tagName: "DIV" },
      } as KeyboardEvent);
    });

    const preventDefault = vi.fn();
    act(() => {
      getLatestKeydownHandler()({
        key: "Escape",
        preventDefault,
        target: { tagName: "DIV" },
      } as KeyboardEvent);
    });

    expect(tree.toJSON()).toBeNull();
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
