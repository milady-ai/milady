#!/usr/bin/env node
// @ts-check
/**
 * dev-local-cloud.mjs
 *
 * Brings up the eliza/cloud Postgres + Redis + serverless-redis-http stack via
 * docker compose, picking free host ports when the defaults are occupied.
 *
 * The repo's docker-compose.yml lives inside the eliza/ submodule and must
 * not be modified. We layer a generated override compose file on top to
 * remap the host-side ports.
 *
 * Output:
 *   .milady/cache/local-cloud-overrides.yml  generated compose override
 *   .milady/cache/local-cloud-ports.json     chosen port map for downstream
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

const COMPOSE_FILE = resolve(REPO_ROOT, "eliza/cloud/docker-compose.yml");
const STEWARD_PATH = resolve(REPO_ROOT, "eliza/steward");
const CACHE_DIR = resolve(REPO_ROOT, ".milady/cache");
const OVERRIDE_FILE = resolve(CACHE_DIR, "local-cloud-overrides.yml");
const PORTS_FILE = resolve(CACHE_DIR, "local-cloud-ports.json");

// The compose file uses fixed `container_name:` values (eliza-local-db,
// eliza-local-redis, eliza-local-redis-rest). Those names are global, so
// the project name must match whatever project originally claimed them or
// docker compose refuses to recreate. We pick a stable project name and
// reclaim any orphaned containers under it.
const COMPOSE_PROJECT = "eliza-cloud-v2";

/** @typedef {{ name: string, defaultPort: number, scanRange: number, container: string }} ServicePort */

/** @type {ServicePort[]} */
const SERVICES = [
  {
    name: "postgres",
    defaultPort: 5432,
    scanRange: 9,
    container: "eliza-local-db",
  },
  {
    name: "redis",
    defaultPort: 6379,
    scanRange: 12,
    container: "eliza-local-redis",
  },
  {
    name: "redis-rest",
    defaultPort: 8079,
    scanRange: 12,
    container: "eliza-local-redis-rest",
  },
];

/**
 * @param {string} msg
 */
function log(msg) {
  process.stdout.write(`[dev-cloud] ${msg}\n`);
}

/**
 * @param {string} msg
 */
function warn(msg) {
  process.stderr.write(`[dev-cloud] WARN: ${msg}\n`);
}

/**
 * @param {string} msg
 */
function fail(msg) {
  process.stderr.write(`[dev-cloud] ERROR: ${msg}\n`);
  process.exit(1);
}

/**
 * @param {string} cmd
 * @param {readonly string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, stdio?: import("node:child_process").StdioOptions }} [opts]
 */
function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd ?? REPO_ROOT,
    env: opts.env ?? process.env,
    stdio: opts.stdio ?? "inherit",
    encoding: "utf8",
  });
  return result;
}

/**
 * @param {string} cmd
 * @param {readonly string[]} args
 */
function runCapture(cmd, args) {
  return spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
}

function ensureDockerRunning() {
  const probe = runCapture("docker", [
    "info",
    "--format",
    "{{.ServerVersion}}",
  ]);
  if (probe.status !== 0) {
    fail(
      `docker is not available or the daemon is not running. ${probe.stderr?.trim() ?? ""}\n` +
        "Start Docker Desktop (or your docker daemon) and try again.",
    );
  }
}

/**
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isPortFreeOnHost(port) {
  return new Promise((resolveProm) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolveProm(false));
    server.once("listening", () => {
      server.close(() => resolveProm(true));
    });
    server.listen(port, "0.0.0.0");
  });
}

/**
 * Docker Desktop occasionally holds host ports in its internal allocator
 * even when the host TCP stack reports them free (leftover docker-proxy,
 * vpnkit reservations, etc). The only reliable check is to try binding via
 * docker itself.
 * @param {number} port
 * @returns {boolean}
 */
