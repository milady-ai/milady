#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const PACKAGE_NAME = "com.miladyai.milady";
export const PRODUCT_NAME = "milady_cf_x86_64_phone";

const REQUIRED_ROLES = [
  "android.app.role.HOME",
  "android.app.role.DIALER",
  "android.app.role.SMS",
  "android.app.role.ASSISTANT",
];

const REQUIRED_GRANTED_PERMISSIONS = [
  "android.permission.READ_CONTACTS",
  "android.permission.WRITE_CONTACTS",
  "android.permission.CALL_PHONE",
  "android.permission.READ_PHONE_STATE",
  "android.permission.ANSWER_PHONE_CALLS",
  "android.permission.READ_CALL_LOG",
  "android.permission.WRITE_CALL_LOG",
  "android.permission.READ_SMS",
  "android.permission.SEND_SMS",
  "android.permission.RECEIVE_SMS",
  "android.permission.RECEIVE_MMS",
  "android.permission.RECEIVE_WAP_PUSH",
  "android.permission.POST_NOTIFICATIONS",
];

const FORBIDDEN_STOCK_PACKAGES = [
  "com.android.browser",
  "com.android.calendar",
  "com.android.camera2",
  "com.android.contacts",
  "com.android.deskclock",
  "com.android.dialer",
  "com.android.email",
  "com.android.gallery3d",
  "com.android.launcher3",
  "com.android.managedprovisioning",
  "com.android.messaging",
  "com.android.music",
  "com.android.provision",
  "com.google.android.apps.messaging",
  "com.google.android.apps.nexuslauncher",
  "com.google.android.dialer",
  "com.google.android.setupwizard",
  "org.lineageos.trebuchet",
];

const REQUIRED_BOOT_PROPERTIES = {
  "ro.setupwizard.mode": "DISABLED",
  // miladyos.boot_phase is intentionally non-ro so init.milady.rc can
  // re-set it at each phase. ro.* is immutable after first set.
  "miladyos.boot_phase": "completed",
};

const LOGCAT_FAILURE_PATTERNS = [
  /FATAL EXCEPTION/i,
  /SecurityException/i,
  /avc:\s+denied/i,
  /privapp-permissions/i,
  /Privileged permission.*not in privapp-permissions/i,
];

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

export function parseArgs(argv) {
  const args = {
    adb: process.env.ADB || null,
    serial: process.env.ANDROID_SERIAL || null,
    timeoutMs: 180_000,
    json: false,
    skipLogcat: false,
  };

  const readFlagValue = (flag, index) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--adb") {
      args.adb = path.resolve(readFlagValue(arg, i));
      i += 1;
    } else if (arg === "--serial" || arg === "-s") {
      args.serial = readFlagValue(arg, i);
      i += 1;
    } else if (arg === "--timeout-ms") {
      args.timeoutMs = Number.parseInt(readFlagValue(arg, i), 10);
      i += 1;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--skip-logcat") {
      args.skipLogcat = true;
    } else if (arg === "-h" || arg === "--help") {
      console.log(
        "Usage: node scripts/miladyos/boot-validate.mjs [--adb <ADB>] [--serial <SERIAL>] [--timeout-ms <MS>] [--json] [--skip-logcat]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive integer");
  }

  return args;
}

export function resolveAdb(explicitAdb = null) {
  if (explicitAdb) {
    if (!fs.existsSync(explicitAdb)) {
      throw new Error(`ADB does not exist: ${explicitAdb}`);
    }
    return explicitAdb;
  }

  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), "Library", "Android", "sdk"),
    path.join(os.homedir(), "Android", "Sdk"),
  ].filter(Boolean);

  for (const sdkRoot of sdkRoots) {
    const candidate = path.join(sdkRoot, "platform-tools", "adb");
    if (fs.existsSync(candidate)) return candidate;
  }

  const result = spawnSync("adb", ["version"], {
    encoding: "utf8",
    stdio: "ignore",
  });
  if (!result.error) return "adb";

  throw new Error(
    "Could not find adb. Set --adb, ADB, ANDROID_HOME, or ANDROID_SDK_ROOT.",
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`${command} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

function adbArgs(serial, args) {
  return serial ? ["-s", serial, ...args] : args;
}

function runAdb(adb, serial, args) {
  return run(adb, adbArgs(serial, args));
}

function shell(adb, serial, command) {
  return runAdb(adb, serial, ["shell", command]);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBoot({ adb, serial, timeoutMs }) {
  runAdb(adb, serial, ["wait-for-device"]);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const completed = shell(adb, serial, "getprop sys.boot_completed").trim();
    if (completed === "1") {
      shell(adb, serial, "wm dismiss-keyguard");
      return;
    }
    await sleep(1_000);
  }
  throw new Error(
    `Device did not report sys.boot_completed=1 within ${timeoutMs}ms`,
  );
}

function assertIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label} does not include ${needle}`);
  }
}

function assertMatches(value, pattern, label) {
  if (!pattern.test(value)) {
    throw new Error(`${label} did not match ${pattern}`);
  }
}

function validateProductProperty(adb, serial) {
  const product = shell(adb, serial, "getprop ro.miladyos.product");
  if (product !== PRODUCT_NAME) {
    throw new Error(
      `ro.miladyos.product must be ${PRODUCT_NAME}; found ${product || "<empty>"}`,
    );
  }
  return product;
}

function validateBootProperties(adb, serial) {
  const properties = {};
  for (const [name, expected] of Object.entries(REQUIRED_BOOT_PROPERTIES)) {
    const actual = shell(adb, serial, `getprop ${name}`).trim();
    if (actual !== expected) {
      throw new Error(
        `${name} must be ${expected}; found ${actual || "<empty>"}`,
      );
    }
    properties[name] = actual;
  }
  return properties;
}

