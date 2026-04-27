import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseArgs as parseAvdTestArgs } from "./miladyos/avd-test.mjs";
import {
  parseArgs as parseBootValidateArgs,
  resolveAdb,
} from "./miladyos/boot-validate.mjs";
import { parseArgs as parseBuildAospArgs } from "./miladyos/build-aosp.mjs";
import {
  inspectBootAnimationDir,
  parseArgs as parseBootAnimationArgs,
} from "./miladyos/build-bootanimation.mjs";
import {
  parseArgs as parseCaptureArgs,
  STEP_MAP,
} from "./miladyos/capture-screens.mjs";
import { parseArgs as parseE2eArgs } from "./miladyos/e2e-validate.mjs";
import { lintInitRc } from "./miladyos/lint-init-rc.mjs";
import { parseArgs as parseSimArgs } from "./miladyos/sim.mjs";
import {
  parseArgs as parseSyncArgs,
  syncToAosp,
} from "./miladyos/sync-to-aosp.mjs";
import { parseArgs as parseValidateArgs } from "./miladyos/validate.mjs";

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "miladyos-contract-"));
  tempDirs.push(dir);
  return dir;
}

function writeFile(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("MiladyOS script contracts", () => {
  it("keeps validation, sync, build, and boot scripts importable without side effects", () => {
    const vendorDir = path.join(makeTempDir(), "vendor", "milady");
    const apk = path.join(vendorDir, "apps", "Milady", "Milady.apk");
    const aospRoot = path.join(makeTempDir(), "aosp");

    expect(
      parseValidateArgs([
        "--vendor-dir",
        vendorDir,
        "--apk",
        apk,
        "--aosp-root",
        aospRoot,
      ]),
    ).toEqual({ vendorDir, apk, aospRoot });
    expect(parseSyncArgs(["--source-vendor", vendorDir, aospRoot])).toEqual({
      sourceVendor: vendorDir,
      aospRoot,
    });
    expect(
      parseBuildAospArgs([
        "--aosp-root",
        aospRoot,
        "--source-vendor",
        vendorDir,
        "--jobs",
        "12",
        "--launch",
        "--boot-validate",
      ]),
    ).toMatchObject({
      aospRoot,
      sourceVendor: vendorDir,
      jobs: 12,
      launch: true,
      bootValidate: true,
    });
    expect(
      parseBootValidateArgs([
        "--adb",
        "/tmp/adb",
        "--serial",
        "cvd-1",
        "--timeout-ms",
        "1000",
        "--json",
      ]),
    ).toMatchObject({
      adb: "/tmp/adb",
      serial: "cvd-1",
      timeoutMs: 1000,
      json: true,
    });
  });

  it("syncs the vendor layer into an AOSP checkout and refuses missing APKs", () => {
    const sourceVendor = path.join(makeTempDir(), "vendor", "milady");
    const aospRoot = makeTempDir();
    writeFile(path.join(aospRoot, "build", "envsetup.sh"), "# envsetup\n");
    writeFile(path.join(sourceVendor, "apps", "Milady", "Milady.apk"), "apk\n");
    writeFile(path.join(sourceVendor, ".DS_Store"), "ignored\n");

    const targetVendor = syncToAosp({ aospRoot, sourceVendor });

    expect(targetVendor).toBe(path.join(aospRoot, "vendor", "milady"));
    expect(
      fs.readFileSync(
        path.join(targetVendor, "apps", "Milady", "Milady.apk"),
        "utf8",
      ),
    ).toBe("apk\n");
    expect(fs.existsSync(path.join(targetVendor, ".DS_Store"))).toBe(false);
  });

  it("requires an explicit adb path to exist when provided", () => {
    expect(() => resolveAdb("/definitely/not/adb")).toThrow(
      /ADB does not exist/,
    );
  });

  it("rejects missing MiladyOS flag values instead of treating flags as paths", () => {
    expect(() => parseValidateArgs(["--vendor-dir"])).toThrow(
      /--vendor-dir requires a path value/,
    );
    expect(() => parseSyncArgs(["--source-vendor"])).toThrow(
      /--source-vendor requires a path value/,
    );
    expect(() => parseBuildAospArgs(["--aosp-root"])).toThrow(
      /--aosp-root requires a value/,
    );
    expect(() => parseBootValidateArgs(["--adb"])).toThrow(
      /--adb requires a value/,
    );
    expect(() => parseCaptureArgs(["--out"])).toThrow(/--out requires a value/);
    expect(() => parseE2eArgs(["--out"])).toThrow(/--out requires a value/);
    expect(() => parseAvdTestArgs(["--avd"])).toThrow(/--avd requires a value/);
  });

  it("parses capture-screens / e2e-validate / avd-test flags without side effects", () => {
    const outDir = path.join(makeTempDir(), "shots");
    expect(
      parseCaptureArgs([
        "--out",
        outDir,
        "--steps",
        "home,dialer",
        "--label",
        "smoke",
        "--no-launch",
      ]),
    ).toMatchObject({
      outDir,
      steps: ["home", "dialer"],
      label: "smoke",
      noLaunch: true,
    });

    expect(
      parseE2eArgs([
        "--out",
        outDir,
        "--skip-boot-validate",
        "--steps",
        "home",
        "--timeout-ms",
        "500",
      ]),
    ).toMatchObject({
      outDir,
      skipBootValidate: true,
      steps: ["home"],
      timeoutMs: 500,
    });

    const apk = path.join(makeTempDir(), "vendor", "milady.apk");
    fs.mkdirSync(path.dirname(apk), { recursive: true });
    fs.writeFileSync(apk, "apk\n");
    expect(
      parseAvdTestArgs([
        "--avd",
        "Pixel6_API34",
        "--apk",
        apk,
        "--capture",
        outDir,
        "--no-reuse",
      ]),
    ).toMatchObject({
      avd: "Pixel6_API34",
      apk,
      capture: outDir,
      reuse: false,
    });
  });

  it("parses sim runner flags including --wait-for-build / --stop-after", () => {
    expect(
      parseSimArgs([
        "--aosp-root",
        "/tmp/aosp",
        "--product",
        "milady_pixel_phone",
        "--variant",
        "user",
        "--out",
        "/tmp/reports",
        "--wait-for-build",
        "--stop-after",
        "--boot-timeout-ms",
        "60000",
      ]),
    ).toMatchObject({
      aospRoot: "/tmp/aosp",
      product: "milady_pixel_phone",
      variant: "user",
      outDir: "/tmp/reports",
      waitForBuild: true,
      stopAfter: true,
      bootTimeoutMs: 60_000,
    });
    expect(parseSimArgs([])).toMatchObject({
      aospRoot: path.join(os.homedir(), "aosp"),
      product: "milady_cf_x86_64_phone",
      variant: "trunk_staging-userdebug",
      noLaunch: false,
      stopAfter: false,
      waitForBuild: false,
    });
  });

  it("rejects unknown capture steps", () => {
    expect(() =>
      parseCaptureArgs(["--out", "/tmp", "--steps", "bogus"]),
    ).toThrow(/Unknown step "bogus"/);
    expect(Object.keys(STEP_MAP).sort()).toEqual(
      ["assist", "dialer", "home", "launcher", "recents", "sms"].sort(),
    );
  });

  it("lints init.rc — accepts valid script, rejects bad triggers / commands", () => {
    const dir = makeTempDir();
    const ok = path.join(dir, "ok.rc");
    fs.writeFileSync(
      ok,
      "on init\n    setprop ro.foo bar\non property:sys.boot_completed=1\n    setprop ro.x y\n",
    );
    expect(lintInitRc(ok)).toEqual([]);

    const bad = path.join(dir, "bad.rc");
    fs.writeFileSync(
      bad,
      "on bootp\n    setprop ro.x\n    bogus_cmd foo\n\nunknown_top\n    setprop ro.y z\n",
    );
    const issues = lintInitRc(bad);
    const messages = issues.map((i) => i.message);
    expect(messages.some((m) => /unknown init event "bootp"/.test(m))).toBe(
      true,
    );
    expect(
      messages.some((m) => /setprop requires <name> <value>/.test(m)),
    ).toBe(true);
    expect(
      messages.some((m) => /unknown top-level keyword "unknown_top"/.test(m)),
    ).toBe(true);
  });

  it("inspects bootanimation directories and rejects malformed input", () => {
    const framesDir = makeTempDir();
    expect(() => inspectBootAnimationDir(framesDir)).toThrow(
      /Missing desc\.txt/,
    );

    fs.writeFileSync(
      path.join(framesDir, "desc.txt"),
      "1080 2400 30\np 0 0 part0\n",
    );
    expect(() => inspectBootAnimationDir(framesDir)).not.toThrow();
    const inspection = inspectBootAnimationDir(framesDir);
    expect(inspection.parts).toEqual(["part0"]);
    expect(inspection.issues).toContain("missing part directory: part0/");

    fs.mkdirSync(path.join(framesDir, "part0"));
    const empty = inspectBootAnimationDir(framesDir);
    expect(empty.issues).toContain("part part0/ has zero PNG frames");

    expect(parseBootAnimationArgs(["--frames", framesDir, "--check"])).toEqual({
      framesDir,
      outPath: path.join(framesDir, "bootanimation.zip"),
      check: true,
    });
  });
});
