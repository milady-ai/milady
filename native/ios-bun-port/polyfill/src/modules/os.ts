// node:os — iOS-shaped values via the bridge.

import { getBridge } from "../bridge.js";

export function homedir(): string {
  return getBridge().paths_app_support();
}

export function tmpdir(): string {
  return getBridge().paths_tmp();
}

export function platform(): string {
  return "ios";
}

export function type(): string {
  return "Darwin";
}

export function arch(): string {
  return "arm64";
}

export function release(): string {
  return "17.0";
}

export function hostname(): string {
  return "ios-device";
}

export function userInfo(): {
  username: string;
  uid: number;
  gid: number;
  shell: string | null;
  homedir: string;
} {
  return {
    username: "mobile",
    uid: 501,
    gid: 20,
    shell: null,
    homedir: homedir(),
  };
}

interface CpuInfo {
  model: string;
  speed: number;
  times: { user: number; nice: number; sys: number; idle: number; irq: number };
}

export function cpus(): CpuInfo[] {
  const info = getBridge().llama_hardware_info();
  const list: CpuInfo[] = [];
  for (let i = 0; i < info.cpu_cores; i++) {
    list.push({
      model: "Apple Silicon",
      speed: 3000,
      times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
    });
  }
  return list;
}

export function totalmem(): number {
  return getBridge().llama_hardware_info().total_ram_gb * 1e9;
}

export function freemem(): number {
  return getBridge().llama_hardware_info().available_ram_gb * 1e9;
}

export function loadavg(): [number, number, number] {
  return [0, 0, 0];
}

export function uptime(): number {
  return Math.floor(getBridge().now_ns() / 1e9);
}

export function endianness(): "LE" | "BE" {
  const buf = new ArrayBuffer(2);
  new DataView(buf).setInt16(0, 256, true);
  return new Int16Array(buf)[0] === 256 ? "LE" : "BE";
}

export function networkInterfaces(): Record<string, unknown[]> {
  return {};
}

export const EOL = "\n";

export const constants = {
  signals: {
    SIGINT: 2,
    SIGTERM: 15,
    SIGKILL: 9,
  },
  errno: {
    ENOENT: -2,
    EIO: -5,
    EACCES: -13,
    EEXIST: -17,
  },
};

export default {
  homedir,
  tmpdir,
  platform,
  type,
  arch,
  release,
  hostname,
  userInfo,
  cpus,
  totalmem,
  freemem,
  loadavg,
  uptime,
  endianness,
  networkInterfaces,
  EOL,
  constants,
};
