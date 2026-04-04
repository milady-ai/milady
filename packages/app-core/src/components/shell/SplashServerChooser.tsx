import { Button, Card, CardContent } from "@miladyai/ui";
import type { GatewayDiscoveryEndpoint } from "../../bridge/gateway-discovery";

const MONO_FONT = "'Courier New', 'Courier', 'Monaco', monospace";

interface SplashServerChooserProps {
  discoveryLoading: boolean;
  gateways: GatewayDiscoveryEndpoint[];
  showElizaCloudEntry: boolean;
  t: (key: string, values?: Record<string, unknown>) => string;
  onCreateLocal: () => void;
  onManualConnect: () => void;
  onUseElizaCloud: () => void;
  onConnectGateway: (gateway: GatewayDiscoveryEndpoint) => void;
  onLoadContentPack?: () => void;
}

function gatewayLabel(
  gateway: GatewayDiscoveryEndpoint,
  t: SplashServerChooserProps["t"],
): string {
  return gateway.isLocal
    ? t("startupshell.LocalNetworkAgent", { defaultValue: "LAN agent" })
    : t("startupshell.NetworkAgent", { defaultValue: "Network agent" });
}

export function SplashServerChooser({
  discoveryLoading,
  gateways,
  showElizaCloudEntry,
  t,
  onCreateLocal,
  onManualConnect,
  onUseElizaCloud,
  onConnectGateway,
  onLoadContentPack,
}: SplashServerChooserProps) {
  return (
    <div className="mt-4 flex w-full flex-col gap-3 text-left">
      {gateways.length > 0 ? (
        <div className="flex flex-col gap-2">
          {gateways.map((gateway) => (
            <Card
              key={gateway.stableId}
              className="border-2 border-black bg-white shadow-md"
            >
              <CardContent className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <p
                    style={{ fontFamily: MONO_FONT }}
                    className="text-[9px] uppercase text-black/60"
                  >
                    {gatewayLabel(gateway, t)}
                  </p>
                  <p className="truncate text-sm font-semibold text-black">
                    {gateway.name}
                  </p>
                  <p className="truncate text-[11px] text-black/70">
                    {gateway.host}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-2 border-black bg-white text-black font-semibold hover:bg-black hover:text-[#ffe600]"
                  onClick={() => onConnectGateway(gateway)}
                >
                  {t("startupshell.Connect", { defaultValue: "Connect" })}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p
          style={{ fontFamily: MONO_FONT }}
          className="text-[8px] uppercase text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
        >
          {discoveryLoading
            ? t("startupshell.ScanningNetwork", {
                defaultValue: "Scanning your network...",
              })
            : t("startupshell.NoNetworkAgentsFound", {
                defaultValue: "No LAN agents found yet.",
              })}
        </p>
      )}

      {showElizaCloudEntry ? (
        <Button
          type="button"
          variant="default"
          className="justify-start border-2 border-black bg-white px-3 py-5 text-left text-black font-semibold shadow-md hover:bg-black hover:text-[#ffe600]"
          onClick={onUseElizaCloud}
        >
          <span className="flex flex-col items-start gap-1">
            <span
              style={{ fontFamily: MONO_FONT }}
              className="text-[9px] uppercase text-black/60"
            >
              {t("startupshell.ElizaCloudAgent", {
                defaultValue: "Eliza Cloud",
              })}
            </span>
            <span className="text-sm font-bold">
              {t("startupshell.UseElizaCloud", {
                defaultValue: "Use Eliza Cloud",
              })}
            </span>
          </span>
        </Button>
      ) : null}

      <Button
        type="button"
        variant="default"
        className="justify-start border-2 border-black bg-black px-3 py-5 text-left text-[#ffe600] font-semibold shadow-md hover:bg-[#ffe600] hover:text-black hover:border-black"
        onClick={onCreateLocal}
      >
        <span className="flex flex-col items-start gap-1">
          <span
            style={{ fontFamily: MONO_FONT }}
            className="text-[9px] uppercase text-[#ffe600]/80"
          >
            {t("startupshell.CreateAgentLabel", {
              defaultValue: "New local agent",
            })}
          </span>
          <span className="text-sm font-bold">
            {t("startupshell.CreateOne", { defaultValue: "Create one" })}
          </span>
        </span>
      </Button>

      <Button
        type="button"
        variant="default"
        className="justify-start border-2 border-black bg-white px-3 py-5 text-left text-black font-semibold shadow-md hover:bg-black hover:text-[#ffe600]"
        onClick={onManualConnect}
      >
        <span className="flex flex-col items-start gap-1">
          <span
            style={{ fontFamily: MONO_FONT }}
            className="text-[9px] uppercase text-black/60"
          >
            {t("startupshell.RemoteAgentLabel", {
              defaultValue: "Existing server",
            })}
          </span>
          <span className="text-sm font-bold">
            {t("startupshell.ManuallyConnect", {
              defaultValue: "Manually connect to one",
            })}
          </span>
        </span>
      </Button>

      {onLoadContentPack ? (
        <Button
          type="button"
          variant="default"
          className="justify-start border-2 border-dashed border-black/60 bg-white/90 px-3 py-4 text-left text-black font-semibold shadow-sm hover:bg-black hover:text-[#ffe600] hover:border-solid"
          onClick={onLoadContentPack}
        >
          <span className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-bold">
              {t("startupshell.LoadPack", {
                defaultValue: "Load content pack",
              })}
            </span>
            <span
              style={{ fontFamily: MONO_FONT }}
              className="text-[8px] uppercase text-black/50"
            >
              {t("startupshell.LoadPackHint", {
                defaultValue: "VRMs, backgrounds, themes",
              })}
            </span>
          </span>
        </Button>
      ) : null}
    </div>
  );
}
