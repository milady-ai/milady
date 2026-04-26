import { describe, expect, it } from "vitest";

import {
  GRADLE_DISTRIBUTION,
  patchGradleWrapperText,
  patchLlamaBuildGradleText,
  patchRunMobileBuildText,
} from "./patch-mobile-build-release-compat.mjs";

describe("patch-mobile-build-release-compat", () => {
  it("aligns Android Gradle wrappers with the release Gradle version", () => {
    expect(
      patchGradleWrapperText(
        "distributionBase=GRADLE_USER_HOME\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-8.14.3-all.zip\n",
      ),
    ).toContain(`distributionUrl=${GRADLE_DISTRIBUTION}`);
  });

  it("patches llama-cpp-capacitor Gradle syntax and removes the invalid clean-task hook", () => {
    const source = `
android {
    namespace "ai.annadata.plugin.capacitor"
    version "3.22.1"
    ndkVersion "29.0.13113456"
    lintOptions {
        abortOnError false
    }
    defaultConfig {
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }

    // Disable clean tasks that might cause issues
    tasks.whenTaskAdded { task ->
        if (task.name.contains('Clean') && task.name.contains('Debug')) {
            task.enabled = false
        }
    }
}
`;

    const patched = patchLlamaBuildGradleText(source);

    expect(patched).toContain('namespace = "ai.annadata.plugin.capacitor"');
    expect(patched).toContain('version = "3.22.1"');
    expect(patched).toContain('ndkVersion = "29.0.13113456"');
    expect(patched).toContain("abortOnError = false");
    expect(patched).toContain(
      "getDefaultProguardFile('proguard-android-optimize.txt')",
    );
    expect(patched).not.toContain("tasks.whenTaskAdded");
    expect(patched).not.toContain("proguard-android.txt");
  });

  it("patches run-mobile-build so generated Android wrappers are aligned after Capacitor sync", () => {
    const source = `
import fs from "node:fs";
import path from "node:path";

const androidDir = path.join("apps", "app", "android");

function patchAndroidGradle() {
  console.log("patch Android project");
}
`;

    const patched = patchRunMobileBuildText(source);

    expect(patched).toContain(
      "function patchAndroidGradleWrapperForReleaseCompat()",
    );
    expect(patched).toContain(
      JSON.stringify(`distributionUrl=${GRADLE_DISTRIBUTION}`),
    );
    expect(patched).toContain(
      "patchAndroidGradleWrapperForReleaseCompat();\n  console.log",
    );
    expect(patchRunMobileBuildText(patched)).toBe(patched);
  });
});
