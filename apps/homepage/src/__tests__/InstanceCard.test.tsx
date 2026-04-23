import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InstanceCard } from "../components/dashboard/InstanceCard";
import type { ManagedAgent } from "../lib/AgentProvider";

function makeAgent(overrides: Partial<ManagedAgent> = {}): ManagedAgent {
  return {
    id: "agent-1",
    name: "goldie",
    source: "cloud",
    status: "running",
    model: "milady runtime",
    webUiUrl: "https://example.com",
    ...overrides,
  };
}

describe("InstanceCard", () => {
  it("opens normally when the agent is running", () => {
    const onOpen = vi.fn();

    render(
      <InstanceCard
        agent={makeAgent({ status: "running" })}
        onOpen={onOpen}
        onCopyUrl={() => {}}
      />,
    );

    const openButton = screen.getByRole("button", { name: /open/i });
    expect(openButton).toBeEnabled();

    fireEvent.click(openButton);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("disables opening while the agent is provisioning", () => {
    const onOpen = vi.fn();

    render(
      <InstanceCard
        agent={makeAgent({ status: "provisioning" })}
        onOpen={onOpen}
        onCopyUrl={() => {}}
      />,
    );

    const disabledButton = screen.getByRole("button", { name: /starting…/i });
    expect(disabledButton).toBeDisabled();
    expect(disabledButton).toHaveAttribute("aria-disabled", "true");
    expect(disabledButton).toHaveAttribute(
      "title",
      "Agent is booting up. This usually takes 30–60s.",
    );
    expect(disabledButton).toHaveAttribute("tabindex", "-1");

    fireEvent.click(disabledButton);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
