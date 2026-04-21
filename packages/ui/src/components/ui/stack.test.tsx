import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stack } from "./stack";

describe("Stack", () => {
  it("renders with default col direction", () => {
    const { container } = render(<Stack>content</Stack>);
    expect(container.firstChild).toHaveClass("flex", "flex-col");
  });

  it("applies row direction", () => {
    const { container } = render(<Stack direction="row">content</Stack>);
    expect(container.firstChild).toHaveClass("flex-row");
  });

  it("applies spacing", () => {
    const { container } = render(<Stack spacing="lg">content</Stack>);
    expect(container.firstChild).toHaveClass("gap-6");
  });

  it("applies align", () => {
    const { container } = render(<Stack align="center">content</Stack>);
    expect(container.firstChild).toHaveClass("items-center");
  });

  it("applies justify", () => {
    const { container } = render(<Stack justify="between">content</Stack>);
    expect(container.firstChild).toHaveClass("justify-between");
  });
});
