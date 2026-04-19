/**
 * Spawns mockoon-cli as a child process serving all environment files
 * on auto-assigned ports. Returns a portMap so callers can build the
 * MILADY_MOCK_*_BASE env vars and tear down on cleanup.
 */

import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENVS_DIR = path.resolve(__dirname, "..", "environments");

export const MOCK_ENVIRONMENTS = [
  "google",
  "twilio",
  "whatsapp",
  "x-twitter",
  "calendly",
  "cloud-managed",
] as const;

export type MockEnvironmentName = (typeof MOCK_ENVIRONMENTS)[number];

export interface StartedMocks {
  child: ChildProcess;
  portMap: Record<MockEnvironmentName, number>;
  baseUrls: Record<MockEnvironmentName, string>;
  /** Convenience env vars to set on process.env */
  envVars: Record<string, string>;
  stop(): Promise<void>;
}

async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (typeof addr === "object" && addr) {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("no port")));
      }
    });
  });
}

async function pickFreePorts(count: number): Promise<number[]> {
  // Allocate sequentially to avoid two parallel listeners colliding on the
  // same ephemeral port.
  const ports: number[] = [];
  for (let i = 0; i < count; i += 1) {
    ports.push(await pickFreePort());
  }
  return ports;
}

async function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(500);
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
    sock.once("timeout", () => done(false));
    sock.connect(port, "127.0.0.1");
  });
}

async function waitForServer(port: number, timeoutMs = 45_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probePort(port)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    `Mockoon server on port ${port} did not start within ${timeoutMs}ms`,
  );
}

function envVarsFor(
  envs: readonly MockEnvironmentName[],
  baseUrls: Record<MockEnvironmentName, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (envs.includes("google")) out.MILADY_MOCK_GOOGLE_BASE = baseUrls.google;
  if (envs.includes("twilio")) out.MILADY_MOCK_TWILIO_BASE = baseUrls.twilio;
  if (envs.includes("whatsapp"))
    out.MILADY_MOCK_WHATSAPP_BASE = baseUrls.whatsapp;
  if (envs.includes("x-twitter"))
    out.MILADY_MOCK_X_BASE = baseUrls["x-twitter"];
  if (envs.includes("calendly"))
    out.MILADY_MOCK_CALENDLY_BASE = baseUrls.calendly;
  if (envs.includes("cloud-managed"))
    out.ELIZA_CLOUD_BASE_URL = baseUrls["cloud-managed"];
  return out;
}

export async function startMocks(opts?: {
  envs?: readonly MockEnvironmentName[];
  cliCommand?: string[];
}): Promise<StartedMocks> {
  const envs = opts?.envs ?? MOCK_ENVIRONMENTS;

  const dataPaths = envs.map((e) => path.resolve(ENVS_DIR, `${e}.json`));
  const missing = dataPaths.filter((p) => !fs.existsSync(p));
  if (missing.length > 0) {
    throw new Error(`Mockoon environment files missing: ${missing.join(", ")}`);
  }

  const ports = await pickFreePorts(envs.length);

  const dataArgs = dataPaths.flatMap((p) => ["--data", p]);
  // Mockoon CLI accepts repeated --port and --hostname flags; one entry per
  // --data file in the same order.
  const portArgs = ports.flatMap((p) => ["--port", String(p)]);
  const hostnameArgs = envs.flatMap(() => ["--hostname", "127.0.0.1"]);

  const cli = opts?.cliCommand ?? ["bunx", "--bun", "@mockoon/cli@latest"];
  const child = spawn(
    cli[0],
    [
      ...cli.slice(1),
      "start",
      ...dataArgs,
      ...portArgs,
      ...hostnameArgs,
      "--disable-log-to-file",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  // Drain child output to avoid back-pressure; surface fatal exits.
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", () => {});

  let exited = false;
  let exitInfo: { code: number | null; signal: NodeJS.Signals | null } | null =
    null;
  child.once("exit", (code, signal) => {
    exited = true;
    exitInfo = { code, signal };
  });

  try {
    // Race readiness against early child exit so we fail fast on bad envs.
    await Promise.race([
      Promise.all(ports.map((p) => waitForServer(p))),
      new Promise<never>((_, reject) => {
        const id = setInterval(() => {
          if (exited) {
            clearInterval(id);
            reject(
              new Error(
                `mockoon-cli exited before listening (code=${exitInfo?.code} signal=${exitInfo?.signal})`,
              ),
            );
          }
        }, 200).unref();
      }),
    ]);
  } catch (err) {
    if (!exited) child.kill("SIGKILL");
    throw err;
  }

  const portMap = Object.fromEntries(
    envs.map((e, i) => [e, ports[i]]),
  ) as Record<MockEnvironmentName, number>;
  const baseUrls = Object.fromEntries(
    envs.map((e, i) => [e, `http://127.0.0.1:${ports[i]}`]),
  ) as Record<MockEnvironmentName, string>;

  return {
    child,
    portMap,
    baseUrls,
    envVars: envVarsFor(envs, baseUrls),
    stop: async () => {
      if (exited) return;
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        if (exited) return resolve();
        const onExit = () => resolve();
        child.once("exit", onExit);
        setTimeout(() => {
          if (!exited) child.kill("SIGKILL");
          resolve();
        }, 3_000).unref();
      });
    },
  };
}
