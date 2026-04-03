import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { Nav } from "../components/Nav";
import { releaseData } from "../generated/release-data";

afterEach(cleanup);

function renderNav(initialEntries = ["/dashboard"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Nav />
    </MemoryRouter>,
  );
}

describe("Nav", () => {
  it("shows the simplified dashboard nav without removed landing anchors", () => {
    const { container } = renderNav();
    expect(container.textContent).toContain("MILADY");
    expect(container.textContent).toContain("DASHBOARD");
    expect(container.textContent).toContain("DOCS");
    expect(container.textContent).not.toContain("INSTALL");
    expect(container.textContent).not.toContain("PRIVACY");
    expect(container.textContent).not.toContain("FEATURES");
    expect(container.textContent).not.toContain("COMPARE");
  });

  it("releases button links to the release page URL", () => {
    const { container } = renderNav();
    const releasesLink = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === "RELEASES",
    );
    expect(releasesLink).toBeTruthy();
    expect(releasesLink?.getAttribute("href")).toBe(releaseData.release.url);
  });

  it("Dashboard link navigates to /dashboard (not external)", () => {
    const { container } = renderNav(["/onboard"]);
    const dashboardLink = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === "DASHBOARD",
    );
    expect(dashboardLink).toBeTruthy();
    expect(dashboardLink?.getAttribute("href")).toBe("/dashboard");
    expect(dashboardLink?.getAttribute("target")).toBeNull();
  });

  it("Docs link navigates to /docs", () => {
    const { container } = renderNav(["/dashboard"]);
    const docsLink = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === "DOCS",
    );
    expect(docsLink).toBeTruthy();
    expect(docsLink?.getAttribute("href")).toBe("/docs");
    expect(docsLink?.getAttribute("target")).toBeNull();
  });
});
