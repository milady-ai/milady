import { execFile } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import os from "node:os";
import path from "node:path";
import { domainToASCII } from "node:url";
import { promisify } from "node:util";
import type { HandlerOptions, Memory } from "@elizaos/core";

const execFileAsync = promisify(execFile);

const DEFAULT_SELFCONTROL_CLI_PATH =
  "/Applications/SelfControl.app/Contents/MacOS/selfcontrol-cli";
const LEGACY_SELFCONTROL_CLI_PATH =
  "/Applications/SelfControl.app/Contents/MacOS/org.eyebeam.SelfControl";
const DEFAULT_STATUS_CACHE_TTL_MS = 5_000;
const DEFAULT_DURATION_MINUTES = 60;
const MAX_BLOCK_MINUTES = 7 * 24 * 60;

export interface SelfControlPluginConfig {
  cliPath?: string;
  statusCacheTtlMs?: number;
}

export interface SelfControlStatus {
  available: boolean;
  active: boolean;
  cliPath: string | null;
  endsAt: string | null;
  websites: string[];
  reason?: string;
}

export interface SelfControlBlockRequest {
  websites: string[];
  durationMinutes: number;
}

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
};

export type SelfControlCommandRunner = (
  cliPath: string,
  args: string[],
) => Promise<CommandResult>;

type PathExists = (targetPath: string) => Promise<boolean>;

let currentConfig: SelfControlPluginConfig = {};

let commandRunner: SelfControlCommandRunner = async (
  cliPath: string,
  args: string[],
) => {
  try {
    const result = await execFileAsync(cliPath, args, {
      encoding: "utf8",
      timeout: 15_000,
    });
    return {
      ok: true,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      code: 0,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | null;
    };
    return {
      ok: false,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      code: typeof err.code === "number" ? err.code : null,
    };
  }
};

let pathExists: PathExists = async (targetPath: string) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

let statusCache:
  | {
      expiresAt: number;
      promise: Promise<SelfControlStatus>;
    }
  | undefined;

export function setSelfControlPluginConfig(
  nextConfig: SelfControlPluginConfig | undefined,
): void {
  currentConfig = { ...(nextConfig ?? {}) };
  resetSelfControlStatusCache();
}

export function getSelfControlPluginConfig(): SelfControlPluginConfig {
  return { ...currentConfig };
}

export function setSelfControlCommandRunnerForTests(
  runner: SelfControlCommandRunner | null,
): void {
  commandRunner =
    runner ??
    (async (cliPath: string, args: string[]) => {
      try {
        const result = await execFileAsync(cliPath, args, {
          encoding: "utf8",
          timeout: 15_000,
        });
        return {
          ok: true,
          stdout: result.stdout ?? "",
          stderr: result.stderr ?? "",
          code: 0,
        };
      } catch (error) {
        const err = error as NodeJS.ErrnoException & {
          stdout?: string;
          stderr?: string;
          code?: number | null;
        };
        return {
          ok: false,
          stdout: err.stdout ?? "",
          stderr: err.stderr ?? "",
          code: typeof err.code === "number" ? err.code : null,
        };
      }
    });
  resetSelfControlStatusCache();
}

export function setSelfControlPathExistsForTests(
  nextPathExists: PathExists | null,
): void {
  pathExists =
    nextPathExists ??
    (async (targetPath: string) => {
      try {
        await access(targetPath);
        return true;
      } catch {
        return false;
      }
    });
  resetSelfControlStatusCache();
}

export function resetSelfControlStatusCache(): void {
  statusCache = undefined;
}

