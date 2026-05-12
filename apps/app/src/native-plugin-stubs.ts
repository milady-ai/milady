export const Agent = {
  async getStatus(): Promise<{ status: string }> {
    return { status: "unavailable" };
  },
};

type ListenerHandle = {
  remove(): void | Promise<void>;
};

type DesktopEventPayload<TEvent extends string> =
  TEvent extends "shortcutPressed"
    ? { id: string }
    : TEvent extends "trayMenuClick"
      ? { itemId: string; checked?: boolean }
      : unknown;

export const Desktop = {
  async getVersion(): Promise<{ runtime: string }> {
    return { runtime: "N/A" };
  },
  async registerShortcut(_options: {
    id: string;
    accelerator: string;
  }): Promise<void> {},
  async addListener<TEvent extends string>(
    _eventName: TEvent,
    _listener: (event: DesktopEventPayload<TEvent>) => void,
  ): Promise<ListenerHandle> {
    return { remove() {} };
  },
  async setTrayMenu(_options: { menu: readonly unknown[] }): Promise<void> {},
};

export type MobileSignalsPlatform = "android" | "ios" | "web";

export type MobileSignalsSource = "mobile_device" | "mobile_health";

export type MobileSignalsState =
  | "active"
  | "idle"
  | "background"
  | "locked"
  | "sleeping";

export type MobileSignalsHealthSource = "healthkit" | "health_connect";

export type MobileSignalsSettingsTarget =
  | "app"
  | "health"
  | "healthConnect"
  | "screenTime"
  | "usageAccess"
  | "notification"
  | "batteryOptimization"
  | "localNetwork"
  | "deviceSettings";

export type MobileSignalsSetupActionStatus =
  | "ready"
  | "needs-action"
  | "unavailable";

export interface MobileSignalsSetupAction {
  id:
    | "health_permissions"
    | "screen_time_authorization"
    | "android_usage_access"
    | "app_settings"
    | "notification_settings"
    | "battery_optimization"
    | "local_network";
  label: string;
  status: MobileSignalsSetupActionStatus;
  canRequest: boolean;
  canOpenSettings: boolean;
  settingsTarget: MobileSignalsSettingsTarget | null;
  reason: string | null;
}

export interface MobileSignalsOpenSettingsOptions {
  target?: MobileSignalsSettingsTarget;
}

export interface MobileSignalsOpenSettingsResult {
  opened: boolean;
  target: MobileSignalsSettingsTarget;
  actualTarget: MobileSignalsSettingsTarget;
  reason: string | null;
}

export interface MobileSignalsScreenTimeStatus {
  supported: boolean;
  requirements: {
    entitlements: {
      familyControls: string;
    };
    frameworks: string[];
    deviceActivityReportExtension: boolean;
    deviceActivityMonitorExtension: boolean;
    android?: {
      usageStatsPermission: string;
      usageAccessSettingsAction: string;
    };
  };
  entitlements: {
    familyControls: boolean;
  };
  provisioning: {
    satisfied: boolean;
    inspected: "code-signature" | "not-inspectable";
    reason: string | null;
  };
  authorization: {
    status: "approved" | "denied" | "not-determined" | "unavailable";
    canRequest: boolean;
  };
  reportAvailable: boolean;
  coarseSummaryAvailable: boolean;
  thresholdEventsAvailable: boolean;
  rawUsageExportAvailable: false;
  android?: {
    usageAccessGranted: boolean;
    packageUsageStatsPermissionDeclared: boolean;
    canOpenUsageAccessSettings: boolean;
    foregroundEventsAvailable: boolean;
    totalTimeForegroundMs: number | null;
  };
  reason: string | null;
}

export interface MobileSignalsHealthSleepSnapshot {
  available: boolean;
  isSleeping: boolean;
  asleepAt: number | null;
  awakeAt: number | null;
  durationMinutes: number | null;
  stage: string | null;
}

export interface MobileSignalsHealthBiometricSnapshot {
  sampleAt: number | null;
  heartRateBpm: number | null;
  restingHeartRateBpm: number | null;
  heartRateVariabilityMs: number | null;
  respiratoryRate: number | null;
  bloodOxygenPercent: number | null;
}

export interface MobileSignalsHealthSnapshot {
  source: "mobile_health";
  platform: MobileSignalsPlatform;
  state: "idle" | "sleeping";
  observedAt: number;
  idleState: "active" | "idle" | "locked" | "unknown" | null;
  idleTimeSeconds: number | null;
  onBattery: boolean | null;
  healthSource: MobileSignalsHealthSource;
  screenTime: MobileSignalsScreenTimeStatus;
  permissions: {
    sleep: boolean;
    biometrics: boolean;
  };
  sleep: MobileSignalsHealthSleepSnapshot;
  biometrics: MobileSignalsHealthBiometricSnapshot;
  warnings: string[];
  metadata: Record<string, unknown>;
}

export interface MobileSignalsSnapshot {
  source: "mobile_device";
  platform: MobileSignalsPlatform;
  state: MobileSignalsState;
  observedAt: number;
  idleState: "active" | "idle" | "locked" | "unknown" | null;
  idleTimeSeconds: number | null;
  onBattery: boolean | null;
  metadata: Record<string, unknown>;
}

