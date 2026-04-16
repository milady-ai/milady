import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ModelType,
  type IAgentRuntime,
  type Memory,
  logger,
} from "@elizaos/core";

interface WorkspaceSummary {
  id?: string;
  label?: string;
  repo?: string;
  branch?: string;
  path: string;
}

interface KnownRepo {
  name: string;
  path: string;
  description: string;
}

interface WorkspaceServiceLike {
  listWorkspaces: () => WorkspaceSummary[];
}

type RuntimeWithServices = IAgentRuntime & {
  getService: (name: string) => unknown;
};

export interface WorkspaceDecision {
  path: string;
  created: boolean;
  reason: string;
}

const WORKSPACE_BASE = path.join(os.homedir(), ".milady", "workspaces");
const MAX_WORKSPACES_IN_PROMPT = 12;
const SLUG_MAX_LEN = 40;

function discoverKnownRepos(): KnownRepo[] {
  const repos: KnownRepo[] = [];
  const cwd = process.cwd();
  try {
    const rootPkgPath = path.join(cwd, "package.json");
    if (fs.existsSync(rootPkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8")) as {
        name?: string;
        description?: string;
      };
      repos.push({
        name: pkg.name ?? path.basename(cwd),
        path: cwd,
        description:
          pkg.description ??
          "main repository (milady-fisbat: runtime, CLI, UI, connectors)",
      });
    }
  } catch {
    /* ignore */
  }

  const pluginsDir = path.join(cwd, "plugins");
  try {
    if (fs.existsSync(pluginsDir)) {
      for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const pluginPath = path.join(pluginsDir, entry.name);
        const pkgJson = path.join(pluginPath, "package.json");
        if (!fs.existsSync(pkgJson)) continue;
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf-8")) as {
            name?: string;
            description?: string;
          };
          repos.push({
            name: pkg.name ?? entry.name,
            path: pluginPath,
            description:
              pkg.description ?? `Plugin: ${pkg.name ?? entry.name}`,
          });
        } catch {
          /* skip unreadable package.json */
        }
      }
    }
  } catch {
    /* ignore */
  }

  return repos;
}

function describeKnownRepoForPrompt(repo: KnownRepo, idx: number): string {
  return `${idx + 1}. ${repo.name} | path=${repo.path} | ${repo.description}`;
}

function matchRepoByIntentPath(
  intent: string,
  knownRepos: KnownRepo[],
): KnownRepo | null {
  if (!intent || knownRepos.length === 0) return null;
  const lower = intent.toLowerCase();
  let best: { repo: KnownRepo; score: number } | null = null;
  for (const repo of knownRepos) {
    const basename = path.basename(repo.path).toLowerCase();
    const pkgShort = repo.name.toLowerCase().replace(/^@[^/]+\//, "");
    const candidates = [basename, pkgShort].filter(
      (c) => c.length >= 4 && !/^(src|plugins|packages|app|dist)$/.test(c),
    );
    for (const candidate of candidates) {
      if (lower.includes(candidate)) {
        const score = candidate.length;
        if (!best || score > best.score) best = { repo, score };
      }
    }
  }
  return best?.repo ?? null;
}

function extractIntentText(message: Memory, fallback?: string): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    const text = (content as Record<string, unknown>).text;
    if (typeof text === "string" && text.trim()) return text;
    const task = (content as Record<string, unknown>).task;
    if (typeof task === "string" && task.trim()) return task;
  }
  return fallback ?? "";
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, SLUG_MAX_LEN)
    .replace(/^-+|-+$/g, "");
  return base || `project-${Date.now().toString(36)}`;
}

function uniqueWorkspacePath(slug: string): string {
  let candidate = path.join(WORKSPACE_BASE, slug);
  if (!fs.existsSync(candidate)) return candidate;
  let n = 2;
  while (fs.existsSync(path.join(WORKSPACE_BASE, `${slug}-${n}`))) {
    n += 1;
  }
  return path.join(WORKSPACE_BASE, `${slug}-${n}`);
}

function ensureWorkspaceDir(absPath: string): void {
  fs.mkdirSync(absPath, { recursive: true });
}

function listExistingWorkspaces(
  runtime: IAgentRuntime,
): WorkspaceSummary[] {
  try {
    const service = (runtime as RuntimeWithServices).getService(
      "CODING_WORKSPACE_SERVICE",
    ) as unknown as WorkspaceServiceLike | undefined;
    if (!service?.listWorkspaces) return [];
    return service.listWorkspaces().slice(-MAX_WORKSPACES_IN_PROMPT);
  } catch {
    return [];
  }
}

function describeWorkspaceForPrompt(ws: WorkspaceSummary, idx: number): string {
  const bits = [`${idx + 1}. ${ws.label ?? path.basename(ws.path)}`];
  if (ws.repo) bits.push(`repo=${ws.repo}`);
  if (ws.branch) bits.push(`branch=${ws.branch}`);
  bits.push(`path=${ws.path}`);
  return bits.join(" | ");
}

interface WorkspaceLLMDecision {
  index: number | null;
  repoIndex: number | null;
  newSlug: string | null;
  reason: string;
}