export async function resolveSelfControlCliPath(
  config: SelfControlPluginConfig = currentConfig,
): Promise<string | null> {
  const candidates = [
    config.cliPath,
    process.env.SELFCONTROL_CLI_PATH,
    DEFAULT_SELFCONTROL_CLI_PATH,
    LEGACY_SELFCONTROL_CLI_PATH,
  ].filter((candidate): candidate is string => typeof candidate === "string");

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function getSelfControlStatus(
  config: SelfControlPluginConfig = currentConfig,
): Promise<SelfControlStatus> {
  const cliPath = await resolveSelfControlCliPath(config);
  if (!cliPath) {
    return {
      available: false,
      active: false,
      cliPath: null,
      endsAt: null,
      websites: [],
      reason: "SelfControl CLI was not found on this machine.",
    };
  }

  const isRunningResult = await commandRunner(cliPath, ["is-running"]);
  const isRunningOutput = `${isRunningResult.stdout}\n${isRunningResult.stderr}`;
  if (!isRunningResult.ok) {
    return {
      available: true,
      active: false,
      cliPath,
      endsAt: null,
      websites: [],
      reason: isRunningOutput.trim() || "Failed to query SelfControl status.",
    };
  }

  const active = parseSelfControlIsRunningOutput(isRunningOutput);
  if (!active) {
    return {
      available: true,
      active: false,
      cliPath,
      endsAt: null,
      websites: [],
    };
  }

  const settingsResult = await commandRunner(cliPath, ["print-settings"]);
  const settingsOutput = `${settingsResult.stdout}\n${settingsResult.stderr}`;
  if (!settingsResult.ok) {
    return {
      available: true,
      active: true,
      cliPath,
      endsAt: null,
      websites: [],
      reason:
        settingsOutput.trim() || "Failed to read the active SelfControl block.",
    };
  }

  const parsedSettings = parseSelfControlSettingsOutput(settingsOutput);

  return {
    available: true,
    active: true,
    cliPath,
    endsAt: parsedSettings.endsAt,
    websites: parsedSettings.websites,
  };
}

export async function getCachedSelfControlStatus(
  config: SelfControlPluginConfig = currentConfig,
): Promise<SelfControlStatus> {
  const ttlMs = config.statusCacheTtlMs ?? DEFAULT_STATUS_CACHE_TTL_MS;
  if (statusCache && statusCache.expiresAt > Date.now()) {
    return await statusCache.promise;
  }

  const promise = getSelfControlStatus(config);
  statusCache = {
    expiresAt: Date.now() + ttlMs,
    promise,
  };
  return await promise;
}

export async function startSelfControlBlock(
  request: SelfControlBlockRequest,
  config: SelfControlPluginConfig = currentConfig,
): Promise<
  | {
      success: true;
      endsAt: string;
    }
  | {
      success: false;
      error: string;
      status?: SelfControlStatus;
    }
> {
  const status = await getSelfControlStatus(config);
  if (!status.available || !status.cliPath) {
    return {
      success: false,
      error: status.reason ?? "SelfControl is unavailable on this machine.",
    };
  }

  if (status.active) {
    return {
      success: false,
      error:
        status.endsAt === null
          ? "A SelfControl block is already running."
          : `A SelfControl block is already running until ${status.endsAt}.`,
      status,
    };
  }

  const endsAt = new Date(
    Date.now() + request.durationMinutes * 60_000,
  ).toISOString();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "milady-selfcontrol-"));
  const blocklistPath = path.join(tempDir, "block.selfcontrol");

  try {
    await writeFile(
      blocklistPath,
      buildSelfControlBlocklistPlist(request.websites),
      "utf8",
    );

    const result = await commandRunner(status.cliPath, [
      "start",
      "--blocklist",
      blocklistPath,
      "--enddate",
      endsAt,
    ]);
    const output = `${result.stdout}\n${result.stderr}`;
    if (!result.ok) {
      return {
        success: false,
        error:
          output.match(/already running/i) !== null
            ? "A SelfControl block is already running."
            : output.trim() || "SelfControl failed to start the block.",
      };
    }

    resetSelfControlStatusCache();
    return {
      success: true,
      endsAt,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function buildSelfControlBlocklistPlist(
  websites: readonly string[],
  blockAsWhitelist = false,
): string {
  const domainsXml = websites
    .map((website) => `    <string>${escapeXml(website)}</string>`)
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    `<dict>`,
    `  <key>HostBlacklist</key>`,
    `  <array>`,
    domainsXml,
    `  </array>`,
    `  <key>BlockAsWhitelist</key>`,
    blockAsWhitelist ? `  <true/>` : `  <false/>`,
    `</dict>`,
    `</plist>`,
    ``,
  ].join("\n");
}

export function parseSelfControlIsRunningOutput(output: string): boolean {
  return /\bYES\b/.test(output);
}

export function parseSelfControlSettingsOutput(output: string): {
  endsAt: string | null;
  websites: string[];
} {
  const endDateMatch = output.match(/BlockEndDate = "([^"]+)";/);
  const blocklistMatch = output.match(/ActiveBlocklist =\s+\(([\s\S]*?)\);\s*/);
  const websites = Array.from(
    blocklistMatch?.[1].matchAll(/"([^"]+)"/g) ?? [],
    (match) => match[1],
  );

  return {
    endsAt:
      typeof endDateMatch?.[1] === "string"
        ? normalizeSelfControlDate(endDateMatch[1])
        : null,
    websites,
  };
}

