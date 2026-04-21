// @vitest-environment jsdom

import type React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient, mockUseApp, mockOpenExternalUrl } = vi.hoisted(() => ({
  mockClient: {
    submitAnthropicSetupToken: vi.fn(async () => ({ success: true })),
    startAnthropicLogin: vi.fn(async () => ({
      authUrl: "https://claude.example.com/login",
    })),
    exchangeAnthropicCode: vi.fn(async () => ({ success: true })),
    startOpenAILogin: vi.fn(async () => ({
      authUrl: "https://chatgpt.example.com/login",
    })),
    exchangeOpenAICode: vi.fn(async () => ({ success: true })),
    deleteSubscription: vi.fn(async () => ({ success: true })),
    restartAgent: vi.fn(async () => ({ ok: true })),
  },
  mockUseApp: vi.fn(),
  mockOpenExternalUrl: vi.fn(async () => {}),
}));

vi.mock("../../api", () => ({
  client: mockClient,
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../hooks", () => ({
  useTimeout: () => ({ setTimeout }),
}));

vi.mock("../../utils", () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
  Label: ({
    children,
    ...props
  }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
}));

import { SubscriptionStatus } from "./SubscriptionStatus";

function t(
  key: string,
  params?: Record<string, string | number | undefined>,
): string {
  const translations: Record<string, string> = {
    "onboarding.setupToken": "Setup token",
    "onboarding.oauthLogin": "OAuth login",
    "onboarding.loginWithAnthropic": "Log in with Claude",
    "onboarding.loginWithOpenAI": "Log in with OpenAI",
    "onboarding.completeLogin": "Complete login",
    "onboarding.connect": "Connect",
    "onboarding.startOver": "Start over",
    "onboarding.connecting": "Connecting",
    "subscriptionstatus.ChatGPTSubscriptionTitle": "ChatGPT Subscription",
    "subscriptionstatus.ClaudeSubscriptionTitle": "Claude Subscription",
    "subscriptionstatus.CodexAllAccess": "Codex can be used everywhere.",
    "subscriptionstatus.RequiresChatGPTPlu": "Requires ChatGPT Plus or Pro.",
    "subscriptionstatus.RequiresClaudePro": "Requires Claude subscription.",
    "subscriptionstatus.AfterLoggingInYo":
      "After logging in, paste the callback URL from",
    "subscriptionstatus.localhost1455": "localhost:1455",
    "subscriptionstatus.CopyTheEntireU": "and copy the entire URL.",
    "subscriptionstatus.httpLocalhost145":
      "http://localhost:1455/auth/callback?code=...",
    "subscriptionstatus.ExpectedCallbackUrl":
      "Expected a localhost:1455/auth/callback URL.",
    "subscriptionstatus.ExchangeFailedError": "Exchange failed: {{message}}",
    "subscriptionstatus.FailedToStartLogin":
      "Failed to start login: {{message}}",
    "subscriptionstatus.FailedToGetAuthUrl": "Failed to get auth URL",
    "subscriptionstatus.NoAuthUrlReturned": "No auth URL returned",
    "subscriptionstatus.DisconnectFailedError":
      "Disconnect failed: {{message}}",
    "subscriptionstatus.ExchangeFailed": "Exchange failed",
    "subscriptionstatus.SaveToken": "Save token",
    "subscriptionstatus.SavingAmpRestart": "Saving and restarting…",
    "subscriptionstatus.skAntOat01": "sk-ant-oat01-...",
    "subscriptionstatus.FailedToSaveTokenError":
      "Failed to save token: {{message}}",
    "subscriptionstatus.FailedToSaveSetupToken": "Failed to save setup token",
    "apikeyconfig.saved": "Saved",
    "apikeyconfig.saving": "Saving",
    "subscriptionstatus.ClaudeTosWarningShort":
      "Claude subscription powers task agents only.",
    "subscriptionstatus.PasteTheAuthorizat": "Paste the authorization code",
    "subscriptionstatus.AfterLoggingInCo":
      "After logging in, paste the authorization code.",
    "subscriptionstatus.Completing": "Completing",
    "providerswitcher.disconnect": "Disconnect",
    "providerswitcher.disconnecting": "Disconnecting",
    "onboarding.loginSessionExpired": "Login session expired",
    "onboarding.setupTokenInstructions":
      "Run claude setup-token and paste the result.",
  };
  const template = translations[key] ?? key;
  if (!params) {
    return template;
  }
  return Object.entries(params).reduce(
    (acc, [name, value]) => acc.replace(`{{${name}}}`, String(value ?? "")),
    template,
  );
}

