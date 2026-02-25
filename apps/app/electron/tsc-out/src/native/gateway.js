"use strict";
/**
 * Gateway Native Module for Electron
 *
 * Provides native mDNS/Bonjour discovery for local gateway servers
 * and DNS-SD for wide-area discovery.
 */
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== "default") __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayDiscovery = void 0;
exports.getGatewayDiscovery = getGatewayDiscovery;
exports.registerGatewayIPC = registerGatewayIPC;
const node_events_1 = require("node:events");
const electron_1 = require("electron");
let mdnsModule = null;
let bonjourModule = null;
async function loadDiscoveryModule() {
  var _a;
  // Try mdns first (faster, native)
  try {
    // @ts-expect-error -- mdns is an optional native module
    const mod = await Promise.resolve().then(() =>
      __importStar(require("mdns")),
    );
    mdnsModule = (_a = mod.default) !== null && _a !== void 0 ? _a : mod;
    console.log("[Gateway] Loaded mdns module");
    return "mdns";
  } catch (_b) {
    // Continue
  }
  // Try bonjour (pure JS, more portable)
  try {
    // @ts-expect-error -- bonjour module shape varies across versions
    bonjourModule = await Promise.resolve().then(() =>
      __importStar(require("bonjour-service")),
    );
    console.log("[Gateway] Loaded bonjour-service module");
    return "bonjour";
  } catch (_c) {
    // Continue
  }
  // Try alternative packages
  const alternatives = ["bonjour", "mdns-js"];
  for (const pkg of alternatives) {
    try {
      bonjourModule = await Promise.resolve(`${pkg}`).then((s) =>
        __importStar(require(s)),
      );
      console.log(`[Gateway] Loaded ${pkg} module`);
      return "bonjour";
    } catch (_d) {
      // Continue
    }
  }
  console.warn(
    "[Gateway] No mDNS/Bonjour module available. Install bonjour-service for local discovery.",
  );
  return null;
}
/**
 * Gateway Discovery Manager
 */
