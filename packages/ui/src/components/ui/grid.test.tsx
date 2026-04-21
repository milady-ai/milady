import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Grid } from "./grid";

describe("Grid", () => {
  it("renders with default classes", () => {
    const { container } = render(<Grid>Content</Grid>);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("grid");
    expect(el).toHaveClass("grid-cols-1");
    expect(el).toHaveClass("gap-4");
  });

  it("applies column variants", () => {
    const { container } = render(<Grid columns={3}>Content</Grid>);
    expect(container.firstChild).toHaveClass("grid-cols-3");
  });

  it("applies spacing variants", () => {
    const { container } = render(<Grid spacing="lg">Content</Grid>);
    expect(container.firstChild).toHaveClass("gap-6");
  });

  it("applies custom className", () => {
    const { container } = render(<Grid className="extra">Content</Grid>);
    expect(container.firstChild).toHaveClass("extra");
  });
});
