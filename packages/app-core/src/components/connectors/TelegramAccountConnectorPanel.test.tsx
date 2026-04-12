// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient, mockUseApp } = vi.hoisted(() => ({
  mockClient: {
    getTelegramAccountStatus: vi.fn(),
    startTelegramAccountAuth: vi.fn(),
    submitTelegramAccountAuth: vi.fn(),
    disconnectTelegramAccount: vi.fn(),
    restartAndWait: vi.fn(),
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

import { TelegramAccountConnectorPanel } from "./TelegramAccountConnectorPanel";

describe("TelegramAccountConnectorPanel", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockClient.getTelegramAccountStatus.mockReset().mockResolvedValue({
      available: true,
      status: "idle",
      configured: false,
      sessionExists: false,
      serviceConnected: false,
      restartRequired: false,
      hasAppCredentials: false,
      phone: null,
      isCodeViaApp: false,
      account: null,
      error: null,
    });
    mockClient.startTelegramAccountAuth.mockReset().mockResolvedValue({
      available: true,
      status: "waiting_for_provisioning_code",
      configured: false,
      sessionExists: false,
      serviceConnected: false,
      restartRequired: false,
      hasAppCredentials: false,
      phone: "+15551234567",
      isCodeViaApp: false,
      account: null,
      error: null,
    });
    mockClient.submitTelegramAccountAuth.mockReset().mockResolvedValue({
      available: true,
      status: "configured",
      configured: true,
      sessionExists: true,
      serviceConnected: false,
      restartRequired: true,
      hasAppCredentials: true,
      phone: "+15551234567",
      isCodeViaApp: false,
      account: {
        id: "me",
        username: "shaw",
        firstName: "Shaw",
        lastName: null,
        phone: "+15551234567",
      },
      error: null,
    });
    mockClient.disconnectTelegramAccount
      .mockReset()
      .mockResolvedValue({
        ok: true,
        available: true,
        status: "idle",
        configured: false,
        sessionExists: false,
        serviceConnected: false,
        restartRequired: false,
        hasAppCredentials: false,
        phone: null,
        isCodeViaApp: false,
        account: null,
        error: null,
      });
    mockClient.restartAndWait.mockReset().mockResolvedValue({});
    mockClient.onWsEvent.mockReset().mockReturnValue(() => {});
    mockUseApp.mockReset().mockReturnValue({
      t: (key: string, vars?: { defaultValue?: string }) =>
        vars?.defaultValue ?? key,
    });
  });

  it("starts the Telegram account auth flow with the provided phone number", async () => {
    render(<TelegramAccountConnectorPanel />);

    await waitFor(() =>
      expect(mockClient.getTelegramAccountStatus).toHaveBeenCalledOnce(),
    );

    const phoneInput = screen.getByPlaceholderText("+15551234567");
    fireEvent.change(phoneInput, { target: { value: "+15551234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() =>
      expect(mockClient.startTelegramAccountAuth).toHaveBeenCalledWith(
        "+15551234567",
      ),
    );
    expect(
      await screen.findByText(/Telegram app provisioning code/i),
    ).toBeTruthy();
  });

  it("submits the next auth step and exposes restart once configured", async () => {
    mockClient.getTelegramAccountStatus.mockResolvedValue({
      available: true,
      status: "waiting_for_password",
      configured: false,
      sessionExists: false,
      serviceConnected: false,
      restartRequired: false,
      hasAppCredentials: true,
      phone: "+15551234567",
      isCodeViaApp: false,
      account: null,
      error: null,
    });

    render(<TelegramAccountConnectorPanel />);

    await waitFor(() =>
      expect(mockClient.getTelegramAccountStatus).toHaveBeenCalledOnce(),
    );

    const passwordInput = screen.getByPlaceholderText(
      "Telegram account password",
    );
    fireEvent.change(passwordInput, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(mockClient.submitTelegramAccountAuth).toHaveBeenCalledWith({
        password: "secret",
      }),
    );

    expect(await screen.findByText("Authenticated as @shaw.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Restart agent" }),
    ).toBeTruthy();
  });
});