function renderSubscriptionStatus(
  overrides: Partial<React.ComponentProps<typeof SubscriptionStatus>> = {},
) {
  const props: React.ComponentProps<typeof SubscriptionStatus> = {
    resolvedSelectedId: "openai-subscription",
    subscriptionStatus: [],
    anthropicConnected: false,
    setAnthropicConnected: vi.fn(),
    openaiConnected: false,
    setOpenaiConnected: vi.fn(),
    handleSelectSubscription: vi.fn(async () => {}),
    loadSubscriptionStatus: vi.fn(async () => {}),
    ...overrides,
  };

  return {
    ...render(<SubscriptionStatus {...props} />),
    props,
  };
}

describe("SubscriptionStatus", () => {
  beforeEach(() => {
    mockUseApp.mockReturnValue({ t });
    mockClient.submitAnthropicSetupToken.mockClear();
    mockClient.startAnthropicLogin.mockClear();
    mockClient.exchangeAnthropicCode.mockClear();
    mockClient.startOpenAILogin.mockClear();
    mockClient.exchangeOpenAICode.mockClear();
    mockClient.deleteSubscription.mockClear();
    mockClient.restartAgent.mockClear();
    mockOpenExternalUrl.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("trims Claude setup tokens before persisting them in settings", async () => {
    const handleSelectSubscription = vi.fn(async () => {});
    const loadSubscriptionStatus = vi.fn(async () => {});

    renderSubscriptionStatus({
      resolvedSelectedId: "anthropic-subscription",
      handleSelectSubscription,
      loadSubscriptionStatus,
    });

    fireEvent.change(screen.getByLabelText("Setup token"), {
      target: { value: "  sk-ant-oat01-test-token  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save token" }));

    await waitFor(() => {
      expect(mockClient.submitAnthropicSetupToken).toHaveBeenCalledWith(
        "sk-ant-oat01-test-token",
      );
    });
    expect(handleSelectSubscription).toHaveBeenCalledWith(
      "anthropic-subscription",
    );
    expect(loadSubscriptionStatus).toHaveBeenCalledTimes(1);
    expect(mockClient.restartAgent).toHaveBeenCalledTimes(1);
  });

  it("surfaces Claude setup-token save failures with the formatted error", async () => {
    mockClient.submitAnthropicSetupToken.mockRejectedValueOnce(
      new Error("save blew up"),
    );

    renderSubscriptionStatus({
      resolvedSelectedId: "anthropic-subscription",
    });

    fireEvent.change(screen.getByLabelText("Setup token"), {
      target: { value: "sk-ant-oat01-test-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save token" }));

    expect(
      await screen.findByText("Failed to save token: save blew up"),
    ).toBeTruthy();
  });

  it("shows the generic Claude save-token error when the backend reports a non-success result", async () => {
    mockClient.submitAnthropicSetupToken.mockResolvedValueOnce({
      success: false,
    });

    renderSubscriptionStatus({
      resolvedSelectedId: "anthropic-subscription",
    });

    fireEvent.change(screen.getByLabelText("Setup token"), {
      target: { value: "sk-ant-oat01-test-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save token" }));

    expect(await screen.findByText("Failed to save setup token")).toBeTruthy();
  });

  it("blocks invalid OpenAI callback URLs before calling exchange", async () => {
    renderSubscriptionStatus();

    fireEvent.click(screen.getByRole("button", { name: "Log in with OpenAI" }));
    await screen.findByPlaceholderText(
      "http://localhost:1455/auth/callback?code=...",
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "http://localhost:1455/auth/callback?code=...",
      ),
      {
        target: { value: "https://example.com/auth/callback?code=oops" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Complete login" }));

    expect(mockClient.exchangeOpenAICode).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Expected a localhost:1455/auth/callback URL."),
    ).toBeTruthy();
  });

  it("shows the actual OpenAI exchange error instead of a generic network failure", async () => {
    mockClient.exchangeOpenAICode.mockRejectedValueOnce(
      new Error("exchange broke"),
    );

    renderSubscriptionStatus();

    fireEvent.click(screen.getByRole("button", { name: "Log in with OpenAI" }));
    await screen.findByPlaceholderText(
      "http://localhost:1455/auth/callback?code=...",
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "http://localhost:1455/auth/callback?code=...",
      ),
      {
        target: { value: "localhost:1455/auth/callback?code=openai-code" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Complete login" }));

    expect(mockClient.exchangeOpenAICode).toHaveBeenCalledWith(
      "http://localhost:1455/auth/callback?code=openai-code",
    );
    expect(
      await screen.findByText("Exchange failed: exchange broke"),
    ).toBeTruthy();
  });

  it("shows a Claude login start error when the OAuth bootstrap fails", async () => {
    mockClient.startAnthropicLogin.mockRejectedValueOnce(
      new Error("claude start broke"),
    );

    renderSubscriptionStatus({
      resolvedSelectedId: "anthropic-subscription",
    });

    fireEvent.click(screen.getByRole("button", { name: "OAuth login" }));
    fireEvent.click(screen.getByRole("button", { name: "Log in with Claude" }));

    expect(
      await screen.findByText("Failed to start login: claude start broke"),
    ).toBeTruthy();
  });

  it("shows Claude exchange errors returned by the API without masking them", async () => {
    mockClient.exchangeAnthropicCode.mockResolvedValueOnce({
      success: false,
      error: "Claude code rejected",
    });

    renderSubscriptionStatus({
      resolvedSelectedId: "anthropic-subscription",
    });

    fireEvent.click(screen.getByRole("button", { name: "OAuth login" }));
    fireEvent.click(screen.getByRole("button", { name: "Log in with Claude" }));
    await screen.findByPlaceholderText("Paste the authorization code");
    fireEvent.change(
      screen.getByPlaceholderText("Paste the authorization code"),
      {
        target: { value: "anthro-code-123" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByText("Claude code rejected")).toBeTruthy();
  });

  it("surfaces missing Claude auth URLs before opening the browser flow", async () => {
    mockClient.startAnthropicLogin.mockResolvedValueOnce({ authUrl: "" });

    renderSubscriptionStatus({
      resolvedSelectedId: "anthropic-subscription",
    });

    fireEvent.click(screen.getByRole("button", { name: "OAuth login" }));
    fireEvent.click(screen.getByRole("button", { name: "Log in with Claude" }));

    expect(await screen.findByText("Failed to get auth URL")).toBeTruthy();
    expect(mockOpenExternalUrl).not.toHaveBeenCalled();
  });

  it("completes the Claude OAuth flow and refreshes the runtime state", async () => {
    const handleSelectSubscription = vi.fn(async () => {});
    const loadSubscriptionStatus = vi.fn(async () => {});
    const setAnthropicConnected = vi.fn();

    renderSubscriptionStatus({
      resolvedSelectedId: "anthropic-subscription",
      handleSelectSubscription,
      loadSubscriptionStatus,
      setAnthropicConnected,
    });

    fireEvent.click(screen.getByRole("button", { name: "OAuth login" }));
    fireEvent.click(screen.getByRole("button", { name: "Log in with Claude" }));
    await screen.findByPlaceholderText("Paste the authorization code");
    fireEvent.change(
      screen.getByPlaceholderText("Paste the authorization code"),
      {
        target: { value: "anthro-success-code" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(mockClient.exchangeAnthropicCode).toHaveBeenCalledWith(
        "anthro-success-code",
      );
    });
    expect(setAnthropicConnected).toHaveBeenCalledWith(true);
    expect(handleSelectSubscription).toHaveBeenCalledWith(
      "anthropic-subscription",
    );
    expect(loadSubscriptionStatus).toHaveBeenCalledTimes(1);
    expect(mockClient.restartAgent).toHaveBeenCalledTimes(1);
  });

  it("clears Claude OAuth errors when the user starts over", async () => {
    mockClient.exchangeAnthropicCode.mockRejectedValueOnce(
      new Error("bad claude code"),
    );

    renderSubscriptionStatus({
      resolvedSelectedId: "anthropic-subscription",
    });

    fireEvent.click(screen.getByRole("button", { name: "OAuth login" }));
    fireEvent.click(screen.getByRole("button", { name: "Log in with Claude" }));
    await screen.findByPlaceholderText("Paste the authorization code");
    fireEvent.change(
      screen.getByPlaceholderText("Paste the authorization code"),
      {
        target: { value: "anthro-code-123" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByText("Exchange failed: bad claude code"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start over" }));

    expect(
      screen.getByRole("button", { name: "Log in with Claude" }),
    ).toBeTruthy();
    expect(screen.queryByText("Exchange failed: bad claude code")).toBeNull();
  });

  it("switches back to the setup-token tab from the Claude OAuth flow", async () => {
    renderSubscriptionStatus({
      resolvedSelectedId: "anthropic-subscription",
    });

    fireEvent.click(screen.getByRole("button", { name: "OAuth login" }));
    await screen.findByRole("button", { name: "Log in with Claude" });

    fireEvent.click(screen.getByRole("button", { name: "Setup token" }));

    expect(screen.getByRole("button", { name: "Save token" })).toBeTruthy();
  });

  it("completes the OpenAI OAuth flow and refreshes the runtime state", async () => {
    const handleSelectSubscription = vi.fn(async () => {});
    const loadSubscriptionStatus = vi.fn(async () => {});
    const setOpenaiConnected = vi.fn();

    renderSubscriptionStatus({
      handleSelectSubscription,
      loadSubscriptionStatus,
      setOpenaiConnected,
    });

    fireEvent.click(screen.getByRole("button", { name: "Log in with OpenAI" }));
    await screen.findByPlaceholderText(
      "http://localhost:1455/auth/callback?code=...",
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "http://localhost:1455/auth/callback?code=...",
      ),
      {
        target: { value: "localhost:1455/auth/callback?code=openai-success" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Complete login" }));

    await waitFor(() => {
      expect(mockClient.exchangeOpenAICode).toHaveBeenCalledWith(
        "http://localhost:1455/auth/callback?code=openai-success",
      );
    });
    expect(setOpenaiConnected).toHaveBeenCalledWith(true);
    expect(handleSelectSubscription).toHaveBeenCalledWith(
      "openai-subscription",
    );
    expect(loadSubscriptionStatus).toHaveBeenCalledTimes(1);
    expect(mockClient.restartAgent).toHaveBeenCalledTimes(1);
  });

  it("maps expired OpenAI login flows to the session-expired message", async () => {
    mockClient.exchangeOpenAICode.mockResolvedValueOnce({
      success: false,
      error: "No active flow for this callback",
    });

    renderSubscriptionStatus();

    fireEvent.click(screen.getByRole("button", { name: "Log in with OpenAI" }));
    await screen.findByPlaceholderText(
      "http://localhost:1455/auth/callback?code=...",
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "http://localhost:1455/auth/callback?code=...",
      ),
      {
        target: { value: "localhost:1455/auth/callback?code=openai-expired" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Complete login" }));

    expect(await screen.findByText("Login session expired")).toBeTruthy();
  });

  it("clears OpenAI OAuth errors when the user starts over", async () => {
    mockClient.exchangeOpenAICode.mockRejectedValueOnce(
      new Error("bad openai callback"),
    );

    renderSubscriptionStatus();

    fireEvent.click(screen.getByRole("button", { name: "Log in with OpenAI" }));
    await screen.findByPlaceholderText(
      "http://localhost:1455/auth/callback?code=...",
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "http://localhost:1455/auth/callback?code=...",
      ),
      {
        target: { value: "localhost:1455/auth/callback?code=openai-code" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Complete login" }));

    expect(
      await screen.findByText("Exchange failed: bad openai callback"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start over" }));

    expect(
      screen.getByRole("button", { name: "Log in with OpenAI" }),
    ).toBeTruthy();
    expect(
      screen.queryByText("Exchange failed: bad openai callback"),
    ).toBeNull();
  });

  it("surfaces missing OpenAI auth URLs before opening the browser flow", async () => {
    mockClient.startOpenAILogin.mockResolvedValueOnce({ authUrl: "" });

    renderSubscriptionStatus();

    fireEvent.click(screen.getByRole("button", { name: "Log in with OpenAI" }));

    expect(await screen.findByText("No auth URL returned")).toBeTruthy();
    expect(mockOpenExternalUrl).not.toHaveBeenCalled();
  });

  it("shows the real OpenAI login bootstrap error when startup fails", async () => {
    mockClient.startOpenAILogin.mockRejectedValueOnce(
      new Error("openai start broke"),
    );

    renderSubscriptionStatus();

    fireEvent.click(screen.getByRole("button", { name: "Log in with OpenAI" }));

    expect(
      await screen.findByText("Failed to start login: openai start broke"),
    ).toBeTruthy();
  });

  it("disconnects Claude subscription and clears the connected state", async () => {
    const setAnthropicConnected = vi.fn();
    const loadSubscriptionStatus = vi.fn(async () => {});

    renderSubscriptionStatus({
      resolvedSelectedId: "anthropic-subscription",
      anthropicConnected: true,
      setAnthropicConnected,
      loadSubscriptionStatus,
    });

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    await waitFor(() => {
      expect(mockClient.deleteSubscription).toHaveBeenCalledWith(
        "anthropic-subscription",
      );
    });
    expect(setAnthropicConnected).toHaveBeenCalledWith(false);
    expect(loadSubscriptionStatus).toHaveBeenCalledTimes(1);
    expect(mockClient.restartAgent).toHaveBeenCalledTimes(1);
  });

  it("surfaces disconnect failures on the matching provider panel", async () => {
    const setOpenaiConnected = vi.fn();
    mockClient.deleteSubscription.mockRejectedValueOnce(
      new Error("disconnect broke"),
    );

    renderSubscriptionStatus({
      resolvedSelectedId: "openai-subscription",
      openaiConnected: true,
      setOpenaiConnected,
    });

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(
      await screen.findByText("Disconnect failed: disconnect broke"),
    ).toBeTruthy();
    expect(setOpenaiConnected).not.toHaveBeenCalled();
    expect(mockClient.restartAgent).not.toHaveBeenCalled();
  });

  it("disconnects ChatGPT subscription and clears the connected state", async () => {
    const setOpenaiConnected = vi.fn();
    const loadSubscriptionStatus = vi.fn(async () => {});

    renderSubscriptionStatus({
      resolvedSelectedId: "openai-subscription",
      openaiConnected: true,
      setOpenaiConnected,
      loadSubscriptionStatus,
    });

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    await waitFor(() => {
      expect(mockClient.deleteSubscription).toHaveBeenCalledWith(
        "openai-codex",
      );
    });
    expect(setOpenaiConnected).toHaveBeenCalledWith(false);
    expect(loadSubscriptionStatus).toHaveBeenCalledTimes(1);
    expect(mockClient.restartAgent).toHaveBeenCalledTimes(1);
  });

  it("treats openai-codex status entries as the ChatGPT subscription state", () => {
    renderSubscriptionStatus({
      resolvedSelectedId: "openai-subscription",
      subscriptionStatus: [
        {
          provider: "openai-codex",
          configured: true,
          valid: false,
          expiresAt: null,
        },
      ],
    });

    expect(
      screen.getByText("subscriptionstatus.ChatGPTSubscription"),
    ).toBeTruthy();
  });
});
