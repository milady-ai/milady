import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "../composites/sidebar";
import { SidebarContent } from "../composites/sidebar/sidebar-content";
import { SidebarPanel } from "../composites/sidebar/sidebar-panel";
import { SegmentedControl } from "./segmented-control";

describe("Sidebar", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
        clear: () => {
          storage.clear();
        },
      },
    });
  });

  it("renders the shared default shell chrome", () => {
    render(<Sidebar data-testid="sidebar" header={<div>Header</div>} />);
    const sidebar = screen.getByTestId("sidebar");
    expect(sidebar.className).toContain("rounded-tr-[26px]");
    expect(sidebar.className).toContain("rounded-l-none");
    expect(sidebar.className).toContain(
      "transition-[width,min-width,border-radius,box-shadow,transform]",
    );
  });

  it("switches between expanded and collapsed layouts with built-in controls", () => {
    render(
      <Sidebar
        data-testid="sidebar"
        collapsible
        collapseButtonTestId="collapse"
        expandButtonTestId="expand"
        header={<div>Header</div>}
        collapsedContent={<div>Collapsed</div>}
      >
        <div>Body</div>
      </Sidebar>,
    );

    fireEvent.click(screen.getByTestId("collapse"));
    expect(screen.getByTestId("sidebar")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    expect(screen.getByTestId("sidebar").className).toContain("w-[4.75rem]");
    expect(screen.getByText("Collapsed")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("expand"));
    expect(screen.getByTestId("sidebar")).not.toHaveAttribute("data-collapsed");
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("fires collapse state changes", () => {
    const onCollapsedChange = vi.fn();
    render(
      <Sidebar
        collapsible
        collapseButtonTestId="collapse"
        expandButtonTestId="expand"
        onCollapsedChange={onCollapsedChange}
        header={<div>Header</div>}
        collapsedContent={<div>Collapsed</div>}
      >
        <div>Body</div>
      </Sidebar>,
    );

    fireEvent.click(screen.getByTestId("collapse"));
    fireEvent.click(screen.getByTestId("expand"));

    expect(onCollapsedChange).toHaveBeenNthCalledWith(1, true);
    expect(onCollapsedChange).toHaveBeenNthCalledWith(2, false);
  });

  it("syncs collapsed state across shared sidebar instances", () => {
    render(
      <>
        <Sidebar
          data-testid="sidebar-a"
          collapsible
          syncId="primary-nav"
          collapseButtonTestId="collapse-a"
          expandButtonTestId="expand-a"
          header={<div>Header A</div>}
          collapsedContent={<div>Collapsed A</div>}
        >
          <div>Body A</div>
        </Sidebar>
        <Sidebar
          data-testid="sidebar-b"
          collapsible
          syncId="primary-nav"
          collapseButtonTestId="collapse-b"
          expandButtonTestId="expand-b"
          header={<div>Header B</div>}
          collapsedContent={<div>Collapsed B</div>}
        >
          <div>Body B</div>
        </Sidebar>
      </>,
    );

    fireEvent.click(screen.getByTestId("collapse-a"));
    expect(screen.getByTestId("sidebar-a")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    expect(screen.getByTestId("sidebar-b")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
  });

  it("renders the mobile close control", () => {
    const onMobileClose = vi.fn();
    render(
      <Sidebar
        variant="mobile"
        onMobileClose={onMobileClose}
        mobileCloseLabel="Close chats"
        mobileTitle={<div>Chats</div>}
        mobileMeta="12"
        header={<div>Header</div>}
      >
        <div>Body</div>
      </Sidebar>,
    );

    fireEvent.click(screen.getByLabelText("Close chats"));
    expect(onMobileClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Chats")).toBeInTheDocument();
  });

  it("renders the game-modal shell classes", () => {
    render(
      <Sidebar
        variant="game-modal"
        data-testid="sidebar"
        header={<div>Header</div>}
      >
        <div>Body</div>
      </Sidebar>,
    );
    expect(screen.getByTestId("sidebar").className).toContain("rounded-[24px]");
    expect(screen.getByTestId("sidebar").className).toContain(
      "backdrop-blur-xl",
    );
  });

  it("auto-generates collapsed rail items from shared sidebar content", () => {
    const onSelectSettings = vi.fn();
    const onViewChange = vi.fn();
    const onToggleChain = vi.fn();

    render(
      <Sidebar collapsible defaultCollapsed data-testid="sidebar">
        <SidebarPanel>
          <SidebarContent.Item as="div" active>
            <SidebarContent.ItemButton onClick={onSelectSettings}>
              <SidebarContent.ItemBody>
                <SidebarContent.ItemTitle>AI Model</SidebarContent.ItemTitle>
                <SidebarContent.ItemDescription>
                  Provider selection
                </SidebarContent.ItemDescription>
              </SidebarContent.ItemBody>
            </SidebarContent.ItemButton>
          </SidebarContent.Item>
          <SegmentedControl
            value="tokens"
            onValueChange={onViewChange}
            items={[
              { value: "tokens", label: "Tokens" },
              { value: "nfts", label: "NFTs" },
            ]}
          />
          <button
            type="button"
            aria-label="Ethereum — shown (click to hide)"
            aria-pressed
            onClick={onToggleChain}
          >
            <span>Ξ</span>
          </button>
        </SidebarPanel>
      </Sidebar>,
    );

    fireEvent.click(screen.getByRole("button", { name: "AI Model" }));
    fireEvent.click(screen.getByRole("button", { name: "Tokens" }));
    fireEvent.click(screen.getByRole("button", { name: "Ethereum" }));

    expect(onSelectSettings).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith("tokens");
    expect(onToggleChain).toHaveBeenCalledTimes(1);
    expect(screen.getByText("AM")).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: "Ethereum" })).getAllByText("Ξ")
        .length,
    ).toBeGreaterThan(0);
  });
});
