import { BlueBubblesStatusPanel } from "./BlueBubblesStatusPanel";
import { DiscordLocalConnectorPanel } from "./DiscordLocalConnectorPanel";
import { IMessageStatusPanel } from "./IMessageStatusPanel";
import { SignalQrOverlay } from "./SignalQrOverlay";
import { TelegramBotSetupPanel } from "./TelegramBotSetupPanel";
import { WhatsAppQrOverlay } from "./WhatsAppQrOverlay";

function normalizePluginId(pluginId: string): string {
  return pluginId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function hasConnectorSetupPanel(pluginId: string): boolean {
  switch (normalizePluginId(pluginId)) {
    case "whatsapp":
    case "signal":
    case "discordlocal":
    case "bluebubbles":
    case "imessage":
    case "telegram":
      return true;
    default:
      return false;
  }
}

export function ConnectorSetupPanel({ pluginId }: { pluginId: string }) {
  switch (normalizePluginId(pluginId)) {
    case "whatsapp":
      return <WhatsAppQrOverlay accountId="default" />;
    case "signal":
      return <SignalQrOverlay accountId="default" />;
    case "discordlocal":
      return <DiscordLocalConnectorPanel />;
    case "bluebubbles":
      return <BlueBubblesStatusPanel />;
    case "imessage":
      return <IMessageStatusPanel />;
    case "telegram":
      return <TelegramBotSetupPanel />;
    default:
      return null;
  }
}
