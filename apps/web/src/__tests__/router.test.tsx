import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppRoutes } from "../router";

beforeEach(() => {
  localStorage.setItem("milady-cloud-token", "test-api-key");
});

afterEach(() => {
  localStorage.removeItem("milady-cloud-token");
  cleanup();
});

describe("Router", () => {
  it("renders homepage at /", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(document.querySelector("#top")).toBeTruthy();
    expect(screen.getAllByText("MILADY").length).toBeGreaterThan(0);
    expect(screen.getByText("Open App")).toBeTruthy();
    expect(screen.getByText("Read Docs")).toBeTruthy();
    expect(screen.queryByText("DASHBOARD")).toBeNull();
  });

  it("renders dashboard at /dashboard", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("dashboard")).toBeTruthy();
    expect(screen.getAllByText("MILADY").length).toBeGreaterThan(0);
    expect(screen.getByText("DASHBOARD")).toBeTruthy();
  });

  it("renders consumer docs at /docs", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/docs"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    // DocsLayout wraps /docs content with a data-docs-content main area
    expect(container.querySelector("[data-docs-content]")).toBeTruthy();
    // DocsLanding renders the tier section heading synchronously
    expect(screen.getByText("Start where you are")).toBeTruthy();
    // The old GuidesLanding is no longer at /docs
    expect(screen.queryByTestId("guides-page")).toBeNull();
  });
});
