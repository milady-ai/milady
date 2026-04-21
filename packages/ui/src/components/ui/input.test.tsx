import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { Input } from "./input";

describe("Input", () => {
  it("renders input element", () => {
    render(<Input aria-label="Name" />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("forwards type", () => {
    render(<Input type="password" placeholder="pwd" />);
    const input = screen.getByPlaceholderText("pwd");
    expect(input).toHaveAttribute("type", "password");
  });

  it("applies className", () => {
    render(<Input aria-label="Name" className="custom" />);
    expect(screen.getByRole("textbox")).toHaveClass("custom");
  });

  it("disabled state", () => {
    render(<Input aria-label="Name" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("forwards ref", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="Name" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
