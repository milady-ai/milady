import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_RELEASE_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/agent-release.yml",
);
const CLOUD_IMAGE_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/build-cloud-image.yml",
);
const LEGACY_STEWARD_IMAGE_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/build-steward-image.yml",
);
const CANONICAL_IMAGE_DOCKERFILE = path.join(ROOT, "Dockerfile.ci");
const CLOUD_AGENT_DOCKERFILE = path.join(ROOT, "deploy/Dockerfile.cloud-agent");
const CI_DOCKERIGNORE = path.join(ROOT, ".dockerignore.ci");
const BUILD_IMAGE_SCRIPT = path.join(ROOT, "scripts/build-image.sh");
const DEPLOY_TO_NODES_SCRIPT = path.join(ROOT, "deploy/deploy-to-nodes.sh");
const DEBIAN_CONTROL = path.join(ROOT, "packaging/debian/control");
const DEBIAN_COMPAT = path.join(ROOT, "packaging/debian/compat");
const ANDROID_RELEASE_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/android-release.yml",
);
const APPLE_STORE_RELEASE_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/apple-store-release.yml",
);
const UPDATE_HOMEBREW_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/update-homebrew.yml",
);
const ROOT_PACKAGE_JSON = path.join(ROOT, "package.json");

describe("release support workflow drift", () => {
  it("validates both generic and cloud app image builds in Agent Release", () => {
    const workflow = fs.readFileSync(AGENT_RELEASE_WORKFLOW, "utf8");

    expect(workflow).toContain("build-docker");
    expect(workflow).toContain("build-cloud-image");
    expect(workflow).not.toContain("build-steward-image:");
    expect(workflow).toContain("R_CLOUD_IMAGE");
    expect(workflow).not.toContain("R_STEWARD_IMAGE");
  });

  it("keeps the dedicated cloud image workflow and removes steward", () => {
    expect(fs.existsSync(CLOUD_IMAGE_WORKFLOW)).toBe(true);
    expect(fs.existsSync(LEGACY_STEWARD_IMAGE_WORKFLOW)).toBe(false);
  });

  it("generates full release changelog content for the GitHub release page", () => {
    const workflow = fs.readFileSync(AGENT_RELEASE_WORKFLOW, "utf8");

    expect(workflow).toContain("name: Generate release changelog");
    expect(workflow).toContain("full-release-changelog.md");
    expect(workflow).toContain("git log --date=short --pretty=format");
    expect(workflow).toContain("repos.generateReleaseNotes");
    expect(workflow).toContain("## Full changelog");
    expect(workflow).toContain("publish-packages.yml");
    expect(workflow).toContain("Cloud app Docker image");
    expect(workflow).toContain("PyPI / Snap / Debian / Flatpak");
    expect(workflow).toContain("Cloud app Docker image");
    expect(workflow).toContain(
      "- 🔄 PyPI / Snap / Debian / Flatpak → publish-packages.yml",
    );
    expect(workflow).toContain(
      "- 🔄 Cloud app Docker image → post-publish push",
    );
    expect(workflow).toContain("build-pypi:");
    expect(workflow).toContain("'PyPI': process.env.R_PYPI");
  });

  it("keeps the homepage workflow entrypoint aligned with root package scripts", () => {
    const workflow = fs.readFileSync(AGENT_RELEASE_WORKFLOW, "utf8");
    const pkg = JSON.parse(fs.readFileSync(ROOT_PACKAGE_JSON, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(workflow).toContain("run: bun run build:web");
    expect(pkg.scripts?.["build:web"]).toContain("apps/web");
  });

  it("keeps stable release publishing idempotent", () => {
    const workflow = fs.readFileSync(AGENT_RELEASE_WORKFLOW, "utf8");

    expect(workflow).toContain("bump_patch()");
    expect(workflow).toContain('VERSION="$' + "{VERSION_OVERRIDE#v}" + '"');
    expect(workflow).toContain(
      "grep '^v[0-9]\\+\\.[0-9]\\+\\.[0-9]\\+-alpha\\.[0-9]\\+$'",
    );
    expect(workflow).toContain("grep '^v[0-9]\\+\\.[0-9]\\+\\.[0-9]\\+$'");
    expect(workflow).toContain("git ls-remote --exit-code --tags origin");
    expect(workflow).toContain(
      "Tag $TAG already exists on origin; reusing existing tag",
    );
    expect(workflow).toContain("repos.listReleases");
    expect(workflow).toContain("repos.updateRelease");
    expect(workflow).toContain("repos.deleteRelease");
  });

  it("builds the cloud app image from the full app Dockerfile", () => {
    const workflow = fs.readFileSync(CLOUD_IMAGE_WORKFLOW, "utf8");

    expect(workflow).toContain("name: Build Cloud App Image");
    expect(workflow).toContain("file: Dockerfile.ci");
    expect(workflow).toContain("type=raw,value=cloud-app");
    expect(workflow).toContain(
      "type=raw,value=cloud-app-$" +
        "{{ steps.version.outputs.version_clean }}",
    );
    expect(workflow).not.toContain("deploy/Dockerfile.cloud-slim");
  });

  it("keeps the subordinate cloud agent runtime on the dedicated child-image Dockerfile", () => {
    const dockerfile = fs.readFileSync(CLOUD_AGENT_DOCKERFILE, "utf8");

    expect(dockerfile).toContain("deploy/cloud-agent-entrypoint.ts");
    expect(dockerfile).toContain('CMD ["tsx", "entrypoint.ts"]');
  });

  it("uses the canonical image runtime selector for both agent and cloud launches", () => {
    const dockerfile = fs.readFileSync(CANONICAL_IMAGE_DOCKERFILE, "utf8");

    expect(dockerfile).toContain(
      'CMD ["node", "--import", "./node_modules/tsx/dist/loader.mjs", "milady.mjs", "start"]',
    );
    expect(dockerfile).toContain("EXPOSE 2138");
    expect(dockerfile).toContain("http://127.0.0.1:$" + "{port}/api/health");
  });

  it("keeps deploy runtime files in the canonical docker build context", () => {
    const dockerignoreEntries = fs
      .readFileSync(CI_DOCKERIGNORE, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));

    expect(dockerignoreEntries).not.toContain("deploy/");
  });

  it("points local build and deploy scripts at the canonical agent image", () => {
    const buildScript = fs.readFileSync(BUILD_IMAGE_SCRIPT, "utf8");
    const deployScript = fs.readFileSync(DEPLOY_TO_NODES_SCRIPT, "utf8");

    expect(buildScript).toContain('DOCKERFILE="Dockerfile.ci"');
    expect(buildScript).toContain("cp .dockerignore.ci .dockerignore");
    expect(buildScript).toContain("--build-arg VERSION=v$" + "{VERSION#v}");
    expect(buildScript).not.toContain(
      'DOCKERFILE="deploy/Dockerfile.cloud-slim"',
    );
    expect(deployScript).toContain('DEFAULT_IMAGE="milady/agent:latest"');
    expect(deployScript).not.toContain("cloud-full-ui");
  });

  it("declares the Debian debhelper compat level exactly once", () => {
    const control = fs.readFileSync(DEBIAN_CONTROL, "utf8");

    expect(control).toContain("debhelper-compat (= 13)");
    expect(fs.existsSync(DEBIAN_COMPAT)).toBe(false);
  });

  it("syncs Android Capacitor via the repo-supported app script", () => {
    const workflow = fs.readFileSync(ANDROID_RELEASE_WORKFLOW, "utf8");

    expect(workflow).toContain("working-directory: apps/app");
    expect(workflow).toContain("run: bun run cap:sync:android");
    expect(workflow).not.toContain("run: npx cap sync android");
  });

  it("syncs iOS Capacitor via the repo-supported app script", () => {
    const workflow = fs.readFileSync(APPLE_STORE_RELEASE_WORKFLOW, "utf8");

    expect(workflow).toContain("working-directory: apps/app");
    expect(workflow).toContain("run: bun run cap:sync:ios");
    expect(workflow).not.toContain("run: npx cap sync ios");
  });

  it("dispatches Homebrew updates to the actual tap repository", () => {
    const workflow = fs.readFileSync(UPDATE_HOMEBREW_WORKFLOW, "utf8");

    expect(workflow).toContain("repository: milady-ai/homebrew-tap");
    expect(workflow).not.toContain("repository: milady-ai/homebrew-milady");
  });
});
