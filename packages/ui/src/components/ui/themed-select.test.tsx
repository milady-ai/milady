import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ThemedSelect } from "./themed-select";

const groups = [
  {
    label: "Fruits",
    items: [
      { id: "apple", text: "Apple" },
      { id: "banana", text: "Banana", hint: "tropical" },
    ],
  },
  {
    label: "Veggies",
    items: [{ id: "carrot", text: "Carrot" }],
  },
];

describe("ThemedSelect", () => {
  it("renders trigger with placeholder", () => {
    render(<ThemedSelect value={null} groups={groups} onChange={vi.fn()} placeholder="Pick one" />);
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("opens menu on click", async () => {
    const user = userEvent.setup();
    render(<ThemedSelect value={null} groups={groups} onChange={vi.fn()} />);
    await user.click(screen.getByText("select..."));
    expect(screen.getByText("Fruits")).toBeInTheDocument();
    expect(screen.getByText("Veggies")).toBeInTheDocument();
  });

  it("shows groups and items", async () => {
    const user = userEvent.setup();
    render(<ThemedSelect value={null} groups={groups} onChange={vi.fn()} />);
    await user.click(screen.getByText("select..."));
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.getByText("Carrot")).toBeInTheDocument();
  });

  it("calls onChange on item click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ThemedSelect value={null} groups={groups} onChange={onChange} />);
    await user.click(screen.getByText("select..."));
    await user.click(screen.getByText("Apple"));
    expect(onChange).toHaveBeenCalledWith("apple");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<ThemedSelect value={null} groups={groups} onChange={vi.fn()} />);
    await user.click(screen.getByText("select..."));
    expect(screen.getByText("Fruits")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Fruits")).not.toBeInTheDocument();
  });
});
