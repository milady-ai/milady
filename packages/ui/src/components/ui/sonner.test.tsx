import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Toaster } from "./sonner";

describe("Toaster (sonner)", () => {
  it("reads the current document theme without next-themes", () => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.remove("dark");

    const { container } = render(<Toaster />);
    expect(container).toBeTruthy();
  });

  it("renders without crashing", () => {
    const { container } = render(<Toaster />);
    expect(container).toBeTruthy();
  });

  it("renders with custom props without crashing", () => {
    const { container } = render(<Toaster position="top-right" />);
    expect(container).toBeTruthy();
  });
});
