import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDelete } from "./confirm-delete";

describe("ConfirmDelete", () => {
  it("renders trigger button", () => {
    render(<ConfirmDelete onConfirm={() => {}} />);
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("shows confirm and cancel after trigger click", () => {
    render(<ConfirmDelete onConfirm={() => {}} />);
    fireEvent.click(screen.getByText("Delete"));
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Delete?")).toBeInTheDocument();
  });

  it("calls onConfirm on confirm click", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDelete onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByText("Confirm"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("hides confirm on cancel click", () => {
    render(<ConfirmDelete onConfirm={() => {}} />);
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByText("Cancel"));
    // Should be back to trigger state
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.queryByText("Confirm")).not.toBeInTheDocument();
  });

  it("disabled state prevents trigger click", () => {
    render(<ConfirmDelete onConfirm={() => {}} disabled />);
    const button = screen.getByText("Delete");
    expect(button).toBeDisabled();
  });
});
