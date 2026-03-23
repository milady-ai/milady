import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TagInput } from "./tag-input";

describe("TagInput", () => {
  it("renders label", () => {
    render(<TagInput label="Topics" items={[]} onChange={vi.fn()} />);
    expect(screen.getByText("Topics")).toBeInTheDocument();
  });

  it("renders items", () => {
    render(<TagInput label="Topics" items={["one", "two"]} onChange={vi.fn()} />);
    expect(screen.getByText("one")).toBeInTheDocument();
    expect(screen.getByText("two")).toBeInTheDocument();
  });

  it("adds item on Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TagInput items={["existing"]} onChange={onChange} />);
    const input = screen.getByPlaceholderText("Add item…");
    await user.type(input, "fresh{Enter}");
    expect(onChange).toHaveBeenCalledWith(["existing", "fresh"]);
  });

  it("removes item", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TagInput items={["x", "y"]} onChange={onChange} />);
    const removeBtn = screen.getByRole("button", { name: "Remove x" });
    await user.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(["y"]);
  });

  it("respects maxItems", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TagInput items={["a", "b"]} onChange={onChange} maxItems={2} />);
    const input = screen.getByPlaceholderText("Add item…");
    await user.type(input, "c{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });
});
