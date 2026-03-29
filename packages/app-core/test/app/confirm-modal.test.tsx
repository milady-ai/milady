// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  ConfirmDialog as ConfirmModal,
  PromptDialog as PromptModal,
  useConfirm,
  usePrompt,
} from "@miladyai/ui";

let latestConfirm!: ReturnType<typeof useConfirm>;
let latestPrompt!: ReturnType<typeof usePrompt>;

function ConfirmHarness() {
  latestConfirm = useConfirm();
  return <ConfirmModal {...latestConfirm.modalProps} />;
}

function PromptHarness() {
  latestPrompt = usePrompt();
  return <PromptModal {...latestPrompt.modalProps} />;
}

describe("ConfirmModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as Record<string, unknown>).__TEST_RENDERER__ = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).__TEST_RENDERER__;
    cleanup();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <ConfirmModal
        open={false}
        message="Delete this item?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("cancels from the secondary button and confirms from the primary button", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    const { rerender } = render(
      <ConfirmModal
        open={true}
        title="Delete item"
        message="Delete this item?"
        confirmLabel="Delete"
        cancelLabel="Keep"
        variant="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByText("Keep"));
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(
      <ConfirmModal
        open={true}
        title="Delete item"
        message="Delete this item?"
        confirmLabel="Delete"
        cancelLabel="Keep"
        variant="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("useConfirm resolves true from the confirm button", async () => {
    render(<ConfirmHarness />);

    let resultPromise!: Promise<boolean>;
    await act(async () => {
      resultPromise = latestConfirm.confirm({
        title: "Delete item",
        message: "Delete this item?",
        confirmLabel: "Delete",
        variant: "danger",
      });
    });

    fireEvent.click(screen.getByText("Delete"));

    await expect(resultPromise).resolves.toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("useConfirm resolves false from the cancel button", async () => {
    render(<ConfirmHarness />);

    let resultPromise!: Promise<boolean>;
    await act(async () => {
      resultPromise = latestConfirm.confirm({
        title: "Discard draft",
        message: "Discard your changes?",
        cancelLabel: "Stay",
      });
    });

    fireEvent.click(screen.getByText("Stay"));

    await expect(resultPromise).resolves.toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("PromptModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as Record<string, unknown>).__TEST_RENDERER__ = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).__TEST_RENDERER__;
    cleanup();
  });

  it("confirms the entered value", async () => {
    render(<PromptHarness />);

    let resultPromise!: Promise<string | null>;
    await act(async () => {
      resultPromise = latestPrompt.prompt({
        title: "Wallet Export Token",
        message: "Enter export token",
        confirmLabel: "Export",
      });
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "token-123" },
    });
    fireEvent.click(screen.getByText("Export"));

    await expect(resultPromise).resolves.toBe("token-123");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("returns null on cancel", async () => {
    render(<PromptHarness />);

    let resultPromise!: Promise<string | null>;
    await act(async () => {
      resultPromise = latestPrompt.prompt({
        title: "Prompt",
        message: "Enter text",
        cancelLabel: "Skip",
      });
    });

    fireEvent.click(screen.getByText("Skip"));

    await expect(resultPromise).resolves.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
