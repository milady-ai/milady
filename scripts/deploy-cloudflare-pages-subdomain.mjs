#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

function loadRepoDotenv() {
  const envPath = resolve(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const key = line.slice(0, line.indexOf("=")).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key]) continue;
    let value = line.slice(line.indexOf("=") + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadRepoDotenv();

function usage() {
  return `Usage:
  node scripts/deploy-cloudflare-pages-subdomain.mjs --input-dir <dir> --project-title <title> [options]

Options:
  --project-name <name>       Cloudflare Pages project name. Defaults to milaidy-<bot>-<project>.
  --bot-name <name>           Bot/agent name for the hostname. Defaults to BOT_NAME, AGENT_NAME, or botdick.
  --project-title <title>     Project title slug for the hostname.
  --subdomain <slug>          Backward-compatible alias for --project-title.
  --base-domain <domain>      Domain for the custom hostname. Defaults to PAGES_BASE_DOMAIN or milaidy.agency.
  --branch <branch>           Pages deployment branch. Defaults to production.
  --build-command <command>   Optional build command to run before deployment.
  --skip-domain               Deploy only; do not attach a custom domain.
  --dry-run                   Validate inputs and print the planned actions.

Authentication:
  CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, or an active wrangler login.
`;
}

function parseArgs(argv) {
  const out = {
    baseDomain: process.env.PAGES_BASE_DOMAIN || "milaidy.agency",
    botName: process.env.BOT_NAME || process.env.AGENT_NAME || "botdick",
    branch: "production",
    skipDomain: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      return value;
    };

    if (arg === "--input-dir") out.inputDir = next();
    else if (arg === "--project-name") out.projectName = next();
    else if (arg === "--bot-name") out.botName = next();
    else if (arg === "--project-title") out.projectTitle = next();
    else if (arg === "--subdomain") out.subdomain = next();
    else if (arg === "--base-domain") out.baseDomain = next();
    else if (arg === "--branch") out.branch = next();
    else if (arg === "--build-command") out.buildCommand = next();
    else if (arg === "--skip-domain") out.skipDomain = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return out;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .split(".")
    .map(slugify)
    .filter(Boolean)
    .join(".");
}

function optionalEnv(name) {
  const value = process.env[name]?.trim();
  return value || "";
}

function readWranglerCachedOauthToken() {
  const candidates = [
    resolve(homedir(), "Library/Preferences/.wrangler/config/default.toml"),
    resolve(homedir(), ".wrangler/config/default.toml"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, "utf8");
    const match = content.match(/^oauth_token\s*=\s*"([^"]+)"/m);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  return "";
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    env: process.env,
    encoding: "utf8",
    shell: options.shell || false,
  });

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${result.status}\n${stdout}${stderr}`,
    );
  }
  return `${stdout}${stderr}`;
}

function getWranglerRunner() {
  const bun = spawnSync("bunx", ["--version"], { encoding: "utf8" });
  if (bun.status === 0) {
    return { command: "bunx", prefixArgs: ["wrangler"], cwd: repoRoot };
  }

  const scratch = mkdtempSync(resolve(tmpdir(), "milady-wrangler-"));
  return {
    command: "npx",
    prefixArgs: ["--yes", "wrangler"],
    cwd: scratch,
  };
}

function runWrangler(runner, args) {
  return run(runner.command, [...runner.prefixArgs, ...args], {
    cwd: runner.cwd,
  });
}

function readWranglerJson(runner, args) {
  const output = runWrangler(runner, [...args, "--json"]);
  return JSON.parse(output);
}

function resolveAccountId(runner) {
  const envAccountId = optionalEnv("CLOUDFLARE_ACCOUNT_ID");
  if (envAccountId) return envAccountId;

  const whoami = readWranglerJson(runner, ["whoami"]);
  const accounts =
    whoami.accounts || whoami.memberships || whoami.result?.accounts || [];
  const account = Array.isArray(accounts) ? accounts[0] : undefined;
  const accountId =
    account?.id ||
    account?.account?.id ||
    account?.account_id ||
    whoami.account_id ||
    whoami.result?.account_id;
  if (!accountId) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID and wrangler did not report an account");
  }
  return accountId;
}

function resolveApiToken(runner) {
  const envToken = optionalEnv("CLOUDFLARE_API_TOKEN");
  if (envToken) return envToken;

  const cachedOauthToken = readWranglerCachedOauthToken();
  if (cachedOauthToken) return cachedOauthToken;

  try {
    const auth = readWranglerJson(runner, ["auth", "token"]);
    const token =
      auth.token ||
      auth.access_token ||
      auth.oauth_token ||
      auth.result?.token ||
      auth.result?.access_token;
    if (token) return token;
  } catch {
    // Modern Wrangler OAuth sessions do not expose this command reliably.
  }

  throw new Error(
    "Missing CLOUDFLARE_API_TOKEN and wrangler auth token was unavailable",
  );
}

function listProjects(runner) {
  const output = runWrangler(runner, ["pages", "project", "list", "--json"]);
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.result)) return parsed.result;
  } catch {
    return [];
  }
  return [];
}

async function cloudflareRequest(path, body, token, method = "POST") {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const init = {
    method,
    headers,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const messages = [...(payload.errors || []), ...(payload.messages || [])]
      .map((entry) => entry.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(messages || `Cloudflare API request failed: ${response.status}`);
  }
  return payload;
}

async function ensureDnsRecord({ baseDomain, hostname, target, token }) {
  const zonePayload = await cloudflareRequest(
    `/zones?name=${encodeURIComponent(baseDomain)}`,
    undefined,
    token,
    "GET",
  );
  const zoneId = zonePayload.result?.[0]?.id;
  if (!zoneId) {
    throw new Error(`Cloudflare zone not found for ${baseDomain}`);
  }

  const existingPayload = await cloudflareRequest(
    `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`,
    undefined,
    token,
    "GET",
  );
  const existing = existingPayload.result?.[0];
  const body = {
    type: "CNAME",
    name: hostname,
    content: target,
    proxied: false,
    ttl: 1,
  };

  if (existing?.id) {
    if (existing.content === target && existing.proxied === false) {
      return "already-current";
    }
    await cloudflareRequest(
      `/zones/${zoneId}/dns_records/${existing.id}`,
      body,
      token,
      "PUT",
    );
    return "updated";
  }

  await cloudflareRequest(`/zones/${zoneId}/dns_records`, body, token, "POST");
  return "created";
}

async function retryPagesDomainValidation({ accountId, projectName, hostname, token }) {
  await cloudflareRequest(
    `/accounts/${accountId}/pages/projects/${projectName}/domains/${hostname}`,
    {},
    token,
    "PATCH",
  );
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const payload = await cloudflareRequest(
    `/accounts/${accountId}/pages/projects/${projectName}/domains/${hostname}`,
    undefined,
    token,
    "GET",
  );
  return {
    status: payload.result?.status || "unknown",
    verificationStatus: payload.result?.verification_data?.status || "unknown",
    validationStatus: payload.result?.validation_data?.status || "unknown",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const botSlug = slugify(args.botName);
  const projectSlug = slugify(args.projectTitle || args.subdomain);
  if (!botSlug) throw new Error("Provide a non-empty --bot-name");
  if (!projectSlug) throw new Error("Provide a non-empty --project-title");
  if (botSlug.length > 63) throw new Error("--bot-name slug must be 63 chars or fewer");
  if (projectSlug.length > 63) {
    throw new Error("--project-title slug must be 63 chars or fewer");
  }

  const inputDir = args.inputDir ? resolve(args.inputDir) : "";
  if (!inputDir || !existsSync(inputDir)) {
    throw new Error("--input-dir must point to an existing build output directory");
  }

  const baseDomain = normalizeDomain(args.baseDomain);
  if (!baseDomain || !baseDomain.includes(".")) {
    throw new Error("--base-domain must be a valid domain");
  }
  const projectName = slugify(args.projectName || `milaidy-${botSlug}-${projectSlug}`);
  if (!projectName) throw new Error("Could not derive a Pages project name");

  const hostname = `${botSlug}.${projectSlug}.${baseDomain}`;
  const dnsRecord = args.skipDomain
    ? null
    : {
        type: "CNAME",
        name: `${botSlug}.${projectSlug}`,
        target: `${projectName}.pages.dev`,
        proxyStatus: "DNS only",
      };
  const plan = {
    inputDir,
    projectName,
    botSlug,
    projectSlug,
    branch: args.branch,
    hostname: args.skipDomain ? null : hostname,
    dnsRecord,
    cloudflareEnvReady: Boolean(
      process.env.CLOUDFLARE_ACCOUNT_ID?.trim() &&
        process.env.CLOUDFLARE_API_TOKEN?.trim(),
    ),
    wranglerLoginCanBeUsed: true,
  };

  if (args.dryRun) {
    console.log(JSON.stringify({ dryRun: true, plan }, null, 2));
    return;
  }

  if (args.buildCommand) {
    console.log(`Running build command in ${inputDir}`);
    run(args.buildCommand, [], { cwd: inputDir, shell: true });
  }

  const runner = getWranglerRunner();
  const projects = listProjects(runner);
  const projectExists = projects.some((project) => project.name === projectName);
  if (!projectExists) {
    console.log(`Creating Cloudflare Pages project ${projectName}`);
    try {
      runWrangler(runner, [
        "pages",
        "project",
        "create",
        projectName,
        "--production-branch",
        args.branch,
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exists/i.test(message)) {
        throw error;
      }
      console.log(`Cloudflare Pages project ${projectName} already exists`);
    }
  }

  console.log(`Deploying ${inputDir} to Cloudflare Pages project ${projectName}`);
  const deployOutput = runWrangler(runner, [
    "pages",
    "deploy",
    inputDir,
    "--project-name",
    projectName,
    "--branch",
    args.branch,
  ]);

  let domainStatus = "skipped";
  let dnsStatus = "skipped";
  if (!args.skipDomain) {
    console.log(`Attaching custom domain ${hostname}`);
    const accountId = resolveAccountId(runner);
    const token = resolveApiToken(runner);
    try {
      const payload = await cloudflareRequest(
        `/accounts/${accountId}/pages/projects/${projectName}/domains`,
        { name: hostname },
        token,
      );
      domainStatus = payload.result?.status || "requested";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already|duplicate|exists/i.test(message)) {
        domainStatus = "already-attached";
      } else {
        throw error;
      }
    }

    console.log(`Ensuring DNS CNAME ${hostname} -> ${projectName}.pages.dev`);
    try {
      dnsStatus = await ensureDnsRecord({
        baseDomain,
        hostname,
        target: `${projectName}.pages.dev`,
        token,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/auth|permission|unauthor/i.test(message)) {
        throw error;
      }
      dnsStatus = "skipped-cloudflare-token-missing-dns-permission";
    }

    console.log(`Retrying Pages custom domain validation for ${hostname}`);
    domainStatus = await retryPagesDomainValidation({
      accountId,
      projectName,
      hostname,
      token,
    });
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        projectName,
        pagesUrl: `https://${projectName}.pages.dev`,
        customUrl: args.skipDomain ? null : `https://${hostname}`,
        domainStatus,
        dnsStatus,
        dnsRecord,
        deployOutput: deployOutput
          .split("\n")
          .filter((line) => /https?:\/\//.test(line) || /Success|Uploaded|Deployment/i.test(line))
          .join("\n"),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
