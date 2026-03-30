import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const EXPECTED_NODE_VERSION = "22";
const EXPECTED_BUN_VERSION = "1.3.10";
const EXPECTED_EXPOSE_PORT = "2138";
const EXPECTED_ENTRYPOINT =
  'ENTRYPOINT ["sh", "./scripts/docker-entrypoint.sh"]';
const EXPECTED_LABEL_KEYS = [
  "org.opencontainers.image.title",
  "org.opencontainers.image.description",
  "org.opencontainers.image.source",
  "org.opencontainers.image.url",
  "org.opencontainers.image.version",
  "org.opencontainers.image.revision",
  "org.opencontainers.image.licenses",
] as const;

const DOCKERFILES = [
  {
    name: "Dockerfile",
    path: path.join(ROOT, "Dockerfile"),
    expectedBase: "bookworm",
    expectedCommand: 'CMD ["/root/.bun/bin/bun", "milady.mjs", "start"]',
  },
  {
    name: "Dockerfile.slim",
    path: path.join(ROOT, "Dockerfile.slim"),
    expectedBase: "slim",
    expectedCommand: 'CMD ["node", "--import", "tsx", "milady.mjs", "start"]',
  },
  {
    name: "Dockerfile.ci",
    path: path.join(ROOT, "Dockerfile.ci"),
    expectedBase: "slim",
    expectedCommand: 'CMD ["node", "--import", "tsx", "milady.mjs", "start"]',
  },
] as const;

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function parseArg(content: string, argName: string): string | null {
  const match = content.match(
    new RegExp(`^ARG ${argName}="?([^"\\n]*)"?$`, "m"),
  );
  return match?.[1] ?? null;
}

function collectOciLabelKeys(content: string): Set<string> {
  const matches = content.match(/org\.opencontainers\.image\.[a-z.]+(?==)/g);
  return new Set(matches ?? []);
}

describe("Docker contract", () => {
  it.each(
    DOCKERFILES,
  )("$name declares the shared Node/Bun versions and runtime contract", ({
    path: filePath,
    expectedBase,
    expectedCommand,
  }) => {
    const content = read(filePath);

    expect(parseArg(content, "NODE_VERSION")).toBe(EXPECTED_NODE_VERSION);
    expect(parseArg(content, "BUN_VERSION")).toBe(EXPECTED_BUN_VERSION);
    expect(content).toContain(`FROM node:\${NODE_VERSION}-${expectedBase}`);
    expect(content).toContain(EXPECTED_ENTRYPOINT);
    expect(content).toContain(`EXPOSE ${EXPECTED_EXPOSE_PORT}`);
    expect(content).toContain(expectedCommand);

    const labelKeys = collectOciLabelKeys(content);
    for (const key of EXPECTED_LABEL_KEYS) {
      expect(labelKeys.has(key)).toBe(true);
    }
  });

  it("syncs PORT into the canonical runtime env aliases", () => {
    const entrypoint = read(path.join(ROOT, "scripts/docker-entrypoint.sh"));

    expect(entrypoint).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable assertion
      'resolved_port="${PORT:-${MILADY_PORT:-2138}}"',
    );
    expect(entrypoint).toContain('export MILADY_PORT="$resolved_port"');
    expect(entrypoint).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable assertion
      'export ELIZA_PORT="${ELIZA_PORT:-$resolved_port}"',
    );
    expect(entrypoint).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable assertion
      'export MILADY_API_PORT="${MILADY_API_PORT:-$resolved_port}"',
    );
    expect(entrypoint).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable assertion
      'export ELIZA_API_PORT="${ELIZA_API_PORT:-$resolved_port}"',
    );
  });

  it("uses the Docker smoke script to validate the PORT override contract", () => {
    const smokeScript = read(path.join(ROOT, "scripts/docker-ci-smoke.sh"));

    expect(smokeScript).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable assertion
      'CONTAINER_PORT="${CONTAINER_PORT:-42138}"',
    );
    expect(smokeScript).toContain('--build-arg "BUN_VERSION=$BUN_VERSION"');
    expect(smokeScript).toContain('--build-arg "REVISION=$SOURCE_SHA"');
    expect(smokeScript).toContain('-e PORT="$CONTAINER_PORT"');
    expect(smokeScript).toContain("-e MILADY_API_BIND=0.0.0.0");
    expect(smokeScript).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable assertion
      '-p "${SMOKE_PORT}:${CONTAINER_PORT}"',
    );
  });
});
