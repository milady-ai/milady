import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatCard, StatusBadge, StatusDot, statusToneForBoolean } from "./status-badge";

describe("StatusBadge", () => {
  it("renders label", () => {
    render(<StatusBadge label="Online" tone="success" />);
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("applies tone styles", () => {
    const { container } = render(<StatusBadge label="Warn" tone="warning" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-warn");
  });

  it("shows dot when withDot=true", () => {
    const { container } = render(<StatusBadge label="Active" tone="success" withDot />);
    const dot = container.querySelector(".rounded-full");
    expect(dot).toBeInTheDocument();
  });

  it("does not show dot by default", () => {
    const { container } = render(<StatusBadge label="Active" tone="success" />);
    const dot = container.querySelector(".rounded-full");
    expect(dot).not.toBeInTheDocument();
  });
});

describe("StatusDot", () => {
  it("renders with success tone for 'connected'", () => {
    const { container } = render(<StatusDot status="connected" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("bg-ok");
  });

  it("renders with danger tone for 'error'", () => {
    const { container } = render(<StatusDot status="error" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("bg-destructive");
  });

  it("renders with muted tone for unknown status", () => {
    const { container } = render(<StatusDot status="unknown" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("bg-muted");
  });
});

describe("StatCard", () => {
  it("renders label and value", () => {
    render(<StatCard label="Users" value={42} />);
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});

describe("statusToneForBoolean", () => {
  it("returns success for true", () => {
    expect(statusToneForBoolean(true)).toBe("success");
  });

  it("returns muted for false", () => {
    expect(statusToneForBoolean(false)).toBe("muted");
  });
});
