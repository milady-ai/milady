import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("renders", () => {
    render(<Checkbox aria-label="Toggle" />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("can be checked via click", () => {
    render(<Checkbox aria-label="Toggle" />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("disabled state prevents interaction", () => {
    render(<Checkbox aria-label="Toggle" disabled />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDisabled();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });
});
