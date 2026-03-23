import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionCard } from "./section-card";

describe("SectionCard", () => {
  it("renders title", () => {
    render(<SectionCard title="My Section" />);
    expect(screen.getByText("My Section")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(<SectionCard title="Title" description="A description" />);
    expect(screen.getByText("A description")).toBeInTheDocument();
  });

  it("renders actions", () => {
    render(<SectionCard title="Title" actions={<button>Action</button>} />);
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
  });

  it("renders children", () => {
    render(<SectionCard>Child content</SectionCard>);
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("collapsible toggles content on title click", () => {
    render(
      <SectionCard title="Toggle" collapsible>
        Hidden content
      </SectionCard>,
    );
    expect(screen.getByText("Hidden content")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Toggle"));
    expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Toggle"));
    expect(screen.getByText("Hidden content")).toBeInTheDocument();
  });

  it("defaultCollapsed hides content initially", () => {
    render(
      <SectionCard title="Collapsed" collapsible defaultCollapsed>
        Initially hidden
      </SectionCard>,
    );
    expect(screen.queryByText("Initially hidden")).not.toBeInTheDocument();
  });
});
