/**
 * Gateway Native Module — Electrobun
 *
 * mDNS/Bonjour discovery for local Milady gateway servers.
 * Adapted from apps/app/electron/src/native/gateway.ts — Electron
 * ipcMain replaced with dispatch handlers, webContents.send replaced
 * with pushToRenderer.
 */

import { EventEmitter } from "node:events";
import { pushToRenderer } from "../ipc-server";
import type { IpcValue } from "./ipc-types";

export interface GatewayEndpoint {
  stableId: string;
  name: string;
  host: string;
  port: number;
  lanHost?: string;
  tailnetDns?: string;
  gatewayPort?: number;
  canvasPort?: number;
  tlsEnabled: boolean;
  tlsFingerprintSha256?: string;
  isLocal: boolean;
}

export interface DiscoveryOptions {
  serviceType?: string;
  timeout?: number;
  includeTxt?: boolean;
  wideAreaDomain?: string;
}

interface MDNSService {
  name?: string;
  host?: string;
  port?: number;
  txtRecord?: Record<string, string>;
  addresses?: string[];
}

interface MDNSBrowser {
  on(event: "serviceUp" | "serviceDown", cb: (s: MDNSService) => void): void;
  start(): void;
  stop(): void;
}

interface MDNSModule {
  createBrowser(type: { name: string; protocol: string }): MDNSBrowser;
}

interface BonjourService {
  name: string;
  host: string;
  port: number;
  txt?: Record<string, string>;
  addresses?: string[];
}

interface BonjourBrowser {
  on(event: string, cb: (s: BonjourService) => void): void;
  stop(): void;
}

interface BonjourModule {
  find(options: { type: string }): BonjourBrowser;
}

type BonjourFactory = () => BonjourModule;
type BonjourModuleProvider = BonjourFactory | { default: BonjourFactory };

let mdnsModule: MDNSModule | null = null;
let bonjourModule: BonjourModuleProvider | null = null;

async function loadDiscoveryModule(): Promise<"mdns" | "bonjour" | null> {
  try {
    // @ts-expect-error -- mdns is an optional dep; no types available
    // biome-ignore lint/suspicious/noExplicitAny: optional dep with no types
    const mod = (await import("mdns")) as any;
    mdnsModule = (mod.default ?? mod) as MDNSModule;
    console.log("[Gateway] Loaded mdns module");
    return "mdns";
  } catch {
    // continue
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bonjourModule = (await import(
      "bonjour-service"
    )) as unknown as BonjourModuleProvider;
    console.log("[Gateway] Loaded bonjour-service module");
    return "bonjour";
  } catch {
    // continue
  }

  for (const pkg of ["bonjour", "mdns-js"]) {
    try {
      bonjourModule = (await import(pkg)) as BonjourModuleProvider;
      console.log(`[Gateway] Loaded ${pkg}`);
      return "bonjour";
    } catch {
      // continue
    }
  }

  console.warn(
    "[Gateway] No mDNS/Bonjour module found. Install bonjour-service for local discovery.",
  );
  return null;
}

export class GatewayDiscovery extends EventEmitter {
  private discoveredGateways: Map<string, GatewayEndpoint> = new Map();
  private browser: MDNSBrowser | BonjourBrowser | null = null;
  private discoveryType: "mdns" | "bonjour" | null = null;
  private _isDiscovering = false;
  private serviceType = "_milady._tcp";

  // API-compat shim — unused in Electrobun version
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setMainWindow(_win: unknown): void {}

  async startDiscovery(options?: DiscoveryOptions): Promise<{
    gateways: GatewayEndpoint[];
    status: string;
  }> {
    if (this._isDiscovering) {
      return {
        gateways: Array.from(this.discoveredGateways.values()),
        status: "Already discovering",
      };
    }

    if (!this.discoveryType) {
      this.discoveryType = await loadDiscoveryModule();
    }

    if (!this.discoveryType) {
      return { gateways: [], status: "Discovery unavailable (no mDNS module)" };
    }

    const serviceType = options?.serviceType ?? this.serviceType;
    this.discoveredGateways.clear();
    this._isDiscovering = true;

    try {
      if (this.discoveryType === "mdns" && mdnsModule) {
        await this.startMDNSDiscovery(serviceType);
      } else if (bonjourModule) {
        await this.startBonjourDiscovery(serviceType);
      }

      this.emit("started");

      if (options?.timeout) {
        setTimeout(() => this.stopDiscovery(), options.timeout);
      }

      return {
        gateways: Array.from(this.discoveredGateways.values()),
        status: "Discovery started",
      };
    } catch (error) {
      this._isDiscovering = false;
      return {
        gateways: [],
        status: error instanceof Error ? error.message : "Discovery failed",
      };
    }
  }

