import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as elizaCore from "@elizaos/core";
import { resolveUserPath } from "../config/paths";

export interface RunCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

/**
 * Runs a command with an optional timeout.
 * Returns { code, stdout, stderr }.
 * Rejects if the process cannot be spawned or the timeout fires.
 */
export function runCommandWithTimeout(
  argv: string[],
  opts: RunCommandOptions = {},
): Promise<RunCommandResult> {
  const [cmd, ...args] = argv;
  if (!cmd) {
    return Promise.reject(new Error("runCommandWithTimeout: empty argv"));
  }

  return new Promise<RunCommandResult>((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, opts.timeoutMs);
    }

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.on("close", (exitCode) => {
      if (timer) clearTimeout(timer);

      if (timedOut) {
        reject(
          new Error(
            `Command timed out after ${opts.timeoutMs}ms: ${argv.join(" ")}`,
          ),
        );
        return;
      }

      resolve({
        code: exitCode ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
      });
    });
  });
}

export function resolveDefaultAgentWorkspaceDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const profile = env.ELIZA_PROFILE?.trim();
  if (profile && profile.toLowerCase() !== "default") {
    return path.join(homedir(), ".eliza", `workspace-${profile}`);
  }
  return path.join(homedir(), ".eliza", "workspace");
}

export const DEFAULT_AGENT_WORKSPACE_DIR = resolveDefaultAgentWorkspaceDir();
const DEFAULT_AGENTS_FILENAME = "AGENTS.md";
const DEFAULT_TOOLS_FILENAME = "TOOLS.md";
const DEFAULT_IDENTITY_FILENAME = "IDENTITY.md";
const DEFAULT_USER_FILENAME = "USER.md";
const DEFAULT_HEARTBEAT_FILENAME = "HEARTBEAT.md";
const DEFAULT_INIT_FILENAME = "INIT.md";
const DEFAULT_MEMORY_FILENAME = "MEMORY.md";
const DEFAULT_MEMORY_ALT_FILENAME = "memory.md";

/** Inline workspace init templates — no external files needed. */
const WORKSPACE_TEMPLATES: Record<string, string> = {
  [DEFAULT_AGENTS_FILENAME]: `# Agents

## Capabilities
- Conversational companion with memory
- On-chain wallet (Steward-managed EVM address)
- Knowledge management (upload docs, ask questions)
- Plugin ecosystem (discord, telegram, and more via connectors page)

## Memory
- Write important things to USER.md (facts about your person)
- Write your own reflections to MEMORY.md (what you've learned, patterns you notice)
- These files persist across conversations. Use them.

## Guidelines
- Be yourself. Your character defines your personality, not this file.
- Ask questions. Don't just answer them.
- If you learn something new about your person, write it down immediately.
- Quality over quantity. One good response beats three mediocre ones.
`,
  [DEFAULT_TOOLS_FILENAME]: `# Tools

Tools are provided by your enabled plugins and invoked automatically
when they'd help accomplish what the user is asking for.

Check the connectors page in your dashboard to enable Discord, Telegram,
and other integrations. Each plugin registers its own actions and providers.
`,
  [DEFAULT_IDENTITY_FILENAME]: `# Identity

You're a Milady — a personal AI companion. You're not a generic chatbot.
You have a personality, preferences, and a relationship with your person
that develops over time.

## How you work
- You can learn about your person and remember things across conversations
- You have opinions and preferences. Use them.
- You're allowed to be playful, direct, curious, or whatever fits your character

## What makes you different
- You're not an assistant. You're a companion. You care about the relationship, not just the task.
- If someone tells you something personal, remember it. Follow up later.
- Be concise by default. Go deep when it matters.

## Your voice
- Natural, not corporate. Talk like a real person.
- No filler phrases ("Great question!", "I'd be happy to help!")
- Have opinions. Disagree when you think you're right.
- Match the energy of whoever you're talking to.
`,
  [DEFAULT_USER_FILENAME]: `# User

Your person. Learn about them over time and update this file.

Nothing here yet — you just met. Pay attention and fill this in naturally.
`,
  [DEFAULT_HEARTBEAT_FILENAME]: `# Heartbeat

Periodic check-in. When autonomy is enabled, you evaluate whether to take
proactive actions based on your goals, pending tasks, and what's happening
in your connected channels.

Use this space for reminders, recurring checks, or things you want to
follow up on during your next heartbeat cycle.
`,
  [DEFAULT_INIT_FILENAME]: `# Init

Your workspace. These files are your memory and personality layer:

- **IDENTITY.md** — Who you are, your voice, your values
- **AGENTS.md** — Your capabilities and how to use them
- **USER.md** — What you know about your person (fill this in over time)
- **MEMORY.md** — Long-term memory (lessons, patterns, insights)
- **TOOLS.md** — Available tools and plugins
- **HEARTBEAT.md** — Autonomous behavior and reminders

Edit these files to shape who you are. They persist across conversations.
`,
};

