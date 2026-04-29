#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { lintInitRc } from "./lint-init-rc.mjs";

const PACKAGE_NAME = "com.miladyai.milady";
const APP_NAME = "Milady";
const PRODUCT_NAME = "milady_cf_x86_64_phone";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const defaultVendorDir = path.join(
  repoRoot,
  "os",
  "android",
  "vendor",
  "milady",
);

const defaultGrantPermissions = [
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

const requiredApkPermissions = [
  ...defaultGrantPermissions,
  "android.permission.MANAGE_OWN_CALLS",
  "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.PACKAGE_USAGE_STATS",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.MANAGE_APP_OPS_MODES",
];

const privilegedPermissions = [
  "android.permission.PACKAGE_USAGE_STATS",
  "android.permission.MANAGE_APP_OPS_MODES",
];

export function parseArgs(argv) {
  const args = {
    aospRoot: null,
    apk: null,
    vendorDir: defaultVendorDir,
  };
  const readFlagValue = (flag, index) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a path value`);
    }
    return path.resolve(value);
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--aosp-root") {
      args.aospRoot = readFlagValue(arg, i);
      i += 1;
    } else if (arg === "--apk") {
      args.apk = readFlagValue(arg, i);
      i += 1;
    } else if (arg === "--vendor-dir") {
      args.vendorDir = readFlagValue(arg, i);
      i += 1;
    } else if (arg === "-h" || arg === "--help") {
      console.log(
        "Usage: bun run miladyos:validate [--apk <APK>] [--vendor-dir <VENDOR_DIR>] [--aosp-root <AOSP_ROOT>]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  args.apk ??= path.join(args.vendorDir, "apps", "Milady", "Milady.apk");
  return args;
}

function fail(message) {
  throw new Error(`[miladyos:validate] ${message}`);
}

function assertFile(filePath, label = filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing ${label}: ${filePath}`);
  }
}

function read(filePath) {
  assertFile(filePath);
  return fs.readFileSync(filePath, "utf8");
}

function assertIncludes(content, needle, label) {
  if (!content.includes(needle)) {
    fail(`${label} is missing ${needle}`);
  }
}

