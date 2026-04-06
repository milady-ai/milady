import { WebPlugin } from "@capacitor/core";
import type {
  MobileSignalsPlatform,
  MobileSignalsPlugin,
  MobileSignalsSnapshot,
  MobileSignalsSnapshotResult,
  MobileSignalsStartOptions,
  MobileSignalsStartResult,
  MobileSignalsStopResult,
} from "./definitions";

type Cleanup = () => void;
interface BatteryLike {
  charging: boolean;
  level: number;
}

function getPlatform(): MobileSignalsPlatform {
  if (typeof navigator === "undefined") {
    return "web";
  }
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("android")) return "android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    return "ios";
  }
  return "web";
}

async function getBatterySnapshot(): Promise<{
  onBattery: boolean | null;
  batteryLevel: number | null;
  isCharging: boolean | null;
}> {
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & {
          getBattery?: () => Promise<BatteryLike>;
        })
      : null;
  if (!nav || typeof nav.getBattery !== "function") {
    return { onBattery: null, batteryLevel: null, isCharging: null };
  }
  const battery = await nav.getBattery();
  return {
    onBattery: !battery.charging,
    batteryLevel:
      typeof battery.level === "number"
        ? Math.max(0, Math.min(1, battery.level))
        : null,
    isCharging: battery.charging,
  };
}

async function buildSnapshot(reason: string): Promise<MobileSignalsSnapshot> {
  const isVisible =
    typeof document !== "undefined"
      ? document.visibilityState === "visible"
      : true;
  const hasFocus =
    typeof document !== "undefined" && typeof document.hasFocus === "function"
      ? document.hasFocus()
      : true;
  const battery = await getBatterySnapshot();
  const state: MobileSignalsSnapshot["state"] =
    isVisible && hasFocus ? "active" : "background";
  const idleState: MobileSignalsSnapshot["idleState"] = isVisible
    ? "active"
    : "idle";
  return {
    source: "mobile_device",
    platform: getPlatform(),
    state,
    observedAt: Date.now(),
    idleState,
    idleTimeSeconds: null,
    onBattery: battery.onBattery,
    metadata: {
      reason,
      visibilityState:
        typeof document !== "undefined" ? document.visibilityState : "visible",
      hasFocus,
      ...battery,
    },
  };
}

export class MobileSignalsWeb extends WebPlugin implements MobileSignalsPlugin {
  private monitoring = false;
  private cleanup: Cleanup[] = [];

  private emitSignal = async (reason: string): Promise<void> => {
    if (!this.monitoring) return;
    const snapshot = await buildSnapshot(reason);
    this.notifyListeners("signal", snapshot);
  };

  private attachListeners(): void {
    if (typeof document !== "undefined") {
      const handleVisibilityChange = (): void => {
        void this.emitSignal("visibilitychange");
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);
      this.cleanup.push(() =>
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        ),
      );
    }

    if (typeof window !== "undefined") {
      const handleFocus = (): void => {
        void this.emitSignal("focus");
      };
      const handleBlur = (): void => {
        void this.emitSignal("blur");
      };
      window.addEventListener("focus", handleFocus);
      window.addEventListener("blur", handleBlur);
      this.cleanup.push(() => window.removeEventListener("focus", handleFocus));
      this.cleanup.push(() => window.removeEventListener("blur", handleBlur));
    }
  }

  private clearListeners(): void {
    while (this.cleanup.length > 0) {
      const cleanup = this.cleanup.pop();
      cleanup?.();
    }
  }

  async startMonitoring(
    options: MobileSignalsStartOptions = {},
  ): Promise<MobileSignalsStartResult> {
    if (!this.monitoring) {
      this.monitoring = true;
      this.attachListeners();
    }

    const snapshot = await buildSnapshot("start");
    if (options.emitInitial ?? true) {
      this.notifyListeners("signal", snapshot);
    }
    return {
      enabled: this.monitoring,
      supported: true,
      platform: snapshot.platform,
      snapshot,
    };
  }

  async stopMonitoring(): Promise<MobileSignalsStopResult> {
    this.monitoring = false;
    this.clearListeners();
    return { stopped: true };
  }

  async getSnapshot(): Promise<MobileSignalsSnapshotResult> {
    return {
      supported: true,
      snapshot: await buildSnapshot("snapshot"),
    };
  }
}