function isPortBindableByDocker(port) {
  const probe = runCapture("docker", [
    "run",
    "--rm",
    "-d",
    "--name",
    `eliza-port-probe-${port}`,
    "-p",
    `${port}:80`,
    "alpine:3",
    "sleep",
    "1",
  ]);
  if (probe.status !== 0) {
    // Make sure no half-created container lingers.
    runCapture("docker", ["rm", "-f", `eliza-port-probe-${port}`]);
    return false;
  }
  // Tear it down before it self-exits.
  runCapture("docker", ["rm", "-f", `eliza-port-probe-${port}`]);
  return true;
}

/**
 * @param {number} port
 * @returns {Promise<boolean>}
 */
async function isPortFree(port) {
  if (!(await isPortFreeOnHost(port))) return false;
  return isPortBindableByDocker(port);
}

/**
 * Returns a list of container names that are publishing the given host port.
 * @param {number} port
 * @returns {string[]}
 */
function dockerContainersOnPort(port) {
  const out = runCapture("docker", [
    "ps",
    "--format",
    "{{.Names}}\t{{.Ports}}",
  ]);
  if (out.status !== 0 || !out.stdout) return [];
  const matches = [];
  for (const line of out.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [name, ports] = trimmed.split("\t");
    if (!name || !ports) continue;
    if (
      ports.includes(`:${port}->`) ||
      ports.match(new RegExp(`(^|[^0-9]):${port}/`))
    ) {
      matches.push(name);
    }
  }
  return matches;
}

/**
 * @param {ServicePort} svc
 * @returns {Promise<{ port: number, reusedOurContainer: boolean }>}
 */
async function pickPort(svc) {
  for (let i = 0; i <= svc.scanRange; i++) {
    const port = svc.defaultPort + i;
    if (await isPortFree(port)) {
      return { port, reusedOurContainer: false };
    }
    const owners = dockerContainersOnPort(port);
    if (owners.includes(svc.container)) {
      return { port, reusedOurContainer: true };
    }
  }
  throw new Error(
    `Could not find a free host port for ${svc.name} in [${svc.defaultPort}..${svc.defaultPort + svc.scanRange}]. ` +
      "Free a port (e.g. stop the container holding it) and try again.",
  );
}

/**
 * @param {Record<string, { port: number, reusedOurContainer: boolean }>} portMap
 */
function writeOverrideFile(portMap) {
  // Compose merges list-valued fields (like `ports`) by appending across
  // override files unless we use the `!reset` / `!override` tags. We use
  // `!override` to fully replace the upstream port mapping.
  const lines = [
    "# Generated by scripts/dev-local-cloud.mjs - do not edit by hand.",
    "# Layered onto eliza/cloud/docker-compose.yml to remap host ports.",
    "services:",
    "  postgres:",
    "    ports: !override",
    `      - "${portMap.postgres.port}:5432"`,
    "  redis:",
    "    ports: !override",
    `      - "${portMap.redis.port}:6379"`,
    "  redis-rest:",
    "    ports: !override",
    `      - "${portMap["redis-rest"].port}:80"`,
    "",
  ];
  writeFileSync(OVERRIDE_FILE, lines.join("\n"), "utf8");
}

/**
 * @param {Record<string, { port: number, reusedOurContainer: boolean }>} portMap
 * @param {boolean} stewardEnabled
 */
