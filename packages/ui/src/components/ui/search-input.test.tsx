import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchInput } from "./search-input";

describe("SearchInput", () => {
  it("renders input", () => {
    render(<SearchInput placeholder="Search here" />);
    expect(screen.getByPlaceholderText("Search here")).toBeInTheDocument();
  });

  it("shows search icon", () => {
    const { container } = render(<SearchInput />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("shows clear button when value exists and onClear provided", () => {
    render(<SearchInput value="test" onClear={vi.fn()} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
  });

  it("does not show clear button when value is empty", () => {
    render(<SearchInput value="" onClear={vi.fn()} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
  });

  it("calls onClear", () => {
    const onClear = vi.fn();
    render(<SearchInput value="test" onClear={onClear} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("shows loading indicator", () => {
    const { container } = render(<SearchInput loading />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });
});
