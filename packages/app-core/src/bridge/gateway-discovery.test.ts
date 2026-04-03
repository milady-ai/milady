import {
  gatewayEndpointToApiBase,
  getPreferredGatewayHost,
  type GatewayDiscoveryEndpoint,
} from "./gateway-discovery";
import { describe, expect, it } from "vitest";

function makeGateway(
  overrides?: Partial<GatewayDiscoveryEndpoint>,
): GatewayDiscoveryEndpoint {
  return {
    stableId: "ren",
    name: "Ren",
    host: "10.0.0.2",
    port: 18789,
    tlsEnabled: false,
    isLocal: true,
    ...overrides,
  };
}

describe("gateway-discovery", () => {
  it("prefers lan hostnames when building the API base", () => {
    const gateway = makeGateway({ lanHost: "ren.local" });

    expect(getPreferredGatewayHost(gateway)).toBe("ren.local");
    expect(gatewayEndpointToApiBase(gateway)).toBe("http://ren.local:18789");
  });

  it("falls back to gateway port and tls when present", () => {
    const gateway = makeGateway({
      gatewayPort: 443,
      tailnetDns: "ren.tailnet",
      tlsEnabled: true,
    });

    expect(getPreferredGatewayHost(gateway)).toBe("ren.tailnet");
    expect(gatewayEndpointToApiBase(gateway)).toBe("https://ren.tailnet:443");
  });
});
