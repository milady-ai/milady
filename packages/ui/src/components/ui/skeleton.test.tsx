import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Skeleton,
  SkeletonCard,
  SkeletonChat,
  SkeletonLine,
  SkeletonMessage,
  SkeletonSidebar,
  SkeletonText,
} from "./skeleton";

describe("Skeleton", () => {
  it("renders with animate-pulse", () => {
    const { container } = render(<Skeleton />);
    expect((container.firstChild as HTMLElement).className).toContain("animate-pulse");
  });
});

describe("SkeletonLine", () => {
  it("renders with width", () => {
    const { container } = render(<SkeletonLine width="75%" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("75%");
  });
});

describe("SkeletonText", () => {
  it("renders specified number of lines", () => {
    const { container } = render(<SkeletonText lines={5} />);
    const lines = container.querySelectorAll(".animate-pulse");
    expect(lines).toHaveLength(5);
  });
});

describe("SkeletonMessage", () => {
  it("renders", () => {
    const { container } = render(<SkeletonMessage />);
    expect(container.firstChild).toBeInTheDocument();
  });
});

describe("SkeletonCard", () => {
  it("renders", () => {
    const { container } = render(<SkeletonCard />);
    expect(container.firstChild).toBeInTheDocument();
  });
});

describe("SkeletonSidebar", () => {
  it("renders", () => {
    const { container } = render(<SkeletonSidebar />);
    expect(container.firstChild).toBeInTheDocument();
  });
});

describe("SkeletonChat", () => {
  it("renders", () => {
    const { container } = render(<SkeletonChat />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
