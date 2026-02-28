/**
 * Docker PostgreSQL auto-setup helper for onboarding.
 *
 * POST /api/onboarding/setup-docker-db
 * - Generates random credentials
 * - Creates a Docker PostgreSQL container
 * - Polls for health check readiness
 * - Returns connection credentials
 */

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "@elizaos/core";

const execFileAsync = promisify(execFile);

const CONTAINER_NAME = "milady-postgres";
const POSTGRES_IMAGE = "postgres:17";
const POSTGRES_DB = "milady";
const POSTGRES_PORT = 5432;
const HEALTH_CHECK_INTERVAL_MS = 2_000;
const HEALTH_CHECK_MAX_WAIT_MS = 30_000;

export interface DockerDbCredentials {
  connectionString: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface DockerDbResult {
  success: boolean;
  credentials?: DockerDbCredentials;
  error?: string;
}

/** Check whether Docker is available and running. */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["info"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/** Check whether the milady-postgres container already exists. */
async function containerExists(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["ps", "-a", "--filter", `name=^/${CONTAINER_NAME}$`, "--format", "{{.Names}}"],
      { timeout: 5_000 },
    );
    return stdout.trim() === CONTAINER_NAME;
  } catch {
    return false;
  }
}

/** Check whether the container is healthy (accepting connections). */
async function isContainerHealthy(password: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      [
        "exec",
        CONTAINER_NAME,
        "pg_isready",
        "-U",
        "milady",
        "-d",
        POSTGRES_DB,
      ],
      { timeout: 5_000 },
    );
    return stdout.includes("accepting connections");
  } catch {
    return false;
  }
}

/** Poll until the container is healthy or timeout. */
async function waitForHealth(password: string): Promise<boolean> {
  const deadline = Date.now() + HEALTH_CHECK_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    if (await isContainerHealthy(password)) return true;
    await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
  }
  return false;
}

/**
 * Set up a Docker PostgreSQL container for Milady.
 * If the container already exists, it is removed and recreated.
 */
export async function setupDockerPostgres(): Promise<DockerDbResult> {
  if (!(await isDockerAvailable())) {
    return {
      success: false,
      error: "Docker is not installed or not running. Please install Docker and try again.",
    };
  }

  const password = crypto.randomBytes(16).toString("hex");
  const user = "milady";

  try {
    // Remove existing container if present
    if (await containerExists()) {
      logger.info("[docker-db] Removing existing milady-postgres container");
      await execFileAsync("docker", ["rm", "-f", CONTAINER_NAME], {
        timeout: 10_000,
      });
    }

    // Create and start container
    logger.info("[docker-db] Starting milady-postgres container");
    await execFileAsync(
      "docker",
      [
        "run",
        "-d",
        "--name",
        CONTAINER_NAME,
        "-e",
        `POSTGRES_USER=${user}`,
        "-e",
        `POSTGRES_PASSWORD=${password}`,
        "-e",
        `POSTGRES_DB=${POSTGRES_DB}`,
        "-p",
        `${POSTGRES_PORT}:5432`,
        "--restart",
        "unless-stopped",
        POSTGRES_IMAGE,
      ],
      { timeout: 60_000 },
    );

    // Wait for health
    const healthy = await waitForHealth(password);
    if (!healthy) {
      return {
        success: false,
        error: `PostgreSQL container started but did not become healthy within ${HEALTH_CHECK_MAX_WAIT_MS / 1000}s.`,
      };
    }

    const connectionString = `postgresql://${user}:${password}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}`;

    logger.info("[docker-db] Docker PostgreSQL is ready");
    return {
      success: true,
      credentials: {
        connectionString,
        host: "localhost",
        port: POSTGRES_PORT,
        database: POSTGRES_DB,
        user,
        password,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[docker-db] Setup failed: ${message}`);
    return { success: false, error: `Docker setup failed: ${message}` };
  }
}
