import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Nav } from "../components/Nav";
import { I18nProvider } from "../providers/I18nProvider";

describe("homepage", () => {
  function renderNav(initialPath = "/dashboard") {
    render(
      <I18nProvider initialLang="en">
        <MemoryRouter initialEntries={[initialPath]}>
          <Nav />
        </MemoryRouter>
      </I18nProvider>,
    );
  }

  it("renders primary desktop navigation with route-aware links", () => {
    renderNav("/docs");

    const nav = screen.getByRole("navigation", { name: /main navigation/i });
    expect(nav).toBeInTheDocument();

    const dashboard = screen.getAllByRole("link", {
      name: "DASHBOARD",
    })[0];
    const docs = screen.getAllByRole("link", { name: "DOCS" })[0];
    const releases = screen.getByRole("link", { name: "RELEASES" });

    expect(dashboard).toHaveAttribute("href", "/dashboard");
    expect(docs).toHaveAttribute("href", "/docs");
    expect(docs).toHaveClass("text-brand");
    expect(dashboard).not.toHaveClass("text-brand");
    expect(releases).toHaveAttribute(
      "href",
      "https://github.com/milady-ai/milady/releases/latest",
    );
    expect(releases).toHaveAttribute("target", "_blank");
  });

  it("opens and closes the mobile menu through real navigation controls", () => {
    renderNav("/dashboard");

    const toggle = screen.getByRole("button", {
      name: /toggle navigation menu/i,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const mobileDocs = screen.getAllByRole("link", { name: "DOCS" }).at(-1);
    expect(mobileDocs).toHaveAttribute("href", "/docs");
    if (!mobileDocs) {
      throw new Error("Expected mobile docs link to exist");
    }

    fireEvent.click(mobileDocs);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