async function llmChooseWorkspace(
  runtime: IAgentRuntime,
  intent: string,
  existing: WorkspaceSummary[],
  knownRepos: KnownRepo[],
): Promise<WorkspaceLLMDecision> {
  const existingList =
    existing.length > 0
      ? existing.map((ws, idx) => describeWorkspaceForPrompt(ws, idx)).join("\n")
      : "(none)";

  const knownRepoList =
    knownRepos.length > 0
      ? knownRepos
          .map((repo, idx) => describeKnownRepoForPrompt(repo, idx))
          .join("\n")
      : "(none)";

  const prompt = [
    "You are deciding which working directory a coding sub-agent should run in.",
    "",
    "USER INTENT:",
    intent || "(no explicit task text)",
    "",
    "KNOWN REPOSITORIES (real source trees — pick one of these when the user's intent is to edit, fix, refactor, or extend an existing codebase, INCLUDING this assistant's own code):",
    knownRepoList,
    "",
    "EXISTING SCRATCH WORKSPACES (prior ad-hoc projects under ~/.milady/workspaces):",
    existingList,
    "",
    "Decision priority:",
    "1. If the intent is a SELF-MODIFICATION or a change to an existing project the user names/describes,",
    "   and a KNOWN REPOSITORY matches, pick that repo (repoIndex).",
    "   Examples: 'fix a bug in the coordinator', 'add a new plugin', 'update the CLI',",
    "   'improve your own workspace logic', 'refactor the agent orchestrator'.",
    "2. If the intent clearly continues a prior scratch workspace (same slug, same project), reuse it (reuseIndex).",
    "3. Otherwise, it's a fresh scratch idea — propose a NEW slug (newSlug).",
    "",
    "Respond with a single JSON object only, no prose:",
    '{"repoIndex": <number or null>, "reuseIndex": <number or null>, "newSlug": <string or null>, "reason": <short string>}',
    "",
    "Rules:",
    "- Exactly ONE of repoIndex / reuseIndex / newSlug must be non-null.",
    "- newSlug: lowercase-kebab-case, under 40 chars, no paths.",
    "- reason: one sentence, why this choice.",
    "- Prefer a KNOWN REPOSITORY when the intent mentions editing an existing file, fixing a bug,",
    "  or modifying this assistant itself — do NOT spawn a scratch dir for self-modification.",
  ].join("\n");

  try {
    const raw = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
      temperature: 0.2,
      maxTokens: 200,
    });
    const text = typeof raw === "string" ? raw.trim() : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return {
        index: null,
        repoIndex: null,
        newSlug: null,
        reason: "no-json-from-llm",
      };
    }
    const parsed = JSON.parse(match[0]) as {
      reuseIndex?: unknown;
      repoIndex?: unknown;
      newSlug?: unknown;
      reason?: unknown;
    };
    const reuseIndex =
      typeof parsed.reuseIndex === "number" &&
      Number.isInteger(parsed.reuseIndex) &&
      parsed.reuseIndex >= 0 &&
      parsed.reuseIndex < existing.length
        ? parsed.reuseIndex
        : null;
    const repoIndex =
      typeof parsed.repoIndex === "number" &&
      Number.isInteger(parsed.repoIndex) &&
      parsed.repoIndex >= 0 &&
      parsed.repoIndex < knownRepos.length
        ? parsed.repoIndex
        : null;
    const newSlug =
      typeof parsed.newSlug === "string" && parsed.newSlug.trim().length > 0
        ? slugify(parsed.newSlug)
        : null;
    const reason =
      typeof parsed.reason === "string" ? parsed.reason : "(llm-decision)";
    return { index: reuseIndex, repoIndex, newSlug, reason };
  } catch (err) {
    logger?.warn(
      { err },
      "[coding-workspace-intelligence] LLM decision failed, falling back",
    );
    return {
      index: null,
      repoIndex: null,
      newSlug: null,
      reason: "llm-error",
    };
  }
}

/**
 * Decide which workspace a coding sub-agent should cd into before running.
 * Called from a wrapper around SPAWN_AGENT / CREATE_TASK when no explicit
 * workdir was provided. The goal is to replace the "pick most recent
 * workspace" fallback with an LLM-reasoned reuse-or-create decision.
 */
export async function decideSubAgentWorkspace(
  runtime: IAgentRuntime,
  message: Memory,
  params: Record<string, unknown> | undefined,
): Promise<WorkspaceDecision | null> {
  const explicit =
    (typeof params?.workdir === "string" ? params.workdir : undefined) ??
    (typeof (message.content as Record<string, unknown>)?.workdir === "string"
      ? ((message.content as Record<string, unknown>).workdir as string)
      : undefined);
  if (explicit && explicit.trim().length > 0) return null;

  const intent = extractIntentText(
    message,
    typeof params?.task === "string" ? params.task : undefined,
  ).trim();
  const existing = listExistingWorkspaces(runtime);
  const knownRepos = discoverKnownRepos();

  const directRepoMatch = matchRepoByIntentPath(intent, knownRepos);
  if (directRepoMatch) {
    return {
      path: path.resolve(directRepoMatch.path),
      created: false,
      reason: `repo:${directRepoMatch.name} — matched by path in intent`,
    };
  }

  const decision = await llmChooseWorkspace(
    runtime,
    intent,
    existing,
    knownRepos,
  );

  if (decision.repoIndex !== null) {
    const chosen = knownRepos[decision.repoIndex];
    return {
      path: path.resolve(chosen.path),
      created: false,
      reason: `repo:${chosen.name} — ${decision.reason}`,
    };
  }

  if (decision.index !== null) {
    const chosen = existing[decision.index];
    return {
      path: path.resolve(chosen.path),
      created: false,
      reason: decision.reason,
    };
  }

  const slug = decision.newSlug ?? slugify(intent);
  ensureWorkspaceDir(WORKSPACE_BASE);
  const target = uniqueWorkspacePath(slug);
  ensureWorkspaceDir(target);
  return {
    path: target,
    created: true,
    reason: decision.reason,
  };
}
