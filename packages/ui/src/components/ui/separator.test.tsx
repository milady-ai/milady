import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Separator } from "./separator";

describe("Separator", () => {
  it("renders horizontal by default", () => {
    const { container } = render(<Separator />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("data-orientation")).toBe("horizontal");
    expect(el.className).toContain("h-[1px]");
  });

  it("renders vertical", () => {
    const { container } = render(<Separator orientation="vertical" />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("data-orientation")).toBe("vertical");
    expect(el.className).toContain("w-[1px]");
  });

  it("applies className", () => {
    const { container } = render(<Separator className="my-custom" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("my-custom");
  });
});