function validatePackagePath(adb, serial) {
  const pmPath = shell(adb, serial, `pm path ${PACKAGE_NAME}`);
  assertIncludes(pmPath, "/system/priv-app/Milady/", "Milady package path");
  return pmPath;
}

function validateHomeResolution(adb, serial) {
  const resolved = shell(
    adb,
    serial,
    "cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME",
  );
  assertIncludes(resolved, PACKAGE_NAME, "HOME activity resolution");
  return resolved;
}

/**
 * For every system intent whose default app we stripped from
 * PRODUCT_PACKAGES, prove a Milady activity is the resolver. Without
 * these assertions a stripped phone could pass HOME/Dialer/SMS role
 * validation while silently failing to open URLs / set alarms / take
 * photos — exactly the regression class this list catches.
 */
const REPLACEMENT_INTENT_RESOLUTIONS = [
  {
    label: "VIEW http",
    args: '-a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "http://example.com"',
  },
  {
    label: "VIEW https",
    args: '-a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://example.com"',
  },
  {
    label: "STILL_IMAGE_CAMERA",
    args: "-a android.media.action.STILL_IMAGE_CAMERA",
  },
  {
    label: "IMAGE_CAPTURE",
    args: "-a android.media.action.IMAGE_CAPTURE",
  },
  {
    label: "SET_ALARM",
    args: "-a android.intent.action.SET_ALARM",
  },
  {
    label: "SHOW_ALARMS",
    args: "-a android.intent.action.SHOW_ALARMS",
  },
  {
    label: "APP_CONTACTS launcher",
    args: "-a android.intent.action.MAIN -c android.intent.category.APP_CONTACTS",
  },
  {
    label: "APP_CALENDAR launcher",
    args: "-a android.intent.action.MAIN -c android.intent.category.APP_CALENDAR",
  },
];

function validateReplacementIntents(adb, serial) {
  const resolutions = {};
  for (const { label, args } of REPLACEMENT_INTENT_RESOLUTIONS) {
    const resolved = shell(
      adb,
      serial,
      `cmd package resolve-activity --brief ${args}`,
    );
    if (!resolved.includes(PACKAGE_NAME)) {
      throw new Error(
        `Intent "${label}" did not resolve to ${PACKAGE_NAME}; got:\n${resolved}`,
      );
    }
    resolutions[label] = resolved;
  }
  return resolutions;
}

function validateRoles(adb, serial) {
  const roles = {};
  for (const role of REQUIRED_ROLES) {
    const holders = shell(adb, serial, `cmd role get-role-holders ${role}`);
    assertIncludes(holders, PACKAGE_NAME, `${role} holder list`);
    roles[role] = holders;
  }
  return roles;
}

function validatePackageFlagsAndPermissions(adb, serial) {
  const dump = shell(adb, serial, `dumpsys package ${PACKAGE_NAME}`);
  assertMatches(dump, /pkgFlags=\[[^\]]*\bSYSTEM\b/i, "Milady package flags");
  assertMatches(
    dump,
    /privateFlags=\[[^\]]*\bPRIVILEGED\b/i,
    "Milady private flags",
  );
  for (const permission of REQUIRED_GRANTED_PERMISSIONS) {
    assertMatches(
      dump,
      new RegExp(
        `${permission.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*granted=true`,
        "i",
      ),
      `${permission} grant`,
    );
  }
  return dump;
}

function validateAppOps(adb, serial) {
  const usageStats = shell(
    adb,
    serial,
    `cmd appops get ${PACKAGE_NAME} GET_USAGE_STATS`,
  );
  assertMatches(usageStats, /\ballow\b/i, "GET_USAGE_STATS appop");
  return { GET_USAGE_STATS: usageStats };
}

function validateForbiddenPackages(adb, serial) {
  const packages = shell(adb, serial, "pm list packages");
  const installedForbidden = FORBIDDEN_STOCK_PACKAGES.filter((pkg) =>
    packages.includes(`package:${pkg}`),
  );
  if (installedForbidden.length > 0) {
    throw new Error(
      `Forbidden stock packages are installed: ${installedForbidden.join(", ")}`,
    );
  }
  return installedForbidden;
}

function validateLogcat(adb, serial) {
  const logcat = runAdb(adb, serial, ["logcat", "-d", "-v", "brief"]);
  const failures = LOGCAT_FAILURE_PATTERNS.flatMap((pattern) =>
    logcat
      .split(/\r?\n/)
      .filter((line) => pattern.test(line))
      .slice(0, 20),
  );
  if (failures.length > 0) {
    throw new Error(
      `Boot log contains failure markers:\n${failures.join("\n")}`,
    );
  }
  return "clean";
}

export async function validateBootedDevice(options) {
  const adb = resolveAdb(options.adb);
  const serial = options.serial || null;

  await waitForBoot({ adb, serial, timeoutMs: options.timeoutMs });

  const result = {
    adb,
    serial,
    product: validateProductProperty(adb, serial),
    bootProperties: validateBootProperties(adb, serial),
    packagePath: validatePackagePath(adb, serial),
    homeResolution: validateHomeResolution(adb, serial),
    replacementIntents: validateReplacementIntents(adb, serial),
    roles: validateRoles(adb, serial),
    appOps: validateAppOps(adb, serial),
    forbiddenPackages: validateForbiddenPackages(adb, serial),
    logcat: options.skipLogcat ? "skipped" : validateLogcat(adb, serial),
  };

  validatePackageFlagsAndPermissions(adb, serial);
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = await validateBootedDevice(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      "[miladyos:boot-validate] Booted MiladyOS device checks passed.",
    );
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  await main();
}
