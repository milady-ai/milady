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
    render(
      <MemoryRouter initialEntries={["/docs"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("guides-page")).toBeTruthy();
    expect(screen.getByText("DOCS")).toBeTruthy();
    expect(
      screen.getByText(/Start with the server\./, { exact: false }),
    ).toBeTruthy();
  });
});
