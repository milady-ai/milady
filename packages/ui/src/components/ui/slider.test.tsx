import { describe, expect, it, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { Slider } from "./slider";

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

describe("Slider", () => {
  it("renders", () => {
    const { container } = render(
      <Slider defaultValue={[50]} max={100} step={1} />,
    );
    expect(container.firstElementChild).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <Slider defaultValue={[25]} max={100} className="custom-slider" />,
    );
    expect(container.firstElementChild).toHaveClass("custom-slider");
  });

  it("renders track and thumb elements", () => {
    const { container } = render(<Slider defaultValue={[50]} max={100} />);
    expect(
      container.querySelector("[data-orientation]"),
    ).toBeInTheDocument();
  });
});
