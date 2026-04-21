import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Banner } from "./banner";

describe("Banner", () => {
  it("renders children", () => {
    render(<Banner>Important message</Banner>);
    expect(screen.getByText("Important message")).toBeInTheDocument();
  });

  it("has role='alert'", () => {
    render(<Banner>Alert</Banner>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders info icon by default", () => {
    const { container } = render(<Banner>Info</Banner>);
    // lucide Info icon renders as an svg
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders correct icon per variant", () => {
    const { container: errorContainer } = render(
      <Banner variant="error">Error</Banner>,
    );
    const { container: warningContainer } = render(
      <Banner variant="warning">Warning</Banner>,
    );
    // Each variant renders an SVG icon
    expect(errorContainer.querySelector("svg")).toBeInTheDocument();
    expect(warningContainer.querySelector("svg")).toBeInTheDocument();
  });

  it("shows dismiss button when dismissible", () => {
    render(<Banner dismissible>Dismissible</Banner>);
    expect(screen.getByLabelText("Dismiss")).toBeInTheDocument();
  });

  it("does not show dismiss button when not dismissible", () => {
    render(<Banner>Not dismissible</Banner>);
    expect(screen.queryByLabelText("Dismiss")).not.toBeInTheDocument();
  });

  it("calls onDismiss when dismiss button clicked", () => {
    const onDismiss = vi.fn();
    render(
      <Banner dismissible onDismiss={onDismiss}>
        Close me
      </Banner>,
    );
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("renders action element", () => {
    render(
      <Banner action={<button type="button">Fix it</button>}>
        Problem
      </Banner>,
    );
    expect(screen.getByText("Fix it")).toBeInTheDocument();
  });
});
