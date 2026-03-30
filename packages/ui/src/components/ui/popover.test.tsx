import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";

describe("Popover", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__TEST_RENDERER__ = true;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__TEST_RENDERER__;
  });

  it("renders trigger", () => {
    render(
      <Popover>
        <PopoverTrigger>Toggle</PopoverTrigger>
        <PopoverContent>Popover body</PopoverContent>
      </Popover>,
    );
    expect(screen.getByText("Toggle")).toBeInTheDocument();
  });

  it("shows popover content on trigger click", () => {
    render(
      <Popover>
        <PopoverTrigger>Toggle</PopoverTrigger>
        <PopoverContent>Popover body</PopoverContent>
      </Popover>,
    );
    fireEvent.click(screen.getByText("Toggle"));
    expect(screen.getByText("Popover body")).toBeInTheDocument();
  });

  it("renders with open prop", () => {
    render(
      <Popover open>
        <PopoverTrigger>Toggle</PopoverTrigger>
        <PopoverContent>Always visible</PopoverContent>
      </Popover>,
    );
    expect(screen.getByText("Always visible")).toBeInTheDocument();
  });
});
