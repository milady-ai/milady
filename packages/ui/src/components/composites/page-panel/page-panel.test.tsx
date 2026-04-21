import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PagePanel } from "./index";

describe("PagePanel states", () => {
  it("renders panel headers with an eyebrow and actions", () => {
    const { container } = render(
      <PagePanel.Header
        eyebrow="Advanced"
        heading="Plugin Catalog"
        actions={<PagePanel.Meta>12 shown</PagePanel.Meta>}
      />,
    );

    expect(screen.getByText("Advanced")).toBeInTheDocument();
    expect(screen.getByText("Plugin Catalog")).toBeInTheDocument();
    expect(screen.getByText("12 shown")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("grid");
    expect(container.firstChild).not.toHaveClass("flex-wrap");
  });

  it("renders the workspace empty state without a panel shell", () => {
    const { container } = render(
      <PagePanel.Empty
        variant="workspace"
        title="No workspace data"
        description="Nothing is ready yet."
      />,
    );

    expect(screen.getByText("No workspace data")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("flex", "min-h-0", "flex-1");
  });

  it("renders the surface empty state inside the panel shell", () => {
    const { container } = render(
      <PagePanel.Empty
        variant="surface"
        title="No documents"
        description="Upload one to begin."
      />,
    );

    expect(screen.getByText("No documents")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("min-h-[58vh]");
  });

  it("renders the workspace loading state with a spinner and heading", () => {
    const { container } = render(
      <PagePanel.Loading
        variant="workspace"
        heading="Loading workspace"
        description="Please wait."
      />,
    );

    expect(screen.getByText("Loading workspace")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("min-h-[58vh]");
  });
});
