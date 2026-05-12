import { describe, expect, it } from "vitest";
import {
  getElizaGitBranch,
  getElizaGitUrl,
  getElizaosPackageSpecifier,
  getElizaSourceMode,
  getExplicitElizaosPackageDistTag,
  isLocalElizaDisabled,
  isLocalElizaForced,
  selectPublishedPackageVersion,
  selectRegistryPackageVersion,
} from "./eliza-package-mode.mjs";

const registryInfo = {
  versions: ["2.0.0-alpha.1", "2.0.0-beta.1"],
  "dist-tags": {
    alpha: "2.0.0-alpha.1",
    beta: "2.0.0-beta.1",
    main: "2.0.0-main.1",
    latest: "2.0.0",
  },
  version: "2.0.0",
};

describe("eliza package mode helpers", () => {
  it("keeps package mode as the default without forcing local in installers", () => {
    expect(getElizaSourceMode({})).toBe("packages");
    expect(isLocalElizaDisabled({})).toBe(true);
    expect(isLocalElizaForced({})).toBe(false);
  });

  it("supports package mode aliases", () => {
    for (const mode of ["packages", "npm", "registry", "global"]) {
      expect(isLocalElizaDisabled({ MILADY_ELIZA_SOURCE: mode })).toBe(true);
    }
  });

  it("supports explicit local mode aliases", () => {
    expect(isLocalElizaForced({ MILADY_ELIZA_SOURCE: "workspace" })).toBe(true);
  });

  it("selects configurable elizaOS package tags and exact versions", () => {
    expect(getElizaosPackageSpecifier({})).toBe("alpha");
    expect(
      getElizaosPackageSpecifier({ MILADY_ELIZAOS_DIST_TAG: "beta" }),
    ).toBe("beta");
    expect(getExplicitElizaosPackageDistTag({})).toBe(null);
    expect(
      getExplicitElizaosPackageDistTag({ MILADY_ELIZAOS_DIST_TAG: "beta" }),
    ).toBe("beta");
    expect(getElizaosPackageSpecifier({ ELIZAOS_NPM_TAG: "main" })).toBe(
      "main",
    );
    expect(
      getElizaosPackageSpecifier({ MILADY_ELIZAOS_VERSION: "2.0.0-beta.3" }),
    ).toBe("2.0.0-beta.3");
  });

  it("selects registry versions from the configured dist-tag", () => {
    expect(selectRegistryPackageVersion(registryInfo, { env: {} })).toBe(
      "2.0.0-alpha.1",
    );
    expect(
      selectRegistryPackageVersion(registryInfo, {
        env: { MILADY_ELIZAOS_DIST_TAG: "beta" },
      }),
    ).toBe("2.0.0-beta.1");
    expect(
      selectRegistryPackageVersion(registryInfo, {
        env: { MILADY_ELIZAOS_DIST_TAG: "main" },
      }),
    ).toBe("2.0.0-main.1");
  });

  it("falls exact unpublished prereleases forward through the configured tag", () => {
    expect(
      selectPublishedPackageVersion("2.0.0-alpha.99", registryInfo, {
        env: { MILADY_ELIZAOS_DIST_TAG: "beta" },
      }),
    ).toBe("2.0.0-beta.1");
  });

  it("lets an explicit package tag override available local alpha pins", () => {
    expect(
      selectPublishedPackageVersion("2.0.0-alpha.1", registryInfo, {
        env: { MILADY_ELIZAOS_DIST_TAG: "beta" },
      }),
    ).toBe("2.0.0-beta.1");
  });

  it("makes the local clone target configurable", () => {
    expect(getElizaGitUrl({})).toBe("https://github.com/elizaOS/eliza.git");
    expect(getElizaGitBranch({})).toBe("develop");
    expect(
      getElizaGitUrl({ MILADY_ELIZA_GIT_URL: "https://example.test/e.git" }),
    ).toBe("https://example.test/e.git");
    expect(getElizaGitBranch({ MILADY_ELIZA_BRANCH: "main" })).toBe("main");
  });
});
