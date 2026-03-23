import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectionStatus } from "./connection-status";

describe("ConnectionStatus", () => {
  it("renders connected state with correct label", () => {
    render(<ConnectionStatus state="connected" />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("renders disconnected state with correct label", () => {
    render(<ConnectionStatus state="disconnected" />);
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("renders error state with correct label", () => {
    render(<ConnectionStatus state="error" />);
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("custom label overrides default", () => {
    render(<ConnectionStatus state="connected" label="Online" />);
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });

  it("per-state label overrides default when no custom label", () => {
    render(
      <ConnectionStatus state="disconnected" disconnectedLabel="Offline" />,
    );
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });
});