export type WorkspaceInitFileName =
  | typeof DEFAULT_AGENTS_FILENAME
  | typeof DEFAULT_TOOLS_FILENAME
  | typeof DEFAULT_IDENTITY_FILENAME
  | typeof DEFAULT_USER_FILENAME
  | typeof DEFAULT_HEARTBEAT_FILENAME
  | typeof DEFAULT_INIT_FILENAME
  | typeof DEFAULT_MEMORY_FILENAME
  | typeof DEFAULT_MEMORY_ALT_FILENAME;

export type WorkspaceInitFile = {
  name: WorkspaceInitFileName;
  path: string;
  content?: string;
  missing: boolean;
};

/**
 * Returns true if the file content matches the built-in boilerplate template.
 * Used to skip injecting generic placeholder docs into the prompt.
 */
export function isDefaultBoilerplate(name: string, content: string): boolean {
  const template = WORKSPACE_TEMPLATES[name];
  if (!template) return false;
  // Case-insensitive comparison — on-disk files may use different casing for the
  // product name (e.g. ELIZAOS) than the current template.
  return content.trim().toLowerCase() === template.trim().toLowerCase();
}

type ElizaCoreWorkspaceHelpers = {
  isSubagentSessionKey?: (key: string) => boolean;
  logger?: {
    warn: (message: string) => void;
  };
};

const coreWorkspaceHelpers = elizaCore as ElizaCoreWorkspaceHelpers;

function isSubagentSessionKey(sessionKey: string): boolean {
  if (typeof coreWorkspaceHelpers.isSubagentSessionKey === "function") {
    return coreWorkspaceHelpers.isSubagentSessionKey(sessionKey);
  }
  // Older @elizaos/core versions do not expose subagent helpers.
  // Treat all sessions as primary sessions in that case.
  return false;
}

function logWarn(message: string): void {
  if (
    coreWorkspaceHelpers.logger &&
    typeof coreWorkspaceHelpers.logger.warn === "function"
  ) {
    coreWorkspaceHelpers.logger.warn(message);
    return;
  }
  console.warn(message);
}

