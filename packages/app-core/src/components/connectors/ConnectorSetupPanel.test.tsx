// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./LifeOpsBrowserSetupPanel", () => ({
  LifeOpsBrowserSetupPanel: () => <div>lifeops-browser-panel</div>,
}));

vi.mock("./WhatsAppQrOverlay", () => ({
  WhatsAppQrOverlay: () => <div>whatsapp-panel</div>,
}));

vi.mock("./SignalQrOverlay", () => ({
  SignalQrOverlay: () => <div>signal-panel</div>,
}));

vi.mock("./DiscordLocalConnectorPanel", () => ({
  DiscordLocalConnectorPanel: () => <div>discord-local-panel</div>,
}));

vi.mock("./BlueBubblesStatusPanel", () => ({
  BlueBubblesStatusPanel: () => <div>bluebubbles-panel</div>,
}));

vi.mock("./IMessageStatusPanel", () => ({
  IMessageStatusPanel: () => <div>imessage-panel</div>,
}));

vi.mock("./TelegramBotSetupPanel", () => ({
  TelegramBotSetupPanel: () => <div>telegram-bot-panel</div>,
}));

vi.mock("./TelegramAccountConnectorPanel", () => ({
  TelegramAccountConnectorPanel: () => <div>telegram-account-panel</div>,
}));

import { ConnectorSetupPanel, hasConnectorSetupPanel } from "./ConnectorSetupPanel";

describe("ConnectorSetupPanel telegram separation", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps the bot panel on the telegram connector id", () => {
    expect(hasConnectorSetupPanel("@elizaos/plugin-telegram")).toBe(true);
    render(<ConnectorSetupPanel pluginId="@elizaos/plugin-telegram" />);
    expect(screen.getByText("telegram-bot-panel")).toBeTruthy();
  });

  it("renders the separate account panel on the telegramAccount connector id", () => {
    expect(
      hasConnectorSetupPanel("@elizaos-plugins/client-telegram-account"),
    ).toBe(true);
    render(
      <ConnectorSetupPanel pluginId="@elizaos-plugins/client-telegram-account" />,
    );
    expect(screen.getByText("telegram-account-panel")).toBeTruthy();
  });
});