export function parseSelfControlBlockRequest(
  options?: HandlerOptions,
  message?: Memory,
): { request: SelfControlBlockRequest | null; error?: string } {
  const params = options?.parameters as
    | {
        websites?: string[] | string;
        durationMinutes?: number | string;
      }
    | undefined;

  const websites = normalizeWebsiteTargets(
    normalizeStringList(params?.websites) ??
      extractWebsiteTargetsFromText(getMessageText(message)),
  );

  if (websites.length === 0) {
    return {
      request: null,
      error:
        "Provide at least one public website hostname, such as `x.com` or `twitter.com`.",
    };
  }

  const durationMinutes =
    parseDurationMinutes(params?.durationMinutes) ??
    extractDurationMinutesFromText(getMessageText(message)) ??
    DEFAULT_DURATION_MINUTES;

  if (durationMinutes < 1 || durationMinutes > MAX_BLOCK_MINUTES) {
    return {
      request: null,
      error: `Duration must be between 1 and ${MAX_BLOCK_MINUTES} minutes.`,
    };
  }

  return {
    request: {
      websites,
      durationMinutes,
    },
  };
}

export function normalizeWebsiteTargets(
  rawTargets: readonly string[],
): string[] {
  const deduped = new Set<string>();

  for (const rawTarget of rawTargets) {
    const normalized = normalizeWebsiteTarget(rawTarget);
    if (normalized) {
      deduped.add(normalized);
    }
  }

  return [...deduped];
}

export function formatWebsiteList(websites: readonly string[]): string {
  if (websites.length <= 3) {
    return websites.join(", ");
  }

  const preview = websites.slice(0, 3).join(", ");
  return `${preview}, and ${websites.length - 3} more`;
}

function normalizeWebsiteTarget(rawTarget: string): string | null {
  const trimmed = rawTarget.trim().replace(/[),.!?]+$/g, "");
  if (!trimmed) return null;

  let hostname = trimmed;
  try {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    hostname = new URL(candidate).hostname;
  } catch {
    hostname = trimmed;
  }

  const asciiHostname = domainToASCII(
    hostname.toLowerCase().replace(/\.$/, ""),
  );
  if (!asciiHostname) return null;
  if (asciiHostname === "localhost" || asciiHostname.endsWith(".local")) {
    return null;
  }
  if (!asciiHostname.includes(".")) return null;
  if (isIP(asciiHostname) !== 0) return null;

  const labels = asciiHostname.split(".");
  if (
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !/^[a-z0-9-]+$/.test(label) ||
        label.startsWith("-") ||
        label.endsWith("-"),
    )
  ) {
    return null;
  }

  return asciiHostname;
}

function normalizeStringList(
  value: string[] | string | undefined,
): string[] | null {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return null;
}

function parseDurationMinutes(
  value: number | string | undefined,
): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return null;
}

function extractDurationMinutesFromText(text: string): number | null {
  const match = text.match(
    /\bfor\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|days?)\b/i,
  );
  if (!match) return null;

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = match[2].toLowerCase();
  if (unit.startsWith("day")) {
    return Math.round(amount * 24 * 60);
  }
  if (unit.startsWith("hour") || unit.startsWith("hr")) {
    return Math.round(amount * 60);
  }
  return Math.round(amount);
}

function extractWebsiteTargetsFromText(text: string): string[] {
  return Array.from(
    text.matchAll(
      /\b(?:https?:\/\/[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,})(?=[^\w.-]|$)/gi,
    ),
    (match) => match[0],
  );
}

function getMessageText(message?: Memory): string {
  return typeof message?.content?.text === "string" ? message.content.text : "";
}

function normalizeSelfControlDate(rawDate: string): string | null {
  const normalized = rawDate.replace(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/,
    "$1T$2$3:$4",
  );
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
