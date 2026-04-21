// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient, mockUseApp } = vi.hoisted(() => ({
  mockClient: {
    getBlueBubblesStatus: vi.fn(),
    getBaseUrl: vi.fn(),
    onWsEvent: vi.fn(() => () => {}),
  },
  mockUseApp: vi.fn(),
}));

vi.mock("../../api", () => ({
  client: mockClient,
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

import { BlueBubblesStatusPanel } from "./BlueBubblesStatusPanel";

describe("BlueBubblesStatusPanel", () => {
  beforeEach(() => {
    mockClient.getBlueBubblesStatus.mockReset().mockResolvedValue({
      available: true,
      connected: true,
      webhookPath: "/webhooks/bluebubbles",
    });
    mockClient.getBaseUrl.mockReset().mockReturnValue("http://127.0.0.1:31337");
    mockClient.onWsEvent.mockReset().mockReturnValue(() => {});
    mockUseApp.mockReset().mockReturnValue({
      t: (key: string, vars?: { defaultValue?: string }) =>
        vars?.defaultValue ?? key,
    });
  });

  it("renders the live connection state and resolved webhook target", async () => {
    render(<BlueBubblesStatusPanel />);

    await waitFor(() =>
      expect(mockClient.getBlueBubblesStatus).toHaveBeenCalledOnce(),
    );

    expect(await screen.findByText("BlueBubbles is connected.")).toBeTruthy();
    expect(
      screen.getByText("http://127.0.0.1:31337/webhooks/bluebubbles"),
    ).toBeTruthy();
  });
});
