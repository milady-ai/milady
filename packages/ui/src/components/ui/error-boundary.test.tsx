import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./error-boundary";

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test explosion");
  }
  return <div>All good</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("shows error message when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Test explosion")).toBeInTheDocument();
  });

  it("shows retry button", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Try Again")).toBeInTheDocument();
  });

  it("retry resets error boundary", () => {
    let shouldThrow = true;
    function Wrapper() {
      if (shouldThrow) throw new Error("Boom");
      return <div>Recovered</div>;
    }

    render(
      <ErrorBoundary>
        <Wrapper />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Boom")).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByText("Try Again"));
    expect(screen.getByText("Recovered")).toBeInTheDocument();
  });

  it("calls custom fallback", () => {
    const fallback = vi.fn((error: Error, reset: () => void) => (
      <div>
        <span>Custom: {error.message}</span>
        <button type="button" onClick={reset}>Reset</button>
      </div>
    ));

    render(
      <ErrorBoundary fallback={fallback}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(fallback).toHaveBeenCalled();
    expect(screen.getByText("Custom: Test explosion")).toBeInTheDocument();
  });
});
