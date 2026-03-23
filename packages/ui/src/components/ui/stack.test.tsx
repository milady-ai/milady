import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stack } from "./stack";

describe("Stack", () => {
  it("renders with default col direction", () => {
    const { container } = render(<Stack>content</Stack>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("flex-col");
  });

  it("applies row direction", () => {
    const { container } = render(<Stack direction="row">content</Stack>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("flex-row");
  });

  it("applies spacing", () => {
    const { container } = render(<Stack spacing="lg">content</Stack>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("gap-6");
  });

  it("applies align", () => {
    const { container } = render(<Stack align="center">content</Stack>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("items-center");
  });

  it("applies justify", () => {
    const { container } = render(<Stack justify="between">content</Stack>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("justify-between");
  });
});