class GatewayDiscovery extends node_events_1.EventEmitter {
  constructor() {
    super(...arguments);
    this.discoveredGateways = new Map();
    this.browser = null;
    this.discoveryType = null;
    this.isDiscovering = false;
    this.serviceType = "_milady._tcp";
    this.mainWindow = null;
  }
  /**
   * Set the main window for sending events
   */
  setMainWindow(window) {
    this.mainWindow = window;
  }
  /**
   * Start gateway discovery
   */
  async startDiscovery(options) {
    if (this.isDiscovering) {
      return {
        gateways: Array.from(this.discoveredGateways.values()),
        status: "Already discovering",
      };
    }
    // Load discovery module if not already loaded
    if (!this.discoveryType) {
      this.discoveryType = await loadDiscoveryModule();
    }
    if (!this.discoveryType) {
      return {
        gateways: [],
        status: "Discovery unavailable (no mDNS module)",
      };
    }
    const serviceType =
      (options === null || options === void 0 ? void 0 : options.serviceType) ||
      this.serviceType;
    this.discoveredGateways.clear();
    this.isDiscovering = true;
    try {
      if (this.discoveryType === "mdns" && mdnsModule) {
        await this.startMDNSDiscovery(serviceType);
      } else if (bonjourModule) {
        await this.startBonjourDiscovery(serviceType);
      }
      this.emit("started");
      // Set timeout if specified
      if (options === null || options === void 0 ? void 0 : options.timeout) {
        setTimeout(() => {
          this.stopDiscovery();
        }, options.timeout);
      }
      return {
        gateways: Array.from(this.discoveredGateways.values()),
        status: "Discovery started",
      };
    } catch (error) {
      this.isDiscovering = false;
      const message =
        error instanceof Error ? error.message : "Discovery failed";
      return {
        gateways: [],
        status: message,
      };
    }
  }
  async startMDNSDiscovery(serviceType) {
    if (!mdnsModule) return;
    const [name, protocol] = serviceType.replace(/^_/, "").split("._");
    this.browser = mdnsModule.createBrowser({
      name: name,
      protocol: protocol || "tcp",
    });
    this.browser.on("serviceUp", (service) => {
      this.handleServiceFound({
        name: service.name || "Unknown",
        host: service.host || "localhost",
        port: service.port || 8080,
        txt: service.txtRecord,
        addresses: service.addresses,
      });
    });
    this.browser.on("serviceDown", (service) => {
      this.handleServiceLost({
        name: service.name,
        host: service.host,
        port: service.port,
      });
    });
    // Start the browser to begin discovery
    this.browser.start();
  }
  async startBonjourDiscovery(serviceType) {
    if (!bonjourModule) return;
    const factory =
      typeof bonjourModule === "function"
        ? bonjourModule
        : bonjourModule.default;
    if (!factory) return;
    const bonjour = factory();
    const type = serviceType.replace(/^_/, "").replace(/\._tcp$/, "");
    this.browser = bonjour.find({ type });
    this.browser.on("up", (service) => {
      this.handleServiceFound(service);
    });
    this.browser.on("down", (service) => {
      this.handleServiceLost({
        name: service.name,
        host: service.host,
        port: service.port,
      });
    });
  }
  handleServiceFound(service) {
    var _a, _b, _c, _d, _f, _g;
    const txt = (_a = service.txt) !== null && _a !== void 0 ? _a : {};
    const stableId =
      (_b = txt.id) !== null && _b !== void 0
        ? _b
        : `${service.name}-${service.host}:${service.port}`;
    const tlsEnabled =
      txt.protocol === "wss" ||
      this.parseBoolean(
        (_c = txt.tlsEnabled) !== null && _c !== void 0 ? _c : txt.tls,
      );
    const gatewayPort =
      (_d = this.parseNumber(txt.gatewayPort)) !== null && _d !== void 0
        ? _d
        : service.port;
    const canvasPort = this.parseNumber(txt.canvasPort);
    const endpoint = {
      stableId,
      name: service.name,
      host:
        (_g =
          (_f = service.addresses) === null || _f === void 0
            ? void 0
            : _f[0]) !== null && _g !== void 0
          ? _g
          : service.host,
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
    this.sendToRenderer("gateway:discovery", {
      type: isUpdate ? "updated" : "found",
      gateway: endpoint,
    });
  }
  handleServiceLost(service) {
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
        this.sendToRenderer("gateway:discovery", {
          type: "lost",
          gateway,
        });
        break;
      }
    }
  }
  /**
   * Stop gateway discovery
   */
  async stopDiscovery() {
    if (!this.isDiscovering) return;
    if (this.browser) {
      this.browser.stop();
      this.browser = null;
    }
    this.isDiscovering = false;
    this.emit("stopped");
  }
  /**
   * Get all discovered gateways
   */
  getDiscoveredGateways() {
    return Array.from(this.discoveredGateways.values());
  }
  /**
   * Check if discovery is active
   */
  isDiscoveryActive() {
    return this.isDiscovering;
  }
  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
  parseBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      return value === "true" || value === "1" || value === "yes";
    }
    return false;
  }
  parseNumber(value) {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  /**
   * Clean up resources
   */
  dispose() {
    this.stopDiscovery();
    this.discoveredGateways.clear();
    this.removeAllListeners();
  }
}
exports.GatewayDiscovery = GatewayDiscovery;
// Singleton instance
let gatewayDiscovery = null;
function getGatewayDiscovery() {
  if (!gatewayDiscovery) {
    gatewayDiscovery = new GatewayDiscovery();
  }
  return gatewayDiscovery;
}
/**
 * Register Gateway IPC handlers
 */
function registerGatewayIPC() {
  const discovery = getGatewayDiscovery();
  electron_1.ipcMain.handle("gateway:startDiscovery", async (_e, options) => {
    return discovery.startDiscovery(options);
  });
  electron_1.ipcMain.handle("gateway:stopDiscovery", async () => {
    return discovery.stopDiscovery();
  });
  electron_1.ipcMain.handle("gateway:getDiscoveredGateways", () => {
    return {
      gateways: discovery.getDiscoveredGateways(),
    };
  });
  electron_1.ipcMain.handle("gateway:isDiscovering", () => {
    return { isDiscovering: discovery.isDiscoveryActive() };
  });
}
