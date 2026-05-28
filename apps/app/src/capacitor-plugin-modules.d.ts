declare module "@elizaos/capacitor-mobile-agent-bridge" {
  export const MobileAgentBridge: {
    startInboundTunnel(args: {
      relayUrl: string;
      deviceId: string;
      pairingToken?: string;
    }): Promise<void>;
    stopInboundTunnel(): Promise<void>;
  };
}
