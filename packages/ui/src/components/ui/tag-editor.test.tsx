import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TagEditor } from "./tag-editor";

describe("TagEditor", () => {
  it("renders label", () => {
    render(<TagEditor label="Tags" items={[]} onChange={vi.fn()} />);
    expect(screen.getByText("Tags")).toBeInTheDocument();
  });

  it("renders existing items", () => {
    render(<TagEditor label="Tags" items={["alpha", "beta"]} onChange={vi.fn()} />);
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("adds new item on Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TagEditor label="Tags" items={["existing"]} onChange={onChange} />);
    const input = screen.getByPlaceholderText("add item...");
    await user.type(input, "new{Enter}");
    expect(onChange).toHaveBeenCalledWith(["existing", "new"]);
  });

  it("adds new item on add button click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TagEditor label="Tags" items={[]} onChange={onChange} />);
    const input = screen.getByPlaceholderText("add item...");
    await user.type(input, "item");
    await user.click(screen.getByRole("button", { name: "+" }));
    expect(onChange).toHaveBeenCalledWith(["item"]);
  });

  it("removes item", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TagEditor label="Tags" items={["a", "b"]} onChange={onChange} />);
    const removeButtons = screen.getAllByRole("button", { name: "×" });
    await user.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("does not add duplicate", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TagEditor label="Tags" items={["dup"]} onChange={onChange} />);
    const input = screen.getByPlaceholderText("add item...");
    await user.type(input, "dup{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });
});
