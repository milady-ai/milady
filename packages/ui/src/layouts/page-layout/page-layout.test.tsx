import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SidebarProps } from "../../components/composites/sidebar";
import { PageLayout } from "./page-layout";

function installMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: "(min-width: 768px)",
      onchange: null,
      addEventListener: (
        _: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        listeners.add(listener);
      },
      removeEventListener: (
        _: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        listeners.delete(listener);
      },
      addListener: (listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeListener: (listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: () => true,
    })),
  });

  return listeners;
}

function SidebarProbe({
  collapsible,
  mobileTitle,
  onMobileClose,
  testId = "sidebar-probe",
  variant,
}: SidebarProps) {
  return (
    <aside data-testid={testId}>
      <div>{`variant:${variant ?? "unset"}`}</div>
      <div>{`collapsible:${String(collapsible)}`}</div>
      <div>{mobileTitle ?? "Browse"}</div>
      {onMobileClose ? (
        <button type="button" onClick={onMobileClose}>
          Close sidebar
        </button>
      ) : null}
    </aside>
  );
}

describe("PageLayout", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__TEST_RENDERER__ = true;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__TEST_RENDERER__;
  });

  it("enables the collapsible desktop sidebar by default", () => {
    installMatchMedia(true);

    render(
      <PageLayout sidebar={<SidebarProbe mobileTitle="Browse" />}>
        <div>Content</div>
      </PageLayout>,
    );

    expect(screen.getByText("variant:default")).toBeInTheDocument();
    expect(screen.getByText("collapsible:true")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Browse" }),
    ).not.toBeInTheDocument();
  });

  it("opens the mobile drawer and injects a mobile sidebar clone", () => {
    installMatchMedia(false);

    render(
      <PageLayout sidebar={<SidebarProbe mobileTitle="Browse" />}>
        <div>Content</div>
      </PageLayout>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Browse" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("variant:mobile")).toBeInTheDocument();
    expect(within(dialog).getByText("collapsible:false")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close sidebar" }));
    expect(screen.queryByText("variant:mobile")).not.toBeInTheDocument();
  });

  it("renders shared content headers inside the content column", () => {
    installMatchMedia(true);

    render(
      <PageLayout
        sidebar={<SidebarProbe mobileTitle="Browse" />}
        contentHeader={<div>Tabs</div>}
      >
        <div>Content</div>
      </PageLayout>,
    );

    expect(screen.getByText("Tabs")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});
