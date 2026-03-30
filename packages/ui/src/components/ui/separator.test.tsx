import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Separator } from "./separator";

describe("Separator", () => {
  it("renders horizontal by default", () => {
    const { container } = render(<Separator />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("data-orientation")).toBe("horizontal");
    expect(el).toHaveClass("h-[1px]");
  });

  it("renders vertical", () => {
    const { container } = render(<Separator orientation="vertical" />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("data-orientation")).toBe("vertical");
    expect(el).toHaveClass("w-[1px]");
  });

  it("applies className", () => {
    const { container } = render(<Separator className="my-custom" />);
    expect(container.firstChild).toHaveClass("my-custom");
  });
});