export type MobileSignalsSignal =
  | MobileSignalsSnapshot
  | MobileSignalsHealthSnapshot;

export interface MobileSignalsStartOptions {
  emitInitial?: boolean;
}

export interface MobileSignalsStartResult {
  enabled: boolean;
  supported: boolean;
  platform: MobileSignalsPlatform;
  snapshot: MobileSignalsSnapshot | null;
  healthSnapshot: MobileSignalsHealthSnapshot | null;
}

export interface MobileSignalsStopResult {
  stopped: boolean;
}

export interface MobileSignalsSnapshotResult {
  supported: boolean;
  snapshot: MobileSignalsSnapshot | null;
  healthSnapshot: MobileSignalsHealthSnapshot | null;
}

export interface MobileSignalsBackgroundRefreshResult {
  scheduled: boolean;
  identifier?: string;
  earliestBeginInSeconds?: number;
  reason?: string;
}

export interface MobileSignalsCancelBackgroundRefreshResult {
  cancelled: boolean;
  reason?: string;
}

export interface MobileSignalsPermissionStatus {
  status: "granted" | "denied" | "not-determined" | "not-applicable";
  canRequest: boolean;
  reason?: string;
  screenTime: MobileSignalsScreenTimeStatus;
  setupActions: MobileSignalsSetupAction[];
  permissions: {
    sleep: boolean;
    biometrics: boolean;
  };
}

export interface MobileSignalsPlugin {
  checkPermissions(): Promise<MobileSignalsPermissionStatus>;
  requestPermissions(): Promise<MobileSignalsPermissionStatus>;
  openSettings(
    options?: MobileSignalsOpenSettingsOptions,
  ): Promise<MobileSignalsOpenSettingsResult>;
  startMonitoring(
    options?: MobileSignalsStartOptions,
  ): Promise<MobileSignalsStartResult>;
  stopMonitoring(): Promise<MobileSignalsStopResult>;
  getSnapshot(): Promise<MobileSignalsSnapshotResult>;
  scheduleBackgroundRefresh(): Promise<MobileSignalsBackgroundRefreshResult>;
  cancelBackgroundRefresh(): Promise<MobileSignalsCancelBackgroundRefreshResult>;
  addListener(
    eventName: "signal",
    listenerFunc: (event: MobileSignalsSignal) => void,
  ): Promise<ListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const unsupportedScreenTimeStatus: MobileSignalsScreenTimeStatus = {
  supported: false,
  requirements: {
    entitlements: { familyControls: "" },
    frameworks: [],
    deviceActivityReportExtension: false,
    deviceActivityMonitorExtension: false,
  },
  entitlements: { familyControls: false },
  provisioning: {
    satisfied: false,
    inspected: "not-inspectable",
    reason: "Native mobile signals are unavailable in this build target.",
  },
  authorization: {
    status: "unavailable",
    canRequest: false,
  },
  reportAvailable: false,
  coarseSummaryAvailable: false,
  thresholdEventsAvailable: false,
  rawUsageExportAvailable: false,
  reason: "Native mobile signals are unavailable in this build target.",
};

function unsupportedMobileSignalsPermissions(): MobileSignalsPermissionStatus {
  return {
    status: "not-applicable",
    canRequest: false,
    reason: "Native mobile signals are unavailable in this build target.",
    screenTime: unsupportedScreenTimeStatus,
    setupActions: [],
    permissions: {
      sleep: false,
      biometrics: false,
    },
  };
}

export const MobileSignals: MobileSignalsPlugin = {
  async checkPermissions() {
    return unsupportedMobileSignalsPermissions();
  },
  async requestPermissions() {
    return unsupportedMobileSignalsPermissions();
  },
  async openSettings(options) {
    const target = options?.target ?? "app";
    return {
      opened: false,
      target,
      actualTarget: target,
      reason: "Native mobile signals are unavailable in this build target.",
    };
  },
  async startMonitoring() {
    return {
      enabled: false,
      supported: false,
      platform: "web",
      snapshot: null,
      healthSnapshot: null,
    };
  },
  async stopMonitoring() {
    return { stopped: true };
  },
  async getSnapshot() {
    return {
      supported: false,
      snapshot: null,
      healthSnapshot: null,
    };
  },
  async scheduleBackgroundRefresh() {
    return {
      scheduled: false,
      reason: "Native mobile signals are unavailable in this build target.",
    };
  },
  async cancelBackgroundRefresh() {
    return {
      cancelled: false,
      reason: "Native mobile signals are unavailable in this build target.",
    };
  },
  async addListener() {
    return { remove() {} };
  },
  async removeAllListeners() {},
};

export interface DeviceBridgeClient {
  stop(): void;
}

export type DeviceBridgeClientState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface StartDeviceBridgeClientOptions {
  agentUrl: string;
  pairingToken?: string;
  deviceId?: string;
  onStateChange?: (state: DeviceBridgeClientState, detail?: string) => void;
}

export function startDeviceBridgeClient(
  _options: StartDeviceBridgeClientOptions,
): DeviceBridgeClient {
  return { stop() {} };
}
