import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Label } from "./label";

describe("Label", () => {
  it("renders", () => {
    render(<Label>Email</Label>);
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("applies className", () => {
    const { container } = render(<Label className="extra">Email</Label>);
    expect(container.firstChild).toHaveClass("extra");
  });

  it("renders children", () => {
    render(
      <Label>
        <span data-testid="child">Inner</span>
      </Label>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
