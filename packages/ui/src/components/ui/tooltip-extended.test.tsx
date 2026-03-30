import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import { HoverTooltip, IconTooltip, useGuidedTour } from "./tooltip-extended";

describe("HoverTooltip", () => {
  it("renders children", () => {
    render(
      <HoverTooltip content="Tooltip text">
        <span>Child element</span>
      </HoverTooltip>,
    );
    expect(screen.getByText("Child element")).toBeInTheDocument();
  });

  it("does not show tooltip content by default", () => {
    render(
      <HoverTooltip content="Hidden tip">
        <span>Hover target</span>
      </HoverTooltip>,
    );
    expect(screen.queryByText("Hidden tip")).not.toBeInTheDocument();
  });

  it("shows tooltip when visible prop is true", () => {
    render(
      <HoverTooltip content="Controlled tip" visible>
        <span>Target</span>
      </HoverTooltip>,
    );
    expect(screen.getByText("Controlled tip")).toBeInTheDocument();
  });

  it("renders dismiss button when onDismiss is provided and visible", () => {
    render(
      <HoverTooltip content="Dismissable" visible onDismiss={() => {}}>
        <span>Target</span>
      </HoverTooltip>,
    );
    expect(screen.getByLabelText("Dismiss tooltip")).toBeInTheDocument();
  });
});

describe("IconTooltip", () => {
  it("renders children", () => {
    render(
      <IconTooltip label="Info label">
        <button type="button">Icon</button>
      </IconTooltip>,
    );
    expect(screen.getByText("Icon")).toBeInTheDocument();
  });

  it("renders label text", () => {
    render(
      <IconTooltip label="My label">
        <span>Icon</span>
      </IconTooltip>,
    );
    expect(screen.getByText("My label")).toBeInTheDocument();
  });

  it("renders shortcut when provided", () => {
    render(
      <IconTooltip label="Action" shortcut="Ctrl+S">
        <span>Icon</span>
      </IconTooltip>,
    );
    expect(screen.getByText("Ctrl+S")).toBeInTheDocument();
  });

  it("has tooltip role", () => {
    render(
      <IconTooltip label="Tip">
        <span>Icon</span>
      </IconTooltip>,
    );
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});

describe("useGuidedTour", () => {
  const steps = [
    { target: "#step1", title: "Step 1", description: "First step" },
    { target: "#step2", title: "Step 2", description: "Second step" },
    { target: "#step3", title: "Step 3", description: "Third step" },
  ];

  it("returns initial inactive state", () => {
    const { result } = renderHook(() => useGuidedTour(steps));
    expect(result.current.isActive).toBe(false);
    expect(result.current.currentStep).toBe(0);
    expect(result.current.totalSteps).toBe(3);
  });

  it("activates on start", () => {
    const { result } = renderHook(() => useGuidedTour(steps));
    act(() => result.current.start());
    expect(result.current.isActive).toBe(true);
    expect(result.current.currentStep).toBe(0);
    expect(result.current.step).toEqual(steps[0]);
  });

  it("advances on next", () => {
    const { result } = renderHook(() => useGuidedTour(steps));
    act(() => result.current.start());
    act(() => result.current.next());
    expect(result.current.currentStep).toBe(1);
    expect(result.current.step).toEqual(steps[1]);
  });

  it("goes back on prev", () => {
    const { result } = renderHook(() => useGuidedTour(steps));
    act(() => result.current.start());
    act(() => result.current.next());
    act(() => result.current.prev());
    expect(result.current.currentStep).toBe(0);
  });

  it("does not go below 0 on prev", () => {
    const { result } = renderHook(() => useGuidedTour(steps));
    act(() => result.current.start());
    act(() => result.current.prev());
    expect(result.current.currentStep).toBe(0);
  });

  it("deactivates on skip", () => {
    const { result } = renderHook(() => useGuidedTour(steps));
    act(() => result.current.start());
    act(() => result.current.skip());
    expect(result.current.isActive).toBe(false);
  });

  it("deactivates when next is called on last step", () => {
    const { result } = renderHook(() => useGuidedTour(steps));
    act(() => result.current.start());
    act(() => result.current.next());
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.isActive).toBe(false);
  });
});
