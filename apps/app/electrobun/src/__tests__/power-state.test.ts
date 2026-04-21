import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  linuxSysfsOnBattery,
  parseMacOsHidIdleTimeOutput,
  parseMacOsPowerSourceOutput,
  parseMacOsSessionLockedOutput,
  parseWindowsPowerLineOutput,
} from "../native/power-state";

function writeSupply(
  root: string,
  name: string,
  type: string,
  status?: string,
): void {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "type"), `${type}\n`, "utf8");
  if (status !== undefined) {
    fs.writeFileSync(path.join(dir, "status"), `${status}\n`, "utf8");
  }
}

describe("linuxSysfsOnBattery", () => {
  let tmp: string | null = null;

  afterEach(() => {
    if (tmp && fs.existsSync(tmp)) {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    tmp = null;
  });

  it("returns false when root is missing", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "milady-ps-"));
    const missing = path.join(tmp, "nope");
    expect(linuxSysfsOnBattery(missing)).toBe(false);
  });

  it("returns false when no Battery supply exists", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "milady-ps-"));
    writeSupply(tmp, "ACAD", "Mains");
    expect(linuxSysfsOnBattery(tmp)).toBe(false);
  });

  it("returns true when a Battery supply is Discharging", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "milady-ps-"));
    writeSupply(tmp, "BAT0", "Battery", "Discharging");
    expect(linuxSysfsOnBattery(tmp)).toBe(true);
  });

  it("returns false when Battery is Charging", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "milady-ps-"));
    writeSupply(tmp, "macsmc_battery", "Battery", "Charging");
    expect(linuxSysfsOnBattery(tmp)).toBe(false);
  });

  it("returns true if any Battery is Discharging", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "milady-ps-"));
    writeSupply(tmp, "BAT0", "Battery", "Charging");
    writeSupply(tmp, "BAT1", "Battery", "Discharging");
    expect(linuxSysfsOnBattery(tmp)).toBe(true);
  });
});

describe("parseWindowsPowerLineOutput", () => {
  it("treats Offline as on battery", () => {
    expect(parseWindowsPowerLineOutput("Offline")).toEqual({
      onBattery: true,
      known: true,
    });
  });

  it("treats Online and Unknown as not on battery", () => {
    expect(parseWindowsPowerLineOutput("Online")).toEqual({
      onBattery: false,
      known: true,
    });
    expect(parseWindowsPowerLineOutput("Unknown")).toEqual({
      onBattery: false,
      known: true,
    });
  });

  it("uses the last non-empty line", () => {
    expect(parseWindowsPowerLineOutput("warning here\n \nOnline\n")).toEqual({
      onBattery: false,
      known: true,
    });
  });

  it("returns unknown for empty or unexpected output", () => {
    expect(parseWindowsPowerLineOutput("")).toEqual({
      onBattery: false,
      known: false,
    });
    expect(parseWindowsPowerLineOutput("42")).toEqual({
      onBattery: false,
      known: false,
    });
  });
});

describe("parseMacOsPowerSourceOutput", () => {
  it("detects battery and AC power", () => {
    expect(
      parseMacOsPowerSourceOutput(
        "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234567)\t83%; discharging",
      ),
    ).toEqual({
      onBattery: true,
      known: true,
    });
    expect(
      parseMacOsPowerSourceOutput(
        "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1234567)\t100%; charged",
      ),
    ).toEqual({
      onBattery: false,
      known: true,
    });
  });

  it("returns unknown for unrelated output", () => {
    expect(parseMacOsPowerSourceOutput("n/a")).toEqual({
      onBattery: false,
      known: false,
    });
  });
});

describe("parseMacOsHidIdleTimeOutput", () => {
  it("parses nanoseconds into whole seconds", () => {
    expect(
      parseMacOsHidIdleTimeOutput('| |   "HIDIdleTime" = 7349658000'),
    ).toBe(7);
  });

  it("returns null when idle time is unavailable", () => {
    expect(parseMacOsHidIdleTimeOutput("")).toBeNull();
  });
});

describe("parseMacOsSessionLockedOutput", () => {
  it("detects locked and unlocked sessions", () => {
    expect(parseMacOsSessionLockedOutput("CGSSessionScreenIsLocked = 1")).toBe(
      true,
    );
    expect(parseMacOsSessionLockedOutput("screenIsLocked = 0")).toBe(false);
  });

  it("returns null when no lock flag is present", () => {
    expect(parseMacOsSessionLockedOutput("userName = shaw")).toBeNull();
  });
});
