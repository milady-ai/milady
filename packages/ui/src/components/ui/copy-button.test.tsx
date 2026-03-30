import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CopyButton } from "./copy-button";

describe("CopyButton", () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });

  it("renders with Copy aria-label", () => {
    render(<CopyButton value="test" />);
    expect(screen.getByLabelText("Copy")).toBeInTheDocument();
  });

  it("calls navigator.clipboard.writeText on click", () => {
    render(<CopyButton value="hello world" />);
    fireEvent.click(screen.getByLabelText("Copy"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello world");
  });

  it("shows Copied aria-label after click", () => {
    render(<CopyButton value="text" />);
    fireEvent.click(screen.getByLabelText("Copy"));
    expect(screen.getByLabelText("Copied")).toBeInTheDocument();
  });
});
