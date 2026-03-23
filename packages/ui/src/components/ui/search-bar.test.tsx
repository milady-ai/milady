import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchBar } from "./search-bar";

describe("SearchBar", () => {
  it("renders input and button", () => {
    render(<SearchBar onSearch={vi.fn()} />);
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });

  it("button disabled when empty", () => {
    render(<SearchBar onSearch={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  });

  it("calls onSearch on submit", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    await user.type(screen.getByPlaceholderText("Search..."), "hello");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(onSearch).toHaveBeenCalledWith("hello");
  });

  it("calls onSearch on Enter key", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    const input = screen.getByPlaceholderText("Search...");
    await user.type(input, "world{Enter}");
    expect(onSearch).toHaveBeenCalledWith("world");
  });

  it("shows searching label", () => {
    render(<SearchBar onSearch={vi.fn()} searching />);
    expect(screen.getByRole("button")).toHaveTextContent("Searching...");
  });
});
