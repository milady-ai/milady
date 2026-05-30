import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Homepage } from "../pages/Homepage";

describe("Homepage", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps the hero phrase rotation active after the route split", () => {
    vi.useFakeTimers();

    render(<Homepage />);

    expect(screen.getByLabelText("AGENTS THAT MAKE MONEY")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1550);
    });

    expect(
      screen.getByLabelText("AGENTS THAT SCAM OLD PEOPLE"),
    ).toBeInTheDocument();
  });
});
