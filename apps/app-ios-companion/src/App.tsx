import type React from "react";
import { useEffect, useState } from "react";
import { apnsEnabled, agentUrl as configuredAgentUrl } from "./lib/env";
import { logger } from "./lib/logger";
import { MiladyIntent } from "./plugins/milady-intent";
import { useNavigation, type ViewName } from "./services/navigation";
import { type RegisterPushHandle, registerPush } from "./services/push";
import type { PairingPayload } from "./services/session-client";
import { Chat } from "./views/Chat";
import { Pairing } from "./views/Pairing";
import { RemoteSession } from "./views/RemoteSession";

export function App(): React.JSX.Element {
  const nav = useNavigation();
  const [agentUrl, setAgentUrl] = useState<string | null>(null);
  const [pairingPayload, setPairingPayload] = useState<PairingPayload | null>(
    null,
  );

  useEffect(() => {
    logger.info("[App] boot", {
      apnsEnabled: apnsEnabled(),
      hasConfiguredAgentUrl: configuredAgentUrl() !== null,
    });
    MiladyIntent.getPairingStatus().then((status) => {
      if (status.paired && status.agentUrl !== null) {
        setAgentUrl(status.agentUrl);
      }
    });
  }, []);

  useEffect(() => {
    if (!apnsEnabled()) return;
    let handle: RegisterPushHandle | null = null;
    registerPush({
      onIntent: (intent) => {
        if (intent.kind === "session-start") {
          logger.info("[App] session.start intent -> RemoteSession", {
            agentId: intent.payload.agentId,
          });
          setPairingPayload(intent.payload);
          setAgentUrl(intent.payload.ingressUrl);
          nav.push("remote-session");
        }
      },
      onError: (err) => {
        logger.warn("[App] push registration error", { message: err.message });
      },
    }).then((h) => {
      handle = h;
    });
    return () => {
      handle?.unregister();
    };
  }, [nav]);

  if (!nav.ready) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  return renderView(nav.view, {
    agentUrl,
    pairingPayload,
    onPushPairing: () => nav.push("pairing"),
    onPushRemoteSession: () => nav.push("remote-session"),
    onBackToChat: () => nav.pop("chat"),
    onPaired: (payload: PairingPayload) => {
      setPairingPayload(payload);
      setAgentUrl(payload.ingressUrl);
      nav.push("remote-session");
    },
  });
}

interface ViewHandlers {
  agentUrl: string | null;
  pairingPayload: PairingPayload | null;
  onPushPairing(): void;
  onPushRemoteSession(): void;
  onBackToChat(): void;
  onPaired(payload: PairingPayload): void;
}

function renderView(view: ViewName, h: ViewHandlers): React.JSX.Element {
  if (view === "pairing") {
    return <Pairing onPaired={h.onPaired} onBack={h.onBackToChat} />;
  }
  if (view === "remote-session") {
    if (h.pairingPayload === null) {
      return (
        <Chat
          pairedAgentUrl={h.agentUrl}
          onOpenPairing={h.onPushPairing}
          onOpenRemoteSession={h.onPushRemoteSession}
          remoteSessionAvailable={false}
        />
      );
    }
    return <RemoteSession payload={h.pairingPayload} onExit={h.onBackToChat} />;
  }
  return (
    <Chat
      pairedAgentUrl={h.agentUrl}
      onOpenPairing={h.onPushPairing}
      onOpenRemoteSession={h.onPushRemoteSession}
      remoteSessionAvailable={h.pairingPayload !== null}
    />
  );
}
