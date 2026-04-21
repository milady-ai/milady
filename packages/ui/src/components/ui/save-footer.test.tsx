import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SaveFooter } from "./save-footer";

const defaults = {
  dirty: true,
  saving: false,
  saveError: null,
  saveSuccess: false,
  onSave: vi.fn(),
};

describe("SaveFooter", () => {
  it("returns null when dirty=false", () => {
    const { container } = render(<SaveFooter {...defaults} dirty={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders save button when dirty=true", () => {
    render(<SaveFooter {...defaults} />);
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
  });

  it("shows saving label when saving=true", () => {
    render(<SaveFooter {...defaults} saving />);
    expect(screen.getByRole("button")).toHaveTextContent("Saving…");
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("shows error message", () => {
    render(<SaveFooter {...defaults} saveError="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows success message", () => {
    render(<SaveFooter {...defaults} saveSuccess />);
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("calls onSave on click", () => {
    const onSave = vi.fn();
    render(<SaveFooter {...defaults} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(onSave).toHaveBeenCalledOnce();
  });
});
