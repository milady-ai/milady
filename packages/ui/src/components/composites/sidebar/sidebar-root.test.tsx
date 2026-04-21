import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "../../ui/segmented-control";
import { SidebarContent } from "./sidebar-content";
import { SidebarPanel } from "./sidebar-panel";
import { Sidebar } from "./sidebar-root";
import { SidebarScrollRegion } from "./sidebar-scroll-region";

function WrappedSidebarEntry({
  active = false,
  label,
  onSelect,
}: {
  active?: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <SidebarContent.Item as="div" active={active}>
      <SidebarContent.ItemButton
        onClick={onSelect}
        aria-current={active ? "page" : undefined}
      >
        <SidebarContent.ItemBody>
          <SidebarContent.ItemTitle>{label}</SidebarContent.ItemTitle>
          <SidebarContent.ItemDescription>
            Wrapped description
          </SidebarContent.ItemDescription>
        </SidebarContent.ItemBody>
      </SidebarContent.ItemButton>
    </SidebarContent.Item>
  );
}

describe("Sidebar", () => {
  it("falls back to rendering the body when collapsed without custom rail content", () => {
    render(
      <Sidebar collapsible defaultCollapsed>
        <button type="button" data-testid="fallback-body-button">
          Tokens
        </button>
      </Sidebar>,
    );

    expect(screen.getAllByTestId("fallback-body-button")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toBeInTheDocument();
  });

  it("builds collapsed rail items from wrapped sidebar entries", async () => {
    const onSelect = vi.fn();

    render(
      <Sidebar collapsible defaultCollapsed>
        <SidebarScrollRegion>
          <SidebarPanel>
            <WrappedSidebarEntry
              active
              label="Model Settings"
              onSelect={onSelect}
            />
          </SidebarPanel>
        </SidebarScrollRegion>
      </Sidebar>,
    );

    const railButton = await screen.findByRole("button", {
      name: "Model Settings",
    });
    expect(screen.getByText("MS")).toBeInTheDocument();

    fireEvent.click(railButton);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("uses shared segmented and icon toggle controls for wallet-like rails", async () => {
    const onSegmentChange = vi.fn();
    const onChainToggle = vi.fn();

    render(
      <Sidebar collapsible defaultCollapsed>
        <SidebarScrollRegion>
          <SidebarPanel>
            <SegmentedControl
              className="grid w-full grid-cols-2"
              value="tokens"
              onValueChange={onSegmentChange}
              items={[
                { value: "tokens", label: "Tokens" },
                { value: "nfts", label: "NFTs" },
              ]}
            />
            <div className="grid grid-cols-5 gap-2">
              <button
                type="button"
                aria-pressed
                aria-label="Ethereum — shown (click to hide)"
                onClick={onChainToggle}
              >
                <svg data-testid="wallet-chain-icon" viewBox="0 0 16 16" />
              </button>
            </div>
          </SidebarPanel>
        </SidebarScrollRegion>
      </Sidebar>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Tokens" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "NFTs" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Ethereum" }),
      ).toBeInTheDocument();
    });

    const chainRailButton = screen.getByRole("button", { name: "Ethereum" });
    expect(
      within(chainRailButton).getByTestId("wallet-chain-icon"),
    ).toBeInTheDocument();

    fireEvent.click(chainRailButton);
    expect(onChainToggle).toHaveBeenCalledTimes(1);
  });

  it("aligns list-only collapsed rails to the shared top inset", () => {
    render(
      <Sidebar collapsible defaultCollapsed>
        <SidebarScrollRegion>
          <SidebarPanel>
            <SidebarContent.Item as="div" active>
              <SidebarContent.ItemButton onClick={() => undefined}>
                <SidebarContent.ItemBody>
                  <SidebarContent.ItemTitle>Connector</SidebarContent.ItemTitle>
                </SidebarContent.ItemBody>
              </SidebarContent.ItemButton>
            </SidebarContent.Item>
          </SidebarPanel>
        </SidebarScrollRegion>
      </Sidebar>,
    );

    const list = document.querySelector("[data-sidebar-collapsed-rail-list]");
    expect(list).toBeInTheDocument();
    expect(list?.className).toContain("pt-1");
  });
});
