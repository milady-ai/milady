import { Button } from "@miladyai/ui";
import { useEffect, useRef } from "react";
import { useSignalPairing } from "../../hooks";
import { useApp } from "../../state";

interface SignalQrOverlayProps {
  accountId?: string;
  onConnected?: () => void;
}

export function SignalQrOverlay({
  accountId = "default",
  onConnected,
}: SignalQrOverlayProps) {
  const {
    status,
    qrDataUrl,
    phoneNumber,
    error,
    startPairing,
    stopPairing,
    disconnect,
  } = useSignalPairing(accountId);
  const { t } = useApp();
  const firedRef = useRef(false);

  useEffect(() => {
    if (status !== "connected" || !onConnected || firedRef.current) {
      return;
    }
    firedRef.current = true;
    const timer = setTimeout(onConnected, 1200);
    return () => clearTimeout(timer);
  }, [onConnected, status]);

  if (status === "connected") {
    return (
      <div
        className="mt-3 p-4"
        style={{
          border: "1px solid #22c55e",
          background: "var(--ok-subtle)",
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: "#22c55e" }}
          />
          <span className="text-xs font-medium" style={{ color: "#22c55e" }}>
            {t("onboarding.connected")}
            {phoneNumber ? ` (${phoneNumber})` : ""}
          </span>
        </div>
        <div className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
          {onConnected
            ? "Finishing Signal setup..."
            : "Signal is paired. Auth state is saved for automatic reconnection."}
        </div>
        {!onConnected ? (
          <Button
            variant="destructive"
            size="sm"
            className="mt-2 text-[10px]"
            onClick={() => void disconnect()}
          >
            {t("providerswitcher.disconnect")}
          </Button>
        ) : null}
      </div>
    );
  }

  if (status === "error" || status === "timeout") {
    return (
      <div
        className="mt-3 p-4"
        style={{
          border: "1px solid #ef4444",
          background: "var(--destructive-subtle)",
        }}
      >
        <div className="mb-2 text-xs" style={{ color: "#ef4444" }}>
          {status === "timeout"
            ? "Signal pairing timed out. Start a new session and scan again."
            : (error ?? "Signal pairing failed.")}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-[11px]"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
          onClick={() => {
            firedRef.current = false;
            void startPairing();
          }}
        >
          {t("whatsappqroverlay.TryAgain", {
            defaultValue: "Try again",
          })}
        </Button>
      </div>
    );
  }

  if (status === "idle" || status === "disconnected") {
    return (
      <div
        className="mt-3 p-4"
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg-hover)",
        }}
      >
        <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>
          {t("signalqroverlay.PairUsingSignalDesktop", {
            defaultValue:
              "Pair Signal by generating a provisioning QR code and scanning it from Signal Desktop.",
          })}
        </div>
        {error ? <div className="mb-2 text-xs text-danger">{error}</div> : null}
        <Button
          variant="outline"
          size="sm"
          className="text-[11px]"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
          onClick={() => {
            firedRef.current = false;
            void startPairing();
          }}
        >
          {t("signalqroverlay.ConnectSignal", {
            defaultValue: "Connect Signal",
          })}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="mt-3 p-4"
      style={{
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.04)",
      }}
    >
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Signal QR Code"
              className="h-48 w-48 bg-white dark:bg-white"
              style={{
                imageRendering: "pixelated",
                border: "1px solid var(--border)",
              }}
            />
          ) : (
            <div
              className="flex h-48 w-48 items-center justify-center"
              style={{
                border: "1px solid var(--border)",
                background: "var(--bg-hover)",
              }}
            >
              <span
                className="animate-pulse text-xs"
                style={{ color: "var(--muted)" }}
              >
                {t("signalqroverlay.GeneratingQR", {
                  defaultValue: "Generating QR…",
                })}
              </span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="mb-2 text-xs font-medium"
            style={{ color: "var(--text)" }}
          >
            {t("signalqroverlay.ScanWithSignalDesktop", {
              defaultValue: "Scan with Signal Desktop",
            })}
          </div>
          <ol
            className="m-0 list-decimal space-y-1 pl-4 text-[11px]"
            style={{ color: "var(--muted)" }}
          >
            <li>
              {t("signalqroverlay.OpenSignalDesktop", {
                defaultValue: "Open Signal Desktop on your Mac.",
              })}
            </li>
            <li>
              {t("signalqroverlay.OpenLinkedDevices", {
                defaultValue: "Open Signal settings and choose Linked Devices.",
              })}
            </li>
            <li>
              {t("signalqroverlay.ScanPrompt", {
                defaultValue:
                  "Choose Link New Device and scan the QR code shown here.",
              })}
            </li>
          </ol>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 text-[10px] text-muted"
            onClick={() => void stopPairing()}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
