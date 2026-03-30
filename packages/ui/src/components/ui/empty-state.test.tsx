import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders title", () => {
    render(<EmptyState title="No items" />);
    expect(screen.getByText("No items")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(<EmptyState title="Empty" description="Nothing here yet" />);
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
  });

  it("renders icon", () => {
    render(
      <EmptyState
        title="Empty"
        icon={<span data-testid="icon">Icon</span>}
      />,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders action", () => {
    render(
      <EmptyState
        title="Empty"
        action={<button type="button">Add item</button>}
      />,
    );
    expect(screen.getByText("Add item")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <EmptyState title="Empty">
        <p>Extra content</p>
      </EmptyState>,
    );
    expect(screen.getByText("Extra content")).toBeInTheDocument();
  });
});
