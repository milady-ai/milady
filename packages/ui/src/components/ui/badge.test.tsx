import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { badgeVariants, Badge } from "./badge";

describe("Badge", () => {
  it("renders with children", () => {
    render(<Badge>Hello</Badge>);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("applies variant classes via badgeVariants", () => {
    const classes = badgeVariants({ variant: "destructive" });
    expect(classes).toContain("bg-destructive");
  });

  it("applies default variant when none specified", () => {
    const classes = badgeVariants({});
    expect(classes).toContain("bg-primary");
  });

  it("applies secondary variant classes", () => {
    const { container } = render(<Badge variant="secondary">Tag</Badge>);
    expect(container.firstChild).toHaveClass("bg-bg-accent");
  });

  it("applies custom className", () => {
    const { container } = render(<Badge className="custom-class">Tag</Badge>);
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("forwards HTML attributes", () => {
    render(<Badge data-testid="my-badge" id="b1">Tag</Badge>);
    const el = screen.getByTestId("my-badge");
    expect(el).toHaveAttribute("id", "b1");
  });
});