  private async startMDNSDiscovery(serviceType: string): Promise<void> {
    if (!mdnsModule) return;
    const [name, protocol] = serviceType.replace(/^_/, "").split("._");
    this.browser = mdnsModule.createBrowser({
      name,
      protocol: protocol ?? "tcp",
    });
    this.browser.on("serviceUp", (s) =>
      this.handleServiceFound({
        name: s.name ?? "Unknown",
        host: s.host ?? "localhost",
        port: s.port ?? 8080,
        txt: s.txtRecord,
        addresses: s.addresses,
      }),
    );
    this.browser.on("serviceDown", (s) =>
      this.handleServiceLost({ name: s.name, host: s.host, port: s.port }),
    );
    (this.browser as MDNSBrowser).start();
  }

  private async startBonjourDiscovery(serviceType: string): Promise<void> {
    if (!bonjourModule) return;
    const factory =
      typeof bonjourModule === "function"
        ? bonjourModule
        : bonjourModule.default;
    if (!factory) return;
    const bonjour = factory();
    const type = serviceType.replace(/^_/, "").replace(/\._tcp$/, "");
    this.browser = bonjour.find({ type }) as BonjourBrowser;
    this.browser.on("up", (s) => this.handleServiceFound(s));
    this.browser.on("down", (s) =>
      this.handleServiceLost({ name: s.name, host: s.host, port: s.port }),
    );
  }

  private handleServiceFound(service: BonjourService): void {
    const txt = service.txt ?? {};
    const stableId =
      txt.id ?? `${service.name}-${service.host}:${service.port}`;
    const tlsEnabled =
      txt.protocol === "wss" || this.parseBoolean(txt.tlsEnabled ?? txt.tls);
    const gatewayPort = this.parseNumber(txt.gatewayPort) ?? service.port;
    const canvasPort = this.parseNumber(txt.canvasPort);

    const endpoint: GatewayEndpoint = {
      stableId,
      name: service.name,
      host: service.addresses?.[0] ?? service.host,
      port: service.port,
      lanHost: service.host,
      tailnetDns: txt.tailnetDns,
      gatewayPort,
      canvasPort,
      tlsEnabled,
      tlsFingerprintSha256: txt.tlsFingerprintSha256,
      isLocal: true,
    };

    const isUpdate = this.discoveredGateways.has(stableId);
    this.discoveredGateways.set(stableId, endpoint);
    this.emit(isUpdate ? "updated" : "discovered", endpoint);
    pushToRenderer("gateway:discovery", {
      type: isUpdate ? "updated" : "found",
      gateway: endpoint,
    } as IpcValue);
  }

  private handleServiceLost(service: {
    name?: string;
    host?: string;
    port?: number;
  }): void {
    for (const [id, gateway] of this.discoveredGateways) {
      const nameMatch = service.name && gateway.name === service.name;
      const hostMatch =
        service.host &&
        (gateway.host === service.host || gateway.lanHost === service.host);
      const portMatch =
        service.port &&
        (gateway.port === service.port || gateway.gatewayPort === service.port);
      if (nameMatch || hostMatch || portMatch) {
        this.discoveredGateways.delete(id);
        this.emit("lost", gateway);
        pushToRenderer("gateway:discovery", {
          type: "lost",
          gateway,
        } as IpcValue);
        break;
      }
    }
  }

  async stopDiscovery(): Promise<void> {
    if (!this._isDiscovering) return;
    if (this.browser) {
      this.browser.stop();
      this.browser = null;
    }
    this._isDiscovering = false;
    this.emit("stopped");
  }

  getDiscoveredGateways(): GatewayEndpoint[] {
    return Array.from(this.discoveredGateways.values());
  }

  isDiscoveryActive(): boolean {
    return this._isDiscovering;
  }

  private parseBoolean(value: string | undefined): boolean {
    if (!value) return false;
    return value === "true" || value === "1" || value === "yes";
  }

  private parseNumber(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const n = Number(value);
    return Number.isNaN(n) ? undefined : n;
  }

  dispose(): void {
    this.stopDiscovery();
    this.discoveredGateways.clear();
    this.removeAllListeners();
  }
}

let gatewayDiscovery: GatewayDiscovery | null = null;

export function getGatewayDiscovery(): GatewayDiscovery {
  if (!gatewayDiscovery) gatewayDiscovery = new GatewayDiscovery();
  return gatewayDiscovery;
}

export const gatewayHandlers: Record<
  string,
  (args: unknown[]) => Promise<unknown>
> = {
  "gateway:startDiscovery": ([options]) =>
    getGatewayDiscovery().startDiscovery(
      options as DiscoveryOptions | undefined,
    ),
  "gateway:stopDiscovery": () => getGatewayDiscovery().stopDiscovery(),
  "gateway:getDiscoveredGateways": () =>
    Promise.resolve({
      gateways: getGatewayDiscovery().getDiscoveredGateways(),
    }),
  "gateway:isDiscovering": () =>
    Promise.resolve({
      isDiscovering: getGatewayDiscovery().isDiscoveryActive(),
    }),
};
