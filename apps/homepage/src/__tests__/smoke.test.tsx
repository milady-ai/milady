import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("homepage", () => {
  it("has a valid test setup with jsdom", () => {
    expect(typeof document).toBe("object");
    expect(typeof window).toBe("object");
  });

  it("renders the Nav component with navigation links", async () => {
    // Nav uses react-router-dom, so wrap in a MemoryRouter
    const { MemoryRouter } = await import("react-router-dom");
    const { Nav } = await import("../components/Nav");

    render(
      <MemoryRouter>
        <Nav />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", { name: /main navigation/i });
    expect(nav).toBeInTheDocument();
  });

  it("has working localStorage and sessionStorage in jsdom", () => {
    localStorage.setItem("test-key", "test-value");
    expect(localStorage.getItem("test-key")).toBe("test-value");
    localStorage.removeItem("test-key");

    sessionStorage.setItem("test-key", "test-value");
    expect(sessionStorage.getItem("test-key")).toBe("test-value");
    sessionStorage.removeItem("test-key");
  });

  it("imports shared package utilities", async () => {
    const shared = await import("@elizaos/shared");
    expect(shared).toBeDefined();
    expect(typeof shared.normalizeConnectorSource).toBe("function");
  });
});