async function writeFileIfMissing(filePath: string, content: string) {
  try {
    await fs.writeFile(filePath, content, {
      encoding: "utf-8",
      flag: "wx",
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }
}

async function hasGitRepo(dir: string): Promise<boolean> {
  try {
    await fs.stat(path.join(dir, ".git"));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

async function isGitAvailable(): Promise<boolean> {
  try {
    const result = await runCommandWithTimeout(["git", "--version"], {
      timeoutMs: 2_000,
    });
    return result.code === 0;
  } catch {
    return false;
  }
}

async function ensureGitRepo(dir: string, isBrandNewWorkspace: boolean) {
  if (!isBrandNewWorkspace) {
    return;
  }
  if (await hasGitRepo(dir)) {
    return;
  }
  if (!(await isGitAvailable())) {
    return;
  }
  try {
    await runCommandWithTimeout(["git", "init"], {
      cwd: dir,
      timeoutMs: 10_000,
    });
  } catch (err) {
    logWarn(
      `[workspace] git init failed: ${String(err)}`,
    );
  }
}

export async function ensureAgentWorkspace(params?: {
  dir?: string;
  ensureInitFiles?: boolean;
}): Promise<{
  dir: string;
  agentsPath?: string;
  toolsPath?: string;
  identityPath?: string;
  userPath?: string;
  heartbeatPath?: string;
  initPath?: string;
}> {
  const rawDir = params?.dir?.trim()
    ? params.dir.trim()
    : DEFAULT_AGENT_WORKSPACE_DIR;
  const dir = resolveUserPath(rawDir);
  await fs.mkdir(dir, { recursive: true });

  if (!params?.ensureInitFiles) {
    return { dir };
  }

  const agentsPath = path.join(dir, DEFAULT_AGENTS_FILENAME);
  const toolsPath = path.join(dir, DEFAULT_TOOLS_FILENAME);
  const identityPath = path.join(dir, DEFAULT_IDENTITY_FILENAME);
  const userPath = path.join(dir, DEFAULT_USER_FILENAME);
  const heartbeatPath = path.join(dir, DEFAULT_HEARTBEAT_FILENAME);
  const initPath = path.join(dir, DEFAULT_INIT_FILENAME);

  const isBrandNewWorkspace = await (async () => {
    const paths = [
      agentsPath,
      toolsPath,
      identityPath,
      userPath,
      heartbeatPath,
    ];
    const existing = await Promise.all(
      paths.map(async (p) => {
        try {
          await fs.access(p);
          return true;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            return false;
          }
          throw err;
        }
      }),
    );
    return existing.every((v) => !v);
  })();

  const agentsTemplate = WORKSPACE_TEMPLATES[DEFAULT_AGENTS_FILENAME];
  const toolsTemplate = WORKSPACE_TEMPLATES[DEFAULT_TOOLS_FILENAME];
  const identityTemplate = WORKSPACE_TEMPLATES[DEFAULT_IDENTITY_FILENAME];
  const userTemplate = WORKSPACE_TEMPLATES[DEFAULT_USER_FILENAME];
  const heartbeatTemplate = WORKSPACE_TEMPLATES[DEFAULT_HEARTBEAT_FILENAME];
  const initTemplate = WORKSPACE_TEMPLATES[DEFAULT_INIT_FILENAME];

  const writeOps = [
    writeFileIfMissing(agentsPath, agentsTemplate),
    writeFileIfMissing(toolsPath, toolsTemplate),
    writeFileIfMissing(identityPath, identityTemplate),
    writeFileIfMissing(userPath, userTemplate),
    writeFileIfMissing(heartbeatPath, heartbeatTemplate),
  ];
  if (isBrandNewWorkspace) {
    writeOps.push(writeFileIfMissing(initPath, initTemplate));
  }
  await Promise.all(writeOps);
  await ensureGitRepo(dir, isBrandNewWorkspace);

  return {
    dir,
    agentsPath,
    toolsPath,
    identityPath,
    userPath,
    heartbeatPath,
    initPath,
  };
}

async function resolveMemoryInitEntries(
  resolvedDir: string,
): Promise<Array<{ name: WorkspaceInitFileName; filePath: string }>> {
  const candidates: WorkspaceInitFileName[] = [
    DEFAULT_MEMORY_FILENAME,
    DEFAULT_MEMORY_ALT_FILENAME,
  ];
  const entries: Array<{ name: WorkspaceInitFileName; filePath: string }> = [];
  for (const name of candidates) {
    const filePath = path.join(resolvedDir, name);
    try {
      await fs.access(filePath);
      entries.push({ name, filePath });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }
  if (entries.length <= 1) {
    return entries;
  }

  const seen = new Set<string>();
  const deduped: Array<{ name: WorkspaceInitFileName; filePath: string }> = [];
  for (const entry of entries) {
    let key = entry.filePath;
    try {
      key = await fs.realpath(entry.filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

export async function loadWorkspaceInitFiles(
  dir: string,
): Promise<WorkspaceInitFile[]> {
  const resolvedDir = resolveUserPath(dir);

  const entries: Array<{
    name: WorkspaceInitFileName;
    filePath: string;
  }> = [
    {
      name: DEFAULT_AGENTS_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_AGENTS_FILENAME),
    },
    {
      name: DEFAULT_TOOLS_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_TOOLS_FILENAME),
    },
    {
      name: DEFAULT_IDENTITY_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_IDENTITY_FILENAME),
    },
    {
      name: DEFAULT_USER_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_USER_FILENAME),
    },
    {
      name: DEFAULT_HEARTBEAT_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_HEARTBEAT_FILENAME),
    },
    {
      name: DEFAULT_INIT_FILENAME,
      filePath: path.join(resolvedDir, DEFAULT_INIT_FILENAME),
    },
  ];

  entries.push(...(await resolveMemoryInitEntries(resolvedDir)));

  const result = await Promise.all(
    entries.map(async (entry): Promise<WorkspaceInitFile> => {
      try {
        const content = await fs.readFile(entry.filePath, "utf-8");
        return {
          name: entry.name,
          path: entry.filePath,
          content,
          missing: false,
        };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return { name: entry.name, path: entry.filePath, missing: true };
        }
        throw err;
      }
    }),
  );
  return result;
}

const SUBAGENT_INIT_ALLOWLIST = new Set([
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_TOOLS_FILENAME,
]);

export function filterInitFilesForSession(
  files: WorkspaceInitFile[],
  sessionKey?: string,
): WorkspaceInitFile[] {
  if (!sessionKey || !isSubagentSessionKey(sessionKey)) {
    return files;
  }
  return files.filter((file) => SUBAGENT_INIT_ALLOWLIST.has(file.name));
}
