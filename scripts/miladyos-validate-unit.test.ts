// Unit tests for scripts/miladyos/validate.mjs.
//
// Each test synthesises a minimal vendor/milady directory, then calls
// the relevant validate* function and asserts the pass/fail surface.
// We don't exercise validateApk / validateAospRoot here — those need
// `aapt` and a full AOSP tree respectively, which the integration test
// (`bun run miladyos:validate`) already covers.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  validateDefaultPermissions,
  validateProductLayer,
  validateSepolicy,
  validateXmlFiles,
} from "./miladyos/validate.mjs";

const PACKAGE_NAME = "com.miladyai.milady";
const PRODUCT_NAME = "milady_cf_x86_64_phone";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "miladyos-validate-unit-"));
  tempDirs.push(dir);
  return dir;
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

/**
 * Minimal-but-valid vendor/milady layout. Tests modify or delete files
 * after calling this to assert specific validators reject specific
 * regressions.
 */
function makeValidVendorDir(): string {
  const vendor = path.join(makeTempDir(), "vendor", "milady");

  writeFile(
    path.join(vendor, "milady_common.mk"),
    `PRODUCT_BRAND := Milady
PRODUCT_PACKAGES += \\
    Milady \\
    default-permissions-${PACKAGE_NAME}.xml \\
    privapp-permissions-${PACKAGE_NAME}.xml
PRODUCT_PACKAGES -= \\
    Browser2 \\
    Calendar \\
    Camera2 \\
    Contacts \\
    DeskClock \\
    Dialer \\
    Email \\
    Gallery2 \\
    Launcher3 \\
    Launcher3QuickStep \\
    ManagedProvisioning \\
    Messaging \\
    Music \\
    Provision \\
    QuickSearchBox \\
    SetupWizard \\
    Trebuchet
PRODUCT_PACKAGE_OVERLAYS += vendor/milady/overlays
PRODUCT_PRODUCT_PROPERTIES += \\
    ro.miladyos.product=$(MILADY_PRODUCT_TAG) \\
    ro.miladyos.home=${PACKAGE_NAME} \\
    ro.setupwizard.mode=DISABLED
PRODUCT_COPY_FILES += \\
    vendor/milady/init/init.milady.rc:$(TARGET_COPY_OUT_PRODUCT)/etc/init/init.milady.rc
BOARD_VENDOR_SEPOLICY_DIRS += vendor/milady/sepolicy
`,
  );

  writeFile(
    path.join(vendor, "products", `${PRODUCT_NAME}.mk`),
    `$(call inherit-product, device/google/cuttlefish/vsoc_x86_64_only/phone/aosp_cf.mk)
PRODUCT_NAME := ${PRODUCT_NAME}
MILADY_PRODUCT_TAG := ${PRODUCT_NAME}
$(call inherit-product, vendor/milady/milady_common.mk)
`,
  );

  writeFile(
    path.join(vendor, "products", "milady_pixel_phone.mk"),
    `ifndef MILADY_PIXEL_CODENAME
$(error milady_pixel_phone.mk requires MILADY_PIXEL_CODENAME)
endif
$(call inherit-product, device/google/$(MILADY_PIXEL_CODENAME)/aosp_$(MILADY_PIXEL_CODENAME).mk)
$(call inherit-product, vendor/milady/milady_common.mk)
`,
  );

  writeFile(
    path.join(vendor, "AndroidProducts.mk"),
    `PRODUCT_MAKEFILES := \\
    $(LOCAL_DIR)/products/${PRODUCT_NAME}.mk
COMMON_LUNCH_CHOICES := \\
    ${PRODUCT_NAME}-trunk_staging-userdebug
`,
  );

  writeFile(
    path.join(vendor, "apps", "Milady", "Android.bp"),
    `android_app_import {
    name: "Milady",
    apk: "Milady.apk",
    certificate: "platform",
    privileged: true,
    overrides: [
        "Launcher3",
        "Launcher3QuickStep",
        "Dialer",
        "messaging",
        "Messaging",
        "Contacts",
        "Trebuchet",
    ],
}
`,
  );

  writeFile(
    path.join(vendor, "permissions", `default-permissions-${PACKAGE_NAME}.xml`),
    `<?xml version="1.0" encoding="utf-8"?>
<exceptions>
    <exception package="${PACKAGE_NAME}">
        <permission name="android.permission.READ_CONTACTS" fixed="true" />
        <permission name="android.permission.WRITE_CONTACTS" fixed="true" />
        <permission name="android.permission.CALL_PHONE" fixed="true" />
        <permission name="android.permission.READ_PHONE_STATE" fixed="true" />
        <permission name="android.permission.ANSWER_PHONE_CALLS" fixed="true" />
        <permission name="android.permission.READ_CALL_LOG" fixed="true" />
        <permission name="android.permission.WRITE_CALL_LOG" fixed="true" />
        <permission name="android.permission.READ_SMS" fixed="true" />
        <permission name="android.permission.SEND_SMS" fixed="true" />
        <permission name="android.permission.RECEIVE_SMS" fixed="true" />
        <permission name="android.permission.RECEIVE_MMS" fixed="true" />
        <permission name="android.permission.RECEIVE_WAP_PUSH" fixed="true" />
        <permission name="android.permission.POST_NOTIFICATIONS" fixed="true" />
    </exception>
</exceptions>
`,
  );

  writeFile(
    path.join(vendor, "permissions", `privapp-permissions-${PACKAGE_NAME}.xml`),
    `<?xml version="1.0" encoding="utf-8"?>
<permissions>
    <privapp-permissions package="${PACKAGE_NAME}">
        <permission name="android.permission.PACKAGE_USAGE_STATS" />
        <permission name="android.permission.MANAGE_APP_OPS_MODES" />
    </privapp-permissions>
</permissions>
`,
  );

  writeFile(
    path.join(vendor, "permissions", "Android.bp"),
    `prebuilt_etc {
    name: "default-permissions-${PACKAGE_NAME}.xml",
    src: "default-permissions-${PACKAGE_NAME}.xml",
    sub_dir: "default-permissions",
}
prebuilt_etc {
    name: "privapp-permissions-${PACKAGE_NAME}.xml",
    src: "privapp-permissions-${PACKAGE_NAME}.xml",
    sub_dir: "permissions",
}
`,
  );

  writeFile(
    path.join(
      vendor,
      "overlays",
      "frameworks",
      "base",
      "core",
      "res",
      "res",
      "values",
      "config.xml",
    ),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="config_defaultDialer" translatable="false">${PACKAGE_NAME}</string>
    <string name="config_defaultSms" translatable="false">${PACKAGE_NAME}</string>
    <string name="config_defaultAssistant" translatable="false">${PACKAGE_NAME}</string>
    <string name="config_defaultBrowser" translatable="false">${PACKAGE_NAME}</string>
</resources>
`,
  );

  writeFile(path.join(vendor, "init", "init.milady.rc"), "on init\n");
  writeFile(path.join(vendor, "sepolicy", "file_contexts"), "");
  writeFile(
    path.join(vendor, "sepolicy", "milady_agent.te"),
    "allow platform_app app_data_file:file { execute execute_no_trans };\n",
  );

  return vendor;
}

describe("validateXmlFiles", () => {
  it("passes when every XML file in the tree parses", () => {
    const vendor = makeValidVendorDir();
    expect(() => validateXmlFiles(vendor)).not.toThrow();
  });

  it("rejects malformed XML", () => {
    const vendor = makeValidVendorDir();
    fs.writeFileSync(
      path.join(
        vendor,
        "permissions",
        `privapp-permissions-${PACKAGE_NAME}.xml`,
      ),
      '<?xml version="1.0"?><unterminated',
    );
    expect(() => validateXmlFiles(vendor)).toThrow();
  });
});

describe("validateProductLayer", () => {
  it("passes a well-formed vendor dir", () => {
    const vendor = makeValidVendorDir();
    expect(() => validateProductLayer(vendor)).not.toThrow();
  });

  it("rejects when the product makefile no longer inherits milady_common.mk", () => {
    const vendor = makeValidVendorDir();
    const productPath = path.join(vendor, "products", `${PRODUCT_NAME}.mk`);
    let product = fs.readFileSync(productPath, "utf8");
    product = product.replace(/vendor\/milady\/milady_common\.mk/g, "");
    fs.writeFileSync(productPath, product);
    expect(() => validateProductLayer(vendor)).toThrow(
      /milady_common\.mk for shared OS-path invariants/,
    );
  });

  it("rejects when a stripped-app marker is missing from the strip list", () => {
    const vendor = makeValidVendorDir();
    const commonPath = path.join(vendor, "milady_common.mk");
    fs.writeFileSync(
      commonPath,
      fs.readFileSync(commonPath, "utf8").replace(/SetupWizard \\/g, ""),
    );
    expect(() => validateProductLayer(vendor)).toThrow(/SetupWizard/);
  });

  it("rejects when ro.setupwizard.mode is not DISABLED", () => {
    const vendor = makeValidVendorDir();
    const commonPath = path.join(vendor, "milady_common.mk");
    fs.writeFileSync(
      commonPath,
      fs
        .readFileSync(commonPath, "utf8")
        .replace(/ro\.setupwizard\.mode=DISABLED/g, ""),
    );
    expect(() => validateProductLayer(vendor)).toThrow(
      /ro\.setupwizard\.mode=DISABLED/,
    );
  });

  it("rejects when init.milady.rc is missing from PRODUCT_COPY_FILES", () => {
    const vendor = makeValidVendorDir();
    const commonPath = path.join(vendor, "milady_common.mk");
    fs.writeFileSync(
      commonPath,
      fs
        .readFileSync(commonPath, "utf8")
        .replace(/init\.milady\.rc/g, "init.x.rc"),
    );
    expect(() => validateProductLayer(vendor)).toThrow(/init\.milady\.rc/);
  });

  it("rejects when sepolicy hook is missing", () => {
    const vendor = makeValidVendorDir();
    const commonPath = path.join(vendor, "milady_common.mk");
    fs.writeFileSync(
      commonPath,
      fs
        .readFileSync(commonPath, "utf8")
        .replace(
          /BOARD_VENDOR_SEPOLICY_DIRS \+= vendor\/milady\/sepolicy/g,
          "",
        ),
    );
    expect(() => validateProductLayer(vendor)).toThrow(
      /BOARD_VENDOR_SEPOLICY_DIRS/,
    );
  });

  it("rejects when the per-Pixel template is absent", () => {
    const vendor = makeValidVendorDir();
    fs.rmSync(path.join(vendor, "products", "milady_pixel_phone.mk"));
    expect(() => validateProductLayer(vendor)).toThrow(
      /milady_pixel_phone\.mk/,
    );
  });

  it("rejects when init.milady.rc file is absent on disk", () => {
    const vendor = makeValidVendorDir();
    fs.rmSync(path.join(vendor, "init", "init.milady.rc"));
    expect(() => validateProductLayer(vendor)).toThrow(
      /vendor\/milady init script/,
    );
  });

  it("rejects when sepolicy/file_contexts file is absent on disk", () => {
    const vendor = makeValidVendorDir();
    fs.rmSync(path.join(vendor, "sepolicy", "file_contexts"));
    expect(() => validateProductLayer(vendor)).toThrow(
      /sepolicy file_contexts/,
    );
  });

  it("rejects an obsolete PermissionController role-holder XML", () => {
    const vendor = makeValidVendorDir();
    writeFile(
      path.join(
        vendor,
        "overlays",
        "PermissionController",
        "config_defaultRoleHolders.xml",
      ),
      '<?xml version="1.0"?><resources><string name="config_defaultDialerRoleHolders">x</string></resources>',
    );
    expect(() => validateProductLayer(vendor)).toThrow(/PermissionController/);
  });
});

describe("validateDefaultPermissions", () => {
  it("passes a well-formed permissions dir", () => {
    const vendor = makeValidVendorDir();
    expect(() => validateDefaultPermissions(vendor)).not.toThrow();
  });

  it("rejects when prebuilt_etc Android.bp module name is missing", () => {
    const vendor = makeValidVendorDir();
    const bpPath = path.join(vendor, "permissions", "Android.bp");
    fs.writeFileSync(bpPath, "// no modules\n");
    expect(() => validateDefaultPermissions(vendor)).toThrow(
      /default-permissions-com\.miladyai\.milady\.xml/,
    );
  });

  it("rejects when sub_dir is wrong for default-permissions", () => {
    const vendor = makeValidVendorDir();
    const bpPath = path.join(vendor, "permissions", "Android.bp");
    fs.writeFileSync(
      bpPath,
      fs
        .readFileSync(bpPath, "utf8")
        .replace('sub_dir: "default-permissions"', 'sub_dir: "wrong"'),
    );
    expect(() => validateDefaultPermissions(vendor)).toThrow(
      /sub_dir: "default-permissions"/,
    );
  });

  it("rejects when a required dangerous permission is missing from the default grants", () => {
    const vendor = makeValidVendorDir();
    const xmlPath = path.join(
      vendor,
      "permissions",
      `default-permissions-${PACKAGE_NAME}.xml`,
    );
    fs.writeFileSync(
      xmlPath,
      fs
        .readFileSync(xmlPath, "utf8")
        .replace(/name="android\.permission\.SEND_SMS"[^/]*\/>/g, ""),
    );
    expect(() => validateDefaultPermissions(vendor)).toThrow(/SEND_SMS/);
  });

  it("rejects when MANAGE_APP_OPS_MODES is missing from the privapp whitelist", () => {
    const vendor = makeValidVendorDir();
    const xmlPath = path.join(
      vendor,
      "permissions",
      `privapp-permissions-${PACKAGE_NAME}.xml`,
    );
    fs.writeFileSync(
      xmlPath,
      fs
        .readFileSync(xmlPath, "utf8")
        .replace(
          /name="android\.permission\.MANAGE_APP_OPS_MODES"[^/]*\/>/g,
          "",
        ),
    );
    expect(() => validateDefaultPermissions(vendor)).toThrow(
      /MANAGE_APP_OPS_MODES/,
    );
  });
});

describe("validateSepolicy", () => {
  // The first attempt at a custom milady_agent SELinux domain landed at
  // the AOSP build's neverallow envelope (priv_app cannot transition to
  // arbitrary domains, app domains cannot have file_contexts entries
  // pointing under /data/data, etc.) and was reverted; the agent runs
  // in priv_app for now, which is what AOSP's seapp_contexts grants
  // the Milady APK by default. The validator only pins file existence
  // to keep BOARD_VENDOR_SEPOLICY_DIRS happy. When the custom domain
  // returns, the rule-level assertions come back too.
  it("passes when sepolicy/file_contexts exists (even empty)", () => {
    const vendor = makeValidVendorDir();
    expect(() => validateSepolicy(vendor)).not.toThrow();
  });

  it("rejects when sepolicy/file_contexts is missing", () => {
    const vendor = makeValidVendorDir();
    fs.rmSync(path.join(vendor, "sepolicy", "file_contexts"));
    expect(() => validateSepolicy(vendor)).toThrow(/file_contexts/);
  });
});
