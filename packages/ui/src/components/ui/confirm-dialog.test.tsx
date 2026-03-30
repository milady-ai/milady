import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog, PromptDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__TEST_RENDERER__ = true;
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__TEST_RENDERER__;
  });

  it("returns null when not open", () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        message="Are you sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog when open", () => {
    render(
      <ConfirmDialog
        open={true}
        message="Are you sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Delete this?"
        confirmLabel="Yes"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Yes"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Delete this?"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows custom title and message", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Custom Title"
        message="Custom message body"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("Custom Title")).toBeInTheDocument();
    expect(screen.getByText("Custom message body")).toBeInTheDocument();
  });
});

describe("PromptDialog", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__TEST_RENDERER__ = true;
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__TEST_RENDERER__;
  });

  it("renders input when open", () => {
    render(
      <PromptDialog
        open={true}
        message="Enter name"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByText("Enter name")).toBeInTheDocument();
  });

  it("calls onConfirm with entered value", () => {
    const onConfirm = vi.fn();
    render(
      <PromptDialog
        open={true}
        message="Enter name"
        defaultValue="initial"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "new value" } });
    fireEvent.click(screen.getByText("Confirm"));
    expect(onConfirm).toHaveBeenCalledWith("new value");
  });

  it("calls onCancel when cancel clicked", () => {
    const onCancel = vi.fn();
    render(
      <PromptDialog
        open={true}
        message="Enter name"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