function writePortsFile(portMap, stewardEnabled) {
  const payload = {
    generatedAt: new Date().toISOString(),
    composeFile: COMPOSE_FILE,
    overrideFile: OVERRIDE_FILE,
    services: {
      postgres: {
        host: "localhost",
        port: portMap.postgres.port,
        user: "eliza_dev",
        password: "local_dev_password",
        database: "eliza_dev",
        url: `postgresql://eliza_dev:local_dev_password@localhost:${portMap.postgres.port}/eliza_dev`,
      },
      redis: {
        host: "localhost",
        port: portMap.redis.port,
        url: `redis://localhost:${portMap.redis.port}`,
      },
      "redis-rest": {
        host: "localhost",
        port: portMap["redis-rest"].port,
        token: "local_dev_token",
        url: `http://localhost:${portMap["redis-rest"].port}`,
      },
    },
    steward: stewardEnabled ? { host: "localhost", port: 3200 } : null,
  };
  writeFileSync(PORTS_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * @param {boolean} stewardEnabled
 * @returns {string[]}
 */
function composeUpArgs(stewardEnabled) {
  const args = [
    "compose",
    "-f",
    COMPOSE_FILE,
    "-f",
    OVERRIDE_FILE,
    "--project-name",
    COMPOSE_PROJECT,
  ];
  args.push("up", "-d", "--remove-orphans");
  // Always bring up these three; skip steward unless the sibling repo exists.
  args.push("postgres", "redis", "redis-rest");
  if (stewardEnabled) args.push("steward");
  return args;
}

/**
 * @param {string} containerName
 * @returns {boolean}
 */
function waitForPostgres(containerName) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const probe = runCapture("docker", [
      "exec",
      containerName,
      "pg_isready",
      "-U",
      "eliza_dev",
      "-d",
      "eliza_dev",
    ]);
    if (probe.status === 0) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  return false;
}

async function main() {
  ensureDockerRunning();

  if (!existsSync(COMPOSE_FILE)) {
    fail(
      `Cloud docker-compose.yml not found at ${COMPOSE_FILE}. ` +
        "Initialize the eliza submodule first: git submodule update --init --recursive eliza",
    );
  }

  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }

  const stewardEnabled = existsSync(STEWARD_PATH);
  if (!stewardEnabled) {
    log(
      `steward sibling repo not found at ${STEWARD_PATH}; skipping steward service.`,
    );
  }

  /** @type {Record<string, { port: number, reusedOurContainer: boolean }>} */
  const portMap = {};
  for (const svc of SERVICES) {
    const picked = await pickPort(svc);
    portMap[svc.name] = picked;
    if (picked.port !== svc.defaultPort) {
      log(
        `${svc.name}: default ${svc.defaultPort} occupied; remapping host port to ${picked.port}`,
      );
    } else if (picked.reusedOurContainer) {
      log(
        `${svc.name}: reusing existing ${svc.container} on port ${picked.port}`,
      );
    } else {
      log(`${svc.name}: using default port ${picked.port}`);
    }
  }

  writeOverrideFile(portMap);
  writePortsFile(portMap, stewardEnabled);

  log(`Wrote override ${OVERRIDE_FILE}`);
  log(`Wrote port map  ${PORTS_FILE}`);

  const upArgs = composeUpArgs(stewardEnabled);
  log(`docker ${upArgs.join(" ")}`);
  const result = run("docker", upArgs);
  if (result.status !== 0) {
    fail(`docker compose up failed (exit ${result.status}). See output above.`);
  }

  log("Waiting for postgres to be ready...");
  const ready = waitForPostgres("eliza-local-db");
  if (!ready) {
    warn(
      "postgres did not become ready within 60s. Run: docker logs eliza-local-db",
    );
  } else {
    log("postgres is ready.");
  }

  printBanner(portMap, stewardEnabled);
}

/**
 * @param {Record<string, { port: number, reusedOurContainer: boolean }>} portMap
 * @param {boolean} stewardEnabled
 */
function printBanner(portMap, stewardEnabled) {
  const apiUrl = "http://localhost:3000";
  const lines = [
    "",
    "============================================================",
    "Local cloud is up.",
    "",
    `  Postgres : localhost:${portMap.postgres.port}`,
    `  Redis    : localhost:${portMap.redis.port}`,
    `  Redis REST: localhost:${portMap["redis-rest"].port}`,
    `  Steward  : ${stewardEnabled ? "localhost:3200" : "(skipped - sibling repo absent)"}`,
    "",
    `  DATABASE_URL=postgresql://eliza_dev:local_dev_password@localhost:${portMap.postgres.port}/eliza_dev`,
    `  REDIS_URL=redis://localhost:${portMap.redis.port}`,
    "",
    "Next:",
    "  1. Seed the DB:                 bun run seed:cloud:local",
    "  2. Start the cloud API:         cd eliza/cloud && bun install && bun run dev",
    "  3. Point the homepage at it:",
    `       VITE_ELIZA_CLOUD_BASE=${apiUrl} bun run dev:home:ui`,
    "============================================================",
    "",
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

main().catch((err) => {
  if (err instanceof Error) {
    fail(err.message);
  } else {
    fail(String(err));
  }
});
