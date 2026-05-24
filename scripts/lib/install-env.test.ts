import { describe, expect, it } from "vitest";
import {
  buildPathWithNodeBin,
  evaluateInstallReadiness,
  formatInstallReadinessError,
  selectNodeCandidate,
  selectPythonCandidate,
  shouldSkipInstallPreflight,
} from "./install-env.mjs";

describe("install environment", () => {
  it("prefers the exact .nvmrc Node candidate over a newer active Node", () => {
    const selected = selectNodeCandidate({
      requiredVersion: "22.22.0",
      activeNode: { executable: "/opt/homebrew/bin/node", version: "v25.9.0" },
      candidates: [
        {
          executable: "/Users/me/.nvm/versions/node/v22.22.0/bin/node",
          version: "v22.22.0",
        },
        { executable: "/opt/homebrew/bin/node", version: "v25.9.0" },
      ],
    });

    expect(selected?.executable).toBe(
      "/Users/me/.nvm/versions/node/v22.22.0/bin/node",
    );
  });

  it("rejects current Node majors newer than the supported native prebuild lane when no exact candidate exists", () => {
    const selected = selectNodeCandidate({
      requiredVersion: "22.22.0",
      activeNode: { executable: "/opt/homebrew/bin/node", version: "v25.9.0" },
      candidates: [],
    });

    expect(selected).toBeNull();
  });

  it("keeps an active supported Node when no exact candidate is available", () => {
    const selected = selectNodeCandidate({
      requiredVersion: "22.22.0",
      activeNode: { executable: "/opt/homebrew/bin/node", version: "v24.13.1" },
      candidates: [],
    });

    expect(selected?.executable).toBe("/opt/homebrew/bin/node");
  });

  it("prefers the first Python candidate that can import plistlib", () => {
    const selected = selectPythonCandidate([
      { executable: "/opt/homebrew/bin/python3.14", plistlib: false },
      { executable: "/usr/bin/python3", plistlib: true },
    ]);

    expect(selected?.executable).toBe("/usr/bin/python3");
  });

  it("prepends the selected Node bin without duplicating it", () => {
    expect(
      buildPathWithNodeBin(
        "/Users/me/.nvm/versions/node/v22.22.0/bin/node",
        "/opt/homebrew/bin:/usr/bin",
      ),
    ).toBe(
      "/Users/me/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin:/usr/bin",
    );
    expect(
      buildPathWithNodeBin(
        "/Users/me/.nvm/versions/node/v22.22.0/bin/node",
        "/Users/me/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin",
      ),
    ).toBe("/Users/me/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin");
  });

  it("rejects an active Node that is too new for native install scripts", () => {
    const readiness = evaluateInstallReadiness({
      requiredVersion: "22.22.0",
      activeNode: {
        executable: "/opt/homebrew/bin/node",
        version: "v25.9.0",
      },
    });

    expect(readiness.ok).toBe(false);
    expect(formatInstallReadinessError(readiness)).toContain(
      "./install --profile packages",
    );
    expect(formatInstallReadinessError(readiness)).toContain("v25.9.0");
    expect(formatInstallReadinessError(readiness)).toContain("v22.22.0/bin");
  });

  it("rejects a broken PATH python when a working system python can avoid node-gyp failures", () => {
    const readiness = evaluateInstallReadiness({
      requiredVersion: "22.22.0",
      activeNode: {
        executable: "/Users/me/.nvm/versions/node/v22.22.0/bin/node",
        version: "v22.22.0",
      },
      defaultPython: {
        executable: "/opt/homebrew/bin/python3",
        plistlib: false,
      },
      fallbackPython: { executable: "/usr/bin/python3", plistlib: true },
    });

    expect(readiness.ok).toBe(false);
    expect(formatInstallReadinessError(readiness)).toContain(
      "PYTHON=/usr/bin/python3",
    );
  });

  it("accepts a supported active Node with configured working Python", () => {
    const readiness = evaluateInstallReadiness({
      requiredVersion: "22.22.0",
      activeNode: {
        executable: "/Users/me/.nvm/versions/node/v22.22.0/bin/node",
        version: "v22.22.0",
      },
      configuredPython: { executable: "/usr/bin/python3", plistlib: true },
      defaultPython: {
        executable: "/opt/homebrew/bin/python3",
        plistlib: false,
      },
      fallbackPython: { executable: "/usr/bin/python3", plistlib: true },
    });

    expect(readiness.ok).toBe(true);
  });

  it("skips the preinstall doctor inside GitHub Actions workflows", () => {
    expect(shouldSkipInstallPreflight({ GITHUB_ACTIONS: "true" })).toBe(true);
    expect(shouldSkipInstallPreflight({ CI: "true" })).toBe(false);
  });

  it("skips the preinstall doctor with the explicit escape hatch", () => {
    expect(
      shouldSkipInstallPreflight({ MILADY_INSTALL_SKIP_PREFLIGHT: "1" }),
    ).toBe(true);
  });
});
