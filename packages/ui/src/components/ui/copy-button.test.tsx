import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CopyButton } from "./copy-button";

describe("CopyButton", () => {
  it("renders with Copy aria-label", () => {
    render(<CopyButton value="test" />);
    expect(screen.getByLabelText("Copy")).toBeInTheDocument();
  });

  it("calls navigator.clipboard.writeText on click", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<CopyButton value="hello world" />);
    fireEvent.click(screen.getByLabelText("Copy"));
    expect(writeText).toHaveBeenCalledWith("hello world");
  });

  it("shows Copied aria-label after click", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<CopyButton value="text" />);
    fireEvent.click(screen.getByLabelText("Copy"));
    expect(screen.getByLabelText("Copied")).toBeInTheDocument();
  });
});
