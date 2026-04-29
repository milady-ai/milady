import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const dockerSmokeScriptPath = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "scripts",
  "docker-ci-smoke.sh",
);
const dockerfilePath = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "deploy",
  "Dockerfile.ci",
);
const dockerignorePath = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "deploy",
  ".dockerignore.ci",
);
const localPackageLinkerPath = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "scripts",
  "link-docker-local-app-packages.mjs",
);
const cronStoragePath = path.join(
  repoRoot,
  "eliza",
  "plugins",
  "plugin-cron",
  "typescript",
  "src",
  "storage",
  "cron-storage.ts",
);

describe("docker CI smoke contract", () => {
  it("delegates published-workspace fallback dependencies to the shared helper", () => {
    const script = fs.readFileSync(dockerSmokeScriptPath, "utf8");

    expect(script).toContain(
      'bash "$REPO_ROOT/scripts/install-published-workspace-fallback-deps.sh"',
    );
    expect(script).not.toContain("bun add --no-save --dev");
  });

  it("generates core protobuf sources before building the Docker context", () => {
    const script = fs.readFileSync(dockerSmokeScriptPath, "utf8");

    expect(script).toContain(
      "eliza/packages/typescript/src/types/generated/eliza/v1/agent_pb.ts",
    );
    expect(script).toContain(
      "bunx --package @bufbuild/buf@1.68.3 buf generate",
    );
  });

  it("uses source-export shims for local plugin exports", () => {
    const script = fs.readFileSync(dockerSmokeScriptPath, "utf8");
    const linker = fs.readFileSync(localPackageLinkerPath, "utf8");

    expect(script).not.toContain(
      "Building Telegram plugin account-auth export",
    );
    expect(script).not.toContain("pushd eliza/plugins/plugin-telegram");
    expect(linker).toContain("rewriteDistExportsToSource");
    expect(linker).toContain('replace("./dist/", "./src/")');
    expect(linker).toContain("linkPackageTarget");
  });

  it("boots the smoke container with isolated runtime state and live log dumps", () => {
    const script = fs.readFileSync(dockerSmokeScriptPath, "utf8");

    expect(script).toContain(
      "-e ELIZA_WORKSPACE_DIR=/tmp/milady-smoke/workspace",
    );
    expect(script).toContain("-e PGLITE_DATA_DIR=/tmp/milady-smoke/pglite");
    expect(script).toContain("Container still booting; recent logs follow");
    expect(script).toContain('"$DOCKER_BIN" logs --tail 80 "$CONTAINER_NAME"');
  });

  it("does not override tsx esbuild in the runtime image", () => {
    const dockerfile = fs.readFileSync(dockerfilePath, "utf8");

    expect(dockerfile).not.toContain("ESBUILD_BINARY_PATH");
    expect(dockerfile).not.toContain("/usr/local/bin/esbuild");
    expect(dockerfile).toContain("ENV ELIZA_DISABLE_EDGE_TTS=1");
  });

  it("ships generated core proto runtime files for source-resolution paths", () => {
    const dockerfile = fs.readFileSync(dockerfilePath, "utf8");

    expect(dockerfile).toContain(
      "node eliza/packages/app-core/scripts/ensure-generated-core-proto-js.mjs",
    );
  });

  it("ships local app packages required by runtime static imports", () => {
    const dockerfile = fs.readFileSync(dockerfilePath, "utf8");
    const dockerignore = fs.readFileSync(dockerignorePath, "utf8");
    const linker = fs.readFileSync(localPackageLinkerPath, "utf8");

    expect(dockerfile).toContain(
      "node eliza/packages/app-core/scripts/link-docker-local-app-packages.mjs",
    );
    expect(dockerignore).toContain("!eliza/apps/app-companion/src/**");
    expect(dockerignore).toContain("!eliza/apps/app-lifeops/src/**");
    expect(dockerignore).toContain("!eliza/apps/app-task-coordinator/src/**");
    expect(linker).toContain("eliza/plugins/plugin-browser-bridge");
    expect(linker).toContain("eliza/packages/native-plugins/activity-tracker");
    expect(linker).toContain("eliza/plugins/plugin-cron/typescript");
    expect(linker).toContain("eliza/plugins/plugin-sql/typescript");
    expect(linker).toContain("eliza/plugins/plugin-telegram");
    expect(linker).toContain("collectWorkspaceMaps");
    expect(linker).toContain(
      'path.join(workspaceDir, "node_modules", "@elizaos")',
    );
    expect(linker).toContain("rewriteDistExportsToSource");
    expect(linker).toContain("pathExists(path.join(packageDir, sourcePath))");
    expect(linker).toContain('replace("./dist/node/", "./")');
    expect(linker).toContain('key === "types"');
    expect(linker).toContain('replace("./dist/", "./src/")');
    expect(linker).toContain("linkPackageTarget");
    expect(linker).toContain("linkPackageContents");
    expect(linker).not.toContain("fs.writeFileSync(packageJsonPath");
  });

  it("uses cron storage that keeps agent-scoped jobs out of worlds", () => {
    const cronStorage = fs.readFileSync(cronStoragePath, "utf8");

    expect(cronStorage).toContain("worldId: null as unknown as UUID");
    expect(cronStorage).toContain("components_world_id_worlds_id_fk");
  });

  it("keeps Docker helper scripts parseable by Node", () => {
    execFileSync(process.execPath, ["--check", localPackageLinkerPath], {
      stdio: "pipe",
    });
  });
});
