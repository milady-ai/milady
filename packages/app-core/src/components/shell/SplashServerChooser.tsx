import { Button, Card, CardContent } from "@miladyai/ui";
import type { GatewayDiscoveryEndpoint } from "../../bridge/gateway-discovery";

interface SplashServerChooserProps {
  discoveryLoading: boolean;
  gateways: GatewayDiscoveryEndpoint[];
  showElizaCloudEntry: boolean;
  t: (key: string, values?: Record<string, unknown>) => string;
  onCreateLocal: () => void;
  onManualConnect: () => void;
  onUseElizaCloud: () => void;
  onConnectGateway: (gateway: GatewayDiscoveryEndpoint) => void;
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
}: SplashServerChooserProps) {
  return (
    <div className="mt-4 flex w-full flex-col gap-3 text-left">
      {gateways.length > 0 ? (
        <div className="flex flex-col gap-2">
          {gateways.map((gateway) => (
            <Card
              key={gateway.stableId}
              className="border border-black/30 bg-black/5 shadow-none"
            >
              <CardContent className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <p
                    style={{
                      fontFamily:
                        "'Courier New', 'Courier', 'Monaco', monospace",
                    }}
                    className="text-[9px] uppercase text-black/50"
                  >
                    {gatewayLabel(gateway, t)}
                  </p>
                  <p className="truncate text-sm font-semibold text-black">
                    {gateway.name}
                  </p>
                  <p className="truncate text-[11px] text-black/60">
                    {gateway.host}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-black/50 bg-transparent text-black hover:bg-black/10"
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
          style={{
            fontFamily: "'Courier New', 'Courier', 'Monaco', monospace",
          }}
          className="text-[8px] uppercase text-black/45"
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
          variant="outline"
          className="justify-start border-black/50 bg-black/5 px-3 py-5 text-left text-black hover:bg-black/10"
          onClick={onUseElizaCloud}
        >
          <span className="flex flex-col items-start gap-1">
            <span
              style={{
                fontFamily: "'Courier New', 'Courier', 'Monaco', monospace",
              }}
              className="text-[9px] uppercase text-black/50"
            >
              {t("startupshell.ElizaCloudAgent", {
                defaultValue: "Eliza Cloud",
              })}
            </span>
            <span className="text-sm font-semibold">
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
        className="justify-start bg-black px-3 py-5 text-left text-[#ffe600] hover:bg-black/85"
        onClick={onCreateLocal}
      >
        <span className="flex flex-col items-start gap-1">
          <span
            style={{
              fontFamily: "'Courier New', 'Courier', 'Monaco', monospace",
            }}
            className="text-[9px] uppercase text-[#ffe600]/70"
          >
            {t("startupshell.CreateAgentLabel", {
              defaultValue: "New local agent",
            })}
          </span>
          <span className="text-sm font-semibold">
            {t("startupshell.CreateOne", { defaultValue: "Create one" })}
          </span>
        </span>
      </Button>

      <Button
        type="button"
        variant="outline"
        className="justify-start border-black/50 bg-black/5 px-3 py-5 text-left text-black hover:bg-black/10"
        onClick={onManualConnect}
      >
        <span className="flex flex-col items-start gap-1">
          <span
            style={{
              fontFamily: "'Courier New', 'Courier', 'Monaco', monospace",
            }}
            className="text-[9px] uppercase text-black/50"
          >
            {t("startupshell.RemoteAgentLabel", {
              defaultValue: "Existing server",
            })}
          </span>
          <span className="text-sm font-semibold">
            {t("startupshell.ManuallyConnect", {
              defaultValue: "Manually connect to one",
            })}
          </span>
        </span>
      </Button>
    </div>
  );
}
