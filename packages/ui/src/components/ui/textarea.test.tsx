import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("renders", () => {
    render(<Textarea data-testid="ta" />);
    expect(screen.getByTestId("ta")).toBeInTheDocument();
  });

  it("forwards placeholder", () => {
    render(<Textarea placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
  });

  it("disabled", () => {
    render(<Textarea disabled data-testid="ta" />);
    expect(screen.getByTestId("ta")).toBeDisabled();
  });

  it("applies className", () => {
    render(<Textarea className="custom-class" data-testid="ta" />);
    expect(screen.getByTestId("ta").className).toContain("custom-class");
  });
});