function assertMatches(content, pattern, label, description) {
  if (!pattern.test(content)) {
    fail(`${label} is missing ${description}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertCountAtLeast(content, needle, expectedCount, label) {
  const count = content.split(needle).length - 1;
  if (count < expectedCount) {
    fail(
      `${label} needs at least ${expectedCount} occurrence(s) of ${needle}; found ${count}`,
    );
  }
}

function xmlStringValue(xml, name, label) {
  const match = xml.match(
    new RegExp(
      `<string\\b(?=[^>]*\\bname="${escapeRegExp(name)}")[^>]*>([^<]*)<\\/string>`,
    ),
  );
  if (!match) {
    fail(`${label} is missing string resource ${name}`);
  }
  return match[1].trim();
}

function xmlElementBlockByName(xml, tagName, name, label) {
  const match = xml.match(
    new RegExp(
      `<${tagName}\\b(?=[^>]*\\bname="${escapeRegExp(name)}")[\\s\\S]*?<\\/${tagName}>`,
    ),
  );
  if (!match) {
    fail(`${label} is missing ${tagName} ${name}`);
  }
  return match[0];
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) {
    fail(`${command} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(
      `${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}

function commandExists(command) {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    stdio: "ignore",
  });
  return !result.error;
}

function findFiles(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findFiles(fullPath, predicate, out);
    } else if (predicate(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

function compareVersions(a, b) {
  const aa = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const bb = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i += 1) {
    const delta = (aa[i] ?? 0) - (bb[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function resolveAapt() {
  const explicit = process.env.AAPT;
  if (explicit && fs.existsSync(explicit)) return explicit;

  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), "Library", "Android", "sdk"),
    path.join(os.homedir(), "Android", "Sdk"),
  ].filter(Boolean);

  for (const sdkRoot of sdkRoots) {
    const buildTools = path.join(sdkRoot, "build-tools");
    if (!fs.existsSync(buildTools)) continue;
    const versions = fs.readdirSync(buildTools).sort(compareVersions).reverse();
    for (const version of versions) {
      const candidate = path.join(buildTools, version, "aapt");
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  fail("Could not find aapt. Set AAPT or ANDROID_HOME/ANDROID_SDK_ROOT.");
}

export function validateXmlFiles(vendorDir) {
  const xmlFiles = findFiles(vendorDir, (file) => file.endsWith(".xml"));
  if (xmlFiles.length === 0) fail("No XML files found under vendor/milady");
  if (!commandExists("xmllint")) {
    fail(
      "xmllint is required for XML parser validation. Install libxml2 or set PATH to xmllint.",
    );
  }
  run("xmllint", ["--noout", ...xmlFiles]);
  console.log(
    `[miladyos:validate] XML parse check passed for ${xmlFiles.length} file(s).`,
  );
}

export function validateProductLayer(vendorDir) {
  const product = read(path.join(vendorDir, "products", `${PRODUCT_NAME}.mk`));
  assertIncludes(
    product,
    "device/google/cuttlefish/vsoc_x86_64_only/phone/aosp_cf.mk",
    "product",
  );
  assertIncludes(
    product,
    "vendor/milady/milady_common.mk",
    "product (must inherit milady_common.mk for shared OS-path invariants)",
  );
  assertIncludes(product, "MILADY_PRODUCT_TAG", "product");

  const common = read(path.join(vendorDir, "milady_common.mk"));
  assertIncludes(common, "PRODUCT_PACKAGES +=", "milady_common.mk");
  assertIncludes(common, "PRODUCT_PACKAGES -=", "milady_common.mk");
  assertIncludes(common, "Milady", "milady_common.mk");
  assertIncludes(
    common,
    "default-permissions-com.miladyai.milady.xml",
    "milady_common.mk",
  );
  assertIncludes(
    common,
    "privapp-permissions-com.miladyai.milady.xml",
    "milady_common.mk",
  );
  // PRODUCT_PACKAGE_OVERLAYS root must mirror the AOSP source tree from
  // there: e.g. <root>/frameworks/base/core/res/res/values/config.xml
  // overlays the framework-res package's config_default* strings. The
  // older path "vendor/milady/overlays/framework-res" never merged
  // because Soong looks under the overlay root for `LOCAL_RESOURCE_DIR`
  // (frameworks/base/core/res/res), not for a directory called
  // "framework-res".
  assertIncludes(common, "vendor/milady/overlays", "milady_common.mk");
  assertFile(
    path.join(
      vendorDir,
      "overlays",
      "frameworks",
      "base",
      "core",
      "res",
      "res",
      "values",
      "config.xml",
    ),
    "framework-res overlay (must mirror frameworks/base/core/res/res/...)",
  );
  // Ensure no first-boot UX leaks through.
  for (const marker of ["Provision", "SetupWizard", "ManagedProvisioning"]) {
    assertIncludes(
      common,
      marker,
      "milady_common.mk PRODUCT_PACKAGES -= strip list",
    );
  }
  assertIncludes(common, "ro.setupwizard.mode=DISABLED", "milady_common.mk");
  // Boot-time scaffolds.
  assertIncludes(
    common,
    "init.milady.rc",
    "milady_common.mk PRODUCT_COPY_FILES",
  );
  assertIncludes(common, "BOARD_VENDOR_SEPOLICY_DIRS", "milady_common.mk");
  assertIncludes(common, "vendor/milady/sepolicy", "milady_common.mk");
  if (common.includes("PermissionController")) {
    fail(
      "milady_common.mk still references a PermissionController overlay; role defaults live in framework-res strings.",
    );
  }

  // Per-Pixel templates exist and follow the same MILADY_PIXEL_CODENAME contract.
  const pixelTemplate = read(
    path.join(vendorDir, "products", "milady_pixel_phone.mk"),
  );
  assertIncludes(
    pixelTemplate,
    "MILADY_PIXEL_CODENAME",
    "milady_pixel_phone.mk",
  );
  assertIncludes(
    pixelTemplate,
    "vendor/milady/milady_common.mk",
    "milady_pixel_phone.mk",
  );

  const androidProducts = read(path.join(vendorDir, "AndroidProducts.mk"));
  assertMatches(
    androidProducts,
    new RegExp(`\\$\\(LOCAL_DIR\\)/products/${PRODUCT_NAME}\\.mk`),
    "AndroidProducts.mk",
    `PRODUCT_MAKEFILES entry for ${PRODUCT_NAME}`,
  );
  assertMatches(
    androidProducts,
    new RegExp(`${PRODUCT_NAME}-trunk_staging-userdebug`),
    "AndroidProducts.mk",
    `${PRODUCT_NAME}-trunk_staging-userdebug lunch choice`,
  );

  // Init script + sepolicy scaffold present.
  assertFile(
    path.join(vendorDir, "init", "init.milady.rc"),
    "vendor/milady init script",
  );
  assertFile(
    path.join(vendorDir, "sepolicy", "file_contexts"),
    "vendor/milady sepolicy file_contexts",
  );

  // Lint the init script syntactically — typos here only show up at
  // boot otherwise.
  const initIssues = lintInitRc(path.join(vendorDir, "init", "init.milady.rc"));
  const initErrors = initIssues.filter((i) => !i.soft);
  if (initErrors.length > 0) {
    fail(
      `init.milady.rc has lint errors:\n - ${initErrors
        .map((i) => `line ${i.line}: ${i.message}`)
        .join("\n - ")}`,
    );
  }

  const androidBp = read(path.join(vendorDir, "apps", "Milady", "Android.bp"));
  for (const marker of [
    "android_app_import",
    'name: "Milady"',
    'apk: "Milady.apk"',
    "privileged: true",
    'certificate: "platform"',
    '"Launcher3"',
    '"Launcher3QuickStep"',
    '"Dialer"',
    // Both "messaging" (lowercase, the actual Soong module name from
    // packages/apps/Messaging/Android.bp) and "Messaging" (legacy
    // / lineage variants) — the lowercase one is the load-bearing
    // entry; the capital is kept for non-AOSP forks that diverge.
    '"messaging"',
    '"Messaging"',
    '"Contacts"',
    '"Trebuchet"',
  ]) {
    assertIncludes(androidBp, marker, "Milady Android.bp");
  }

  const frameworkConfig = read(
    path.join(
      vendorDir,
      "overlays",
      "frameworks",
      "base",
      "core",
      "res",
      "res",
      "values",
      "config.xml",
    ),
  );
  for (const resourceName of [
    "config_defaultDialer",
    "config_defaultSms",
    "config_defaultAssistant",
    "config_defaultBrowser",
  ]) {
    const value = xmlStringValue(
      frameworkConfig,
      resourceName,
      "framework-res overlay",
    );
    if (value !== PACKAGE_NAME) {
      fail(
        `framework-res overlay ${resourceName} must be ${PACKAGE_NAME}; found ${value || "<empty>"}`,
      );
    }
  }

  const obsoleteRoleFiles = findFiles(vendorDir, (file) =>
    file.endsWith(".xml"),
  ).filter((file) => /config_default.*RoleHolders/.test(read(file)));
  if (obsoleteRoleFiles.length > 0) {
    fail(
      `Obsolete PermissionController role-holder resources found: ${obsoleteRoleFiles.join(", ")}`,
    );
  }

  console.log("[miladyos:validate] Product layer checks passed.");
}

export function validateDefaultPermissions(vendorDir) {
  const defaultPermissions = read(
    path.join(
      vendorDir,
      "permissions",
      `default-permissions-${PACKAGE_NAME}.xml`,
    ),
  );
  assertIncludes(
    defaultPermissions,
    `<exception package="${PACKAGE_NAME}">`,
    "default permissions",
  );
  for (const permission of defaultGrantPermissions) {
    assertIncludes(
      defaultPermissions,
      `name="${permission}"`,
      "default permissions",
    );
  }

  const privPermissions = read(
    path.join(
      vendorDir,
      "permissions",
      `privapp-permissions-${PACKAGE_NAME}.xml`,
    ),
  );
  assertIncludes(
    privPermissions,
    `<privapp-permissions package="${PACKAGE_NAME}"`,
    "privapp permissions",
  );
  for (const permission of privilegedPermissions) {
    assertIncludes(
      privPermissions,
      `name="${permission}"`,
      "privapp permissions",
    );
  }

  // The product makefile lists these XMLs by module name in PRODUCT_PACKAGES.
  // Soong needs prebuilt_etc{} declarations or `m` exits with "module not defined".
  const permissionsBp = read(path.join(vendorDir, "permissions", "Android.bp"));
  for (const moduleName of [
    `default-permissions-${PACKAGE_NAME}.xml`,
    `privapp-permissions-${PACKAGE_NAME}.xml`,
  ]) {
    assertIncludes(
      permissionsBp,
      `name: "${moduleName}"`,
      "permissions/Android.bp",
    );
  }
  assertIncludes(
    permissionsBp,
    'sub_dir: "default-permissions"',
    "permissions/Android.bp",
  );
  assertIncludes(
    permissionsBp,
    'sub_dir: "permissions"',
    "permissions/Android.bp",
  );

  console.log("[miladyos:validate] Permission XML checks passed.");
}

/**
 * Vendor sepolicy files exist on the AOSP build path (`BOARD_VENDOR_
 * SEPOLICY_DIRS += vendor/milady/sepolicy`). For the local-agent-on-
 * Android landing we currently rely on the on-device agent running in
 * the platform_app domain (assigned to the Milady APK by AOSP's seapp_
 * contexts because the APK is platform-signed). A custom `milady_agent`
 * domain was attempted but tripped AOSP's neverallow envelope
 * (platform_app cannot transition to arbitrary domains, app domains
 * cannot have file_contexts targeting /data/data paths, etc.) —
 * landing the full domain transition requires a custom seinfo entry
 * tied to a different signing certificate.
 *
 * The validator pins:
 *   - file_contexts exists (BOARD_VENDOR_SEPOLICY_DIRS chokes if the
 *     listed dir has no policy files at all)
 *   - the primary `allow platform_app app_data_file:file { execute
 *     execute_no_trans };` rule that lets bun start
 *   - milady_agent_exec and milady_agent_data type declarations so a
 *     future custom-seinfo build can land its restorecon hooks
 *     without a churn rename
 *   - the documented-intent seccomp syscall list, so the runtime
 *     mitigation in MiladyAgentService.startAgentProcess()
 *     (BUN_FEATURE_FLAG_*) cannot drift away from the .te comment
 *     block silently
 *
 * SELinux cannot relax seccomp filters — those are installed at
 * zygote fork via `prctl(PR_SET_NO_NEW_PRIVS, 1)` from the per-arch
 * allowlists in `bionic/libc/seccomp/{x86_64,arm64}_app_policy.cpp`.
 * The bun feature flags are the runtime workaround; the .te comment
 * block is the audit trail; the second-line "kernel exemption" path
 * (which the spec asked about) lives in bionic itself, not here.
 *
 * See os/android/vendor/milady/sepolicy/README.md for the design.
 */
export function validateSepolicy(vendorDir) {
  // file_contexts must exist for `BOARD_VENDOR_SEPOLICY_DIRS` to point at
  // a non-empty directory; AOSP's sepolicy build chokes if the listed
  // dir has no policy files at all. An empty file is fine.
  const fileContextsPath = path.join(vendorDir, "sepolicy", "file_contexts");
  assertFile(fileContextsPath, "vendor/milady sepolicy/file_contexts");
  const fileContexts = read(fileContextsPath);
  // file_contexts entries are advisory until a custom-seinfo build
  // re-introduces the domain transition, but the patterns must be
  // present so MiladyAgentService.relabelAgentTree()'s restorecon
  // call has labels to apply.
  assertMatches(
    fileContexts,
    /\/data\/data\/com\\\.miladyai\\\.milady\/files\/agent\/x86_64.*milady_agent_exec/,
    "vendor/milady sepolicy/file_contexts",
    "x86_64 binary tree label entry",
  );
  assertMatches(
    fileContexts,
    /\/data\/data\/com\\\.miladyai\\\.milady\/files\/agent\/arm64-v8a.*milady_agent_exec/,
    "vendor/milady sepolicy/file_contexts",
    "arm64-v8a binary tree label entry",
  );
  assertMatches(
    fileContexts,
    /\/data\/data\/com\\\.miladyai\\\.milady\/files\/agent.*milady_agent_data/,
    "vendor/milady sepolicy/file_contexts",
    "agent state dir label entry",
  );

  // The agent runs as platform_app and must be able to execve the bundled
  // bun runtime out of /data/data/<pkg>/files/agent/. AOSP's stock
  // platform_app.te has no such allow rule (only priv_app does), so we
  // add it here.
  const tePath = path.join(vendorDir, "sepolicy", "milady_agent.te");
  assertFile(tePath, "vendor/milady sepolicy/milady_agent.te");
  const te = read(tePath);
  assertMatches(
    te,
    /allow\s+platform_app\s+app_data_file\s*:\s*file\b[^;]*\bexecute_no_trans\b[^;]*;/,
    "milady_agent.te",
    "allow platform_app app_data_file:file { execute execute_no_trans } (on-device agent exec)",
  );

  // Type declarations land the future-proofing seam. The custom
  // domain itself is not declared (it tripped neverallow checks
  // without a custom seinfo entry), but the file types are needed
  // by file_contexts and a future restorecon path.
  for (const typeName of ["milady_agent_exec", "milady_agent_data"]) {
    assertMatches(
      te,
      new RegExp(`\\btype\\s+${typeName}\\b`),
      "milady_agent.te",
      `type declaration for ${typeName}`,
    );
  }

  // The .te file documents the seccomp-blocked syscall list as a
  // comment block. MiladyAgentService.startAgentProcess() must
  // export the matching BUN_FEATURE_FLAG_* env vars at runtime.
  // Pin both ends so the docs and the mitigation can't drift.
  const documentedSyscalls = [
    "io_uring_setup",
    "io_uring_enter",
    "io_uring_register",
    "pidfd_open",
    "pidfd_send_signal",
    "pidfd_getfd",
    "clone3",
    "preadv2",
    "pwritev2",
  ];
  for (const syscall of documentedSyscalls) {
    assertIncludes(
      te,
      syscall,
      "milady_agent.te (seccomp documented-intent block)",
    );
  }

  validateBunFeatureFlagsParity(te);

  console.log("[miladyos:validate] Sepolicy checks passed.");
}

/**
 * Pin the BUN_FEATURE_FLAG_* names that show up in the .te comment
 * block to the names MiladyAgentService.startAgentProcess() actually
 * exports. The Java service is the runtime mitigation; the comment
 * block is the audit trail; if the two drift a future bun upgrade
 * could quietly re-introduce a SIGSYS without anyone noticing.
 *
 * MiladyAgentService.java lives in two places:
 *   - apps/app/android/app/src/main/java/com/miladyai/milady/ (parent
 *     repo, generated by run-mobile-build.mjs / overlayAndroid())
 *   - eliza/packages/app-core/platforms/android/app/src/main/java/
 *     ai/elizaos/app/ (eliza submodule, source of truth for the
 *     overlay)
 *
 * We check whichever is on disk; on a fresh checkout only the eliza
 * submodule path is guaranteed.
 */
function validateBunFeatureFlagsParity(teContent) {
  const expected = [
    "BUN_FEATURE_FLAG_DISABLE_IO_POOL",
    "BUN_FEATURE_FLAG_FORCE_WAITER_THREAD",
    "BUN_FEATURE_FLAG_DISABLE_RWF_NONBLOCK",
    "BUN_FEATURE_FLAG_DISABLE_SPAWNSYNC_FAST_PATH",
  ];
  for (const flag of expected) {
    if (!teContent.includes(flag)) {
      fail(
        `milady_agent.te seccomp comment block is missing documented flag ${flag}`,
      );
    }
  }

  const candidatePaths = [
    path.join(
      repoRoot,
      "apps",
      "app",
      "android",
      "app",
      "src",
      "main",
      "java",
      "com",
      "miladyai",
      "milady",
      "MiladyAgentService.java",
    ),
    path.join(
      repoRoot,
      "eliza",
      "packages",
      "app-core",
      "platforms",
      "android",
      "app",
      "src",
      "main",
      "java",
      "ai",
      "elizaos",
      "app",
      "MiladyAgentService.java",
    ),
  ];
  const javaPath = candidatePaths.find((p) => fs.existsSync(p));
  if (!javaPath) {
    // First-checkout state where neither overlay has been generated
    // yet. The .te comment block is still pinned above; runtime
    // parity gets re-checked on the next build that produces a Java
    // file on disk.
    console.log(
      "[miladyos:validate] Skipping BUN_FEATURE_FLAG_* runtime parity check — no MiladyAgentService.java on disk yet.",
    );
    return;
  }
  const java = fs.readFileSync(javaPath, "utf8");
  for (const flag of expected) {
    if (!java.includes(flag)) {
      fail(
        `MiladyAgentService.java (${javaPath}) is missing seccomp mitigation flag ${flag}; documented in milady_agent.te but not exported at runtime`,
      );
    }
  }
}

function manifestElementBlocks(manifest, elementName) {
  const blocks = [];
  const lines = manifest.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const start = lines[i].match(new RegExp(`^(\\s*)E: ${elementName}\\b`));
    if (!start) continue;
    const indent = start[1].length;
    const block = [lines[i]];
    for (let j = i + 1; j < lines.length; j += 1) {
      const nextElement = lines[j].match(/^(\s*)E: /);
      if (nextElement && nextElement[1].length <= indent) break;
      block.push(lines[j]);
    }
    blocks.push(block.join("\n"));
  }
  return blocks;
}

function manifestComponentBlock(manifest, elementName, componentName) {
  const block = manifestElementBlocks(manifest, elementName).find((candidate) =>
    candidate.includes(`"${componentName}"`),
  );
  if (!block) {
    fail(`APK manifest is missing ${elementName} ${componentName}`);
  }
  return block;
}

function assertManifestBlockIncludes(block, needle, label) {
  assertIncludes(block, needle, `APK manifest ${label}`);
}

function validateApkManifest(manifest) {
  const mainActivity = manifestComponentBlock(
    manifest,
    "activity",
    `${PACKAGE_NAME}.MainActivity`,
  );
  assertManifestBlockIncludes(
    mainActivity,
    "android.intent.action.MAIN",
    "MainActivity",
  );
  assertManifestBlockIncludes(
    mainActivity,
    "android.intent.category.HOME",
    "MainActivity",
  );
  assertManifestBlockIncludes(
    mainActivity,
    "android.intent.category.DEFAULT",
    "MainActivity",
  );

  const dialActivity = manifestComponentBlock(
    manifest,
    "activity",
    `${PACKAGE_NAME}.MiladyDialActivity`,
  );
  assertCountAtLeast(
    dialActivity,
    "android.intent.action.DIAL",
    2,
    "APK manifest MiladyDialActivity",
  );
  assertManifestBlockIncludes(
    dialActivity,
    "android.intent.category.DEFAULT",
    "MiladyDialActivity",
  );
  assertManifestBlockIncludes(
    dialActivity,
    'android:scheme(0x01010027)="tel"',
    "MiladyDialActivity",
  );

  const assistActivity = manifestComponentBlock(
    manifest,
    "activity",
    `${PACKAGE_NAME}.MiladyAssistActivity`,
  );
  assertManifestBlockIncludes(
    assistActivity,
    "android.intent.action.ASSIST",
    "MiladyAssistActivity",
  );
  assertManifestBlockIncludes(
    assistActivity,
    "android.intent.category.DEFAULT",
    "MiladyAssistActivity",
  );

  const inCallService = manifestComponentBlock(
    manifest,
    "service",
    `${PACKAGE_NAME}.MiladyInCallService`,
  );
  assertManifestBlockIncludes(
    inCallService,
    "android.permission.BIND_INCALL_SERVICE",
    "MiladyInCallService",
  );
  assertManifestBlockIncludes(
    inCallService,
    "android.telecom.InCallService",
    "MiladyInCallService",
  );
  assertManifestBlockIncludes(
    inCallService,
    "android.telecom.IN_CALL_SERVICE_UI",
    "MiladyInCallService",
  );

  const smsReceiver = manifestComponentBlock(
    manifest,
    "receiver",
    `${PACKAGE_NAME}.MiladySmsReceiver`,
  );
  assertManifestBlockIncludes(
    smsReceiver,
    "android.permission.BROADCAST_SMS",
    "MiladySmsReceiver",
  );
  assertManifestBlockIncludes(
    smsReceiver,
    "android.provider.Telephony.SMS_DELIVER",
    "MiladySmsReceiver",
  );

  const mmsReceiver = manifestComponentBlock(
    manifest,
    "receiver",
    `${PACKAGE_NAME}.MiladyMmsReceiver`,
  );
  assertManifestBlockIncludes(
    mmsReceiver,
    "android.permission.BROADCAST_WAP_PUSH",
    "MiladyMmsReceiver",
  );
  assertManifestBlockIncludes(
    mmsReceiver,
    "android.provider.Telephony.WAP_PUSH_DELIVER",
    "MiladyMmsReceiver",
  );
  assertManifestBlockIncludes(
    mmsReceiver,
    "application/vnd.wap.mms-message",
    "MiladyMmsReceiver",
  );

  const respondService = manifestComponentBlock(
    manifest,
    "service",
    `${PACKAGE_NAME}.MiladyRespondViaMessageService`,
  );
  assertManifestBlockIncludes(
    respondService,
    "android.permission.SEND_RESPOND_VIA_MESSAGE",
    "MiladyRespondViaMessageService",
  );
  assertManifestBlockIncludes(
    respondService,
    "android.intent.action.RESPOND_VIA_MESSAGE",
    "MiladyRespondViaMessageService",
  );
  assertManifestBlockIncludes(
    respondService,
    'android:scheme(0x01010027)="smsto"',
    "MiladyRespondViaMessageService",
  );

  const composeActivity = manifestComponentBlock(
    manifest,
    "activity",
    `${PACKAGE_NAME}.MiladySmsComposeActivity`,
  );
  assertManifestBlockIncludes(
    composeActivity,
    "android.intent.action.SENDTO",
    "MiladySmsComposeActivity",
  );
  assertManifestBlockIncludes(
    composeActivity,
    'android:scheme(0x01010027)="smsto"',
    "MiladySmsComposeActivity",
  );

  const bootReceiver = manifestComponentBlock(
    manifest,
    "receiver",
    `${PACKAGE_NAME}.MiladyBootReceiver`,
  );
  assertManifestBlockIncludes(
    bootReceiver,
    "android.intent.action.LOCKED_BOOT_COMPLETED",
    "MiladyBootReceiver",
  );
  assertManifestBlockIncludes(
    bootReceiver,
    "android.intent.action.BOOT_COMPLETED",
    "MiladyBootReceiver",
  );

  // Replacement activities for the role apps stripped from PRODUCT_PACKAGES.
  // Without these, the system has no resolver for the corresponding intents
  // and a stripped phone is a broken phone — http URLs can't open, alarms
  // can't be set, etc.

  // Replacement activities for stripped role apps (Browser2, Contacts,
  // Camera2, DeskClock, Calendar). These soft-warn instead of failing
  // because the activity Java sources land in the eliza submodule and a
  // staged APK built before they were added is still a valid OS-path
  // image — just one with intent-resolution gaps for the corresponding
  // system intents.
  const REPLACEMENT_ACTIVITIES = [
    {
      name: "MiladyBrowserActivity",
      markers: [
        "android.intent.action.VIEW",
        "android.intent.category.BROWSABLE",
        'android:scheme(0x01010027)="http"',
        'android:scheme(0x01010027)="https"',
      ],
    },
    {
      name: "MiladyContactsActivity",
      markers: ["android.intent.category.APP_CONTACTS"],
    },
    {
      name: "MiladyCameraActivity",
      markers: [
        "android.media.action.STILL_IMAGE_CAMERA",
        "android.media.action.IMAGE_CAPTURE",
      ],
    },
    {
      name: "MiladyClockActivity",
      markers: [
        "android.intent.action.SET_ALARM",
        "android.intent.action.SHOW_ALARMS",
      ],
    },
    {
      name: "MiladyCalendarActivity",
      markers: ["android.intent.category.APP_CALENDAR"],
    },
  ];

  const replacementWarnings = [];
  for (const { name, markers } of REPLACEMENT_ACTIVITIES) {
    const blocks = manifestElementBlocks(manifest, "activity").filter((b) =>
      b.includes(`"${PACKAGE_NAME}.${name}"`),
    );
    if (blocks.length === 0) {
      replacementWarnings.push(
        `[soft] APK manifest is missing activity ${PACKAGE_NAME}.${name} — system intent will have no resolver after stripping the corresponding AOSP app.`,
      );
      continue;
    }
    const block = blocks[0];
    for (const marker of markers) {
      if (!block.includes(marker)) {
        replacementWarnings.push(
          `[soft] APK manifest ${name} is missing ${marker}`,
        );
      }
    }
  }
  if (replacementWarnings.length > 0) {
    console.warn(
      `[miladyos:validate] Soft warnings (rebuild APK to clear):\n - ${replacementWarnings.join("\n - ")}`,
    );
  }
}

export function validateApk(apkPath) {
  assertFile(apkPath, "Milady APK");
  const aapt = resolveAapt();
  const badging = run(aapt, ["dump", "badging", apkPath]);
  assertIncludes(badging, `package: name='${PACKAGE_NAME}'`, "APK badging");
  assertIncludes(badging, `application-label:'${APP_NAME}'`, "APK badging");
  for (const permission of requiredApkPermissions) {
    assertIncludes(
      badging,
      `uses-permission: name='${permission}'`,
      "APK badging",
    );
  }

  const manifest = run(aapt, [
    "dump",
    "xmltree",
    apkPath,
    "AndroidManifest.xml",
  ]);
  validateApkManifest(manifest);
  console.log(`[miladyos:validate] APK checks passed with ${aapt}.`);
}

export function validateAospRoot(aospRoot) {
  const buildEnvsetup = path.join(aospRoot, "build", "envsetup.sh");
  assertFile(buildEnvsetup, "AOSP build/envsetup.sh");

  const rolesXml = read(
    path.join(
      aospRoot,
      "packages",
      "modules",
      "Permission",
      "PermissionController",
      "res",
      "xml",
      "roles.xml",
    ),
  );
  const dialerRole = xmlElementBlockByName(
    rolesXml,
    "role",
    "android.app.role.DIALER",
    "AOSP roles.xml",
  );
  assertIncludes(
    dialerRole,
    'defaultHolders="config_defaultDialer"',
    "AOSP DIALER role",
  );
  assertIncludes(dialerRole, "android.intent.action.DIAL", "AOSP DIALER role");
  assertIncludes(
    dialerRole,
    "android.telecom.InCallService",
    "AOSP DIALER role",
  );

  const smsRole = xmlElementBlockByName(
    rolesXml,
    "role",
    "android.app.role.SMS",
    "AOSP roles.xml",
  );
  assertIncludes(
    smsRole,
    'defaultHolders="config_defaultSms"',
    "AOSP SMS role",
  );
  for (const marker of [
    "android.provider.Telephony.SMS_DELIVER",
    "android.provider.Telephony.WAP_PUSH_DELIVER",
    "android.intent.action.RESPOND_VIA_MESSAGE",
    "android.intent.action.SENDTO",
  ]) {
    assertIncludes(smsRole, marker, "AOSP SMS role");
  }

  const assistantRole = xmlElementBlockByName(
    rolesXml,
    "role",
    "android.app.role.ASSISTANT",
    "AOSP roles.xml",
  );
  assertIncludes(
    assistantRole,
    'defaultHolders="config_defaultAssistant"',
    "AOSP ASSISTANT role",
  );
  assertIncludes(assistantRole, "AssistantRoleBehavior", "AOSP ASSISTANT role");

  const homeRole = xmlElementBlockByName(
    rolesXml,
    "role",
    "android.app.role.HOME",
    "AOSP roles.xml",
  );
  assertIncludes(homeRole, "android.intent.category.HOME", "AOSP HOME role");
  if (homeRole.includes("defaultHolders=")) {
    fail(
      "AOSP HOME role unexpectedly has a defaultHolders config; revisit MiladyOS home defaulting.",
    );
  }

  const frameworkConfig = read(
    path.join(
      aospRoot,
      "frameworks",
      "base",
      "core",
      "res",
      "res",
      "values",
      "config.xml",
    ),
  );
  for (const resourceName of [
    "config_defaultAssistant",
    "config_defaultDialer",
    "config_defaultSms",
  ]) {
    assertIncludes(
      frameworkConfig,
      `name="${resourceName}"`,
      "AOSP framework config.xml",
    );
  }

  console.log("[miladyos:validate] AOSP source compatibility checks passed.");
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  validateXmlFiles(args.vendorDir);
  validateProductLayer(args.vendorDir);
  validateDefaultPermissions(args.vendorDir);
  validateSepolicy(args.vendorDir);
  validateApk(args.apk);
  if (args.aospRoot) {
    validateAospRoot(args.aospRoot);
  }
  console.log("[miladyos:validate] MiladyOS checks passed.");
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
