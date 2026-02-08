import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "@elizaos/core";

const execFileAsync = promisify(execFile);

const SKILLSMP_BASE_URL = "https://skillsmp.com";
const VALID_NAME = /^[a-zA-Z0-9._-]+$/;

export interface SkillsMarketplaceSearchItem {
  id: string;
  name: string;
  description: string;
  repository: string;
  githubUrl: string;
  path: string | null;
  tags: string[];
  score: number | null;
  source: "skillsmp";
}

export interface InstalledMarketplaceSkill {
  id: string;
  name: string;
  description: string;
  repository: string;
  githubUrl: string;
  path: string;
  installPath: string;
  installedAt: string;
  source: "skillsmp" | "manual";
}

export interface InstallSkillInput {
  githubUrl?: string;
  repository?: string;
  path?: string;
  name?: string;
  description?: string;
  source?: "skillsmp" | "manual";
}

function stateDirBase(): string {
  const base = process.env.MILAIDY_STATE_DIR?.trim();
  return base || path.join(os.homedir(), ".milaidy");
}

function safeName(raw: string): string {
  const trimmed = raw.trim();
  const slug = trimmed.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("Invalid skill name");
  if (!VALID_NAME.test(slug)) throw new Error(`Invalid skill name: ${raw}`);
  return slug;
}

function normalizeRepo(raw: string): string {
  const repo = raw
    .replace(/^https:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^github:/i, "")
    .trim();
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo)) {
    throw new Error(`Invalid repository: ${raw}`);
  }
  return repo;
}

function parseGithubUrl(rawUrl: string): { repository: string; path: string | null; ref: string | null } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid GitHub URL");
  }

  if (url.hostname !== "github.com") {
    throw new Error("Only github.com URLs are supported for skill install");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("GitHub URL must include owner/repo");
  }

  const repository = normalizeRepo(`${parts[0]}/${parts[1]}`);

  if (parts[2] === "tree" && parts.length >= 5) {
    const ref = parts[3];
    const treePath = parts.slice(4).join("/");
    return { repository, path: treePath || null, ref: ref || null };
  }

  return { repository, path: null, ref: null };
}

function installationRoot(workspaceDir: string): string {
  return path.join(workspaceDir, "skills", ".marketplace");
}

function installsRecordPath(workspaceDir: string): string {
  return path.join(workspaceDir, "skills", ".cache", "marketplace-installs.json");
}

async function ensureInstallDirs(workspaceDir: string): Promise<void> {
  await fs.mkdir(installationRoot(workspaceDir), { recursive: true });
  await fs.mkdir(path.dirname(installsRecordPath(workspaceDir)), { recursive: true });
}

async function readInstallRecords(workspaceDir: string): Promise<Record<string, InstalledMarketplaceSkill>> {
  try {
    const raw = await fs.readFile(installsRecordPath(workspaceDir), "utf-8");
    const parsed = JSON.parse(raw) as Record<string, InstalledMarketplaceSkill>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

async function writeInstallRecords(
  workspaceDir: string,
  records: Record<string, InstalledMarketplaceSkill>,
): Promise<void> {
  await ensureInstallDirs(workspaceDir);
  await fs.writeFile(installsRecordPath(workspaceDir), JSON.stringify(records, null, 2), "utf-8");
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => String(t ?? "").trim())
    .filter((t) => t.length > 0)
    .slice(0, 10);
}

function inferRepository(skill: Record<string, unknown>): string | null {
  const candidates = [
    skill.repository,
    skill.repo,
    skill.gitRepo,
    skill.github,
    skill.githubRepo,
    (skill.git as Record<string, unknown> | undefined)?.repo,
  ];

  for (const value of candidates) {
    if (typeof value !== "string" || !value.trim()) continue;
    try {
      return normalizeRepo(value);
    } catch {
      continue;
    }
  }

  // Try to extract repository from githubUrl (e.g., https://github.com/owner/repo/tree/...)
  const githubUrl = skill.githubUrl;
  if (typeof githubUrl === "string" && githubUrl.includes("github.com")) {
    try {
      const url = new URL(githubUrl);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        return normalizeRepo(`${parts[0]}/${parts[1]}`);
      }
    } catch {
      // ignore parse errors
    }
  }

  return null;
}

function inferPath(skill: Record<string, unknown>): string | null {
  const candidates = [skill.path, skill.skillPath, skill.installPath, skill.directory];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const cleaned = value.replace(/^\/+/, "").trim();
    if (cleaned && !cleaned.startsWith("..")) return cleaned;
  }

  // Try to extract path from githubUrl (e.g., https://github.com/owner/repo/tree/main/skills/content-marketer)
  const githubUrl = skill.githubUrl;
  if (typeof githubUrl === "string" && githubUrl.includes("/tree/")) {
    const treeIndex = githubUrl.indexOf("/tree/");
    const afterTree = githubUrl.slice(treeIndex + 6); // skip "/tree/"
    // afterTree = "main/skills/content-marketer" → skip the branch, take the rest
    const slashIndex = afterTree.indexOf("/");
    if (slashIndex !== -1) {
      const pathPart = afterTree.slice(slashIndex + 1);
      if (pathPart && !pathPart.startsWith("..")) return pathPart;
    }
  }

  return null;
}

function inferName(skill: Record<string, unknown>, repository: string): string {
  const candidates = [skill.slug, skill.name, skill.id, skill.title];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const cleaned = value.trim();
    if (cleaned) return cleaned;
  }
  return repository.split("/").pop() || repository;
}

function inferDescription(skill: Record<string, unknown>): string {
  const candidates = [skill.description, skill.summary, skill.shortDescription];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export async function searchSkillsMarketplace(
  query: string,
  opts?: { limit?: number; aiSearch?: boolean },
): Promise<SkillsMarketplaceSearchItem[]> {
  const apiKey = process.env.SKILLSMP_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("SKILLSMP_API_KEY is not set. Add it to enable Skills marketplace search.");
  }

  const endpoint = opts?.aiSearch ? "/api/v1/skills/ai-search" : "/api/v1/skills/search";
  const url = new URL(`${SKILLSMP_BASE_URL}${endpoint}`);
  if (query.trim()) url.searchParams.set("q", query.trim());
  url.searchParams.set("limit", String(Math.max(1, Math.min(opts?.limit ?? 20, 50))));

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  const payload = await resp.json().catch(() => ({})) as Record<string, unknown>;

  if (!resp.ok) {
    const msg = (payload.error as Record<string, unknown> | undefined)?.message;
    throw new Error(typeof msg === "string" && msg ? msg : `Skills marketplace request failed (${resp.status})`);
  }

  const buckets = [payload.results, payload.skills, payload.data];
  let list: unknown[] = [];
  for (const bucket of buckets) {
    if (Array.isArray(bucket)) {
      list = bucket;
      break;
    }
    if (bucket && typeof bucket === "object" && Array.isArray((bucket as Record<string, unknown>).results)) {
      list = (bucket as Record<string, unknown>).results as unknown[];
      break;
    }
    if (bucket && typeof bucket === "object" && Array.isArray((bucket as Record<string, unknown>).skills)) {
      list = (bucket as Record<string, unknown>).skills as unknown[];
      break;
    }
  }

  const out: SkillsMarketplaceSearchItem[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const skill = entry as Record<string, unknown>;
    const repository = inferRepository(skill);
    if (!repository) continue;
    const name = inferName(skill, repository);
    const description = inferDescription(skill);
    const skillPath = inferPath(skill);
    const scoreValue = skill.score;
    const score = typeof scoreValue === "number" && Number.isFinite(scoreValue) ? scoreValue : null;

    out.push({
      id: String(skill.id ?? skill.slug ?? name),
      name,
      description,
      repository,
      githubUrl: `https://github.com/${repository}`,
      path: skillPath,
      tags: normalizeTags(skill.tags ?? skill.topics),
      score,
      source: "skillsmp",
    });
  }

  return out;
}

async function runGitCloneSubset(
  repository: string,
  ref: string,
  skillPath: string,
  targetDir: string,
): Promise<void> {
  const tmpBase = await fs.mkdtemp(path.join(stateDirBase(), "skill-install-"));
  const cloneDir = path.join(tmpBase, "repo");
  const repoUrl = `https://github.com/${repository}.git`;

  try {
    await execFileAsync("git", ["clone", "--depth", "1", "--filter=blob:none", "--sparse", "--branch", ref, repoUrl, cloneDir]);
    await execFileAsync("git", ["-C", cloneDir, "sparse-checkout", "set", skillPath]);

    const sourceDir = path.join(cloneDir, skillPath);
    const stat = await fs.stat(sourceDir).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      throw new Error(`Skill path not found in repository: ${skillPath}`);
    }

    await fs.mkdir(path.dirname(targetDir), { recursive: true });
    await fs.cp(sourceDir, targetDir, { recursive: true, errorOnExist: true, force: false });
  } finally {
    await fs.rm(tmpBase, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function resolveSkillPathInRepo(repository: string, ref: string, requestedPath: string | null): Promise<string> {
  if (requestedPath) return requestedPath.replace(/^\/+/, "");

  const tmpBase = await fs.mkdtemp(path.join(stateDirBase(), "skill-probe-"));
  const cloneDir = path.join(tmpBase, "repo");
  const repoUrl = `https://github.com/${repository}.git`;

  try {
    await execFileAsync("git", ["clone", "--depth", "1", "--filter=blob:none", "--sparse", "--branch", ref, repoUrl, cloneDir]);
    await execFileAsync("git", ["-C", cloneDir, "sparse-checkout", "set", "."]);

    const rootSkill = path.join(cloneDir, "SKILL.md");
    const hasRoot = await fs.stat(rootSkill).then((s) => s.isFile()).catch(() => false);
    if (hasRoot) return ".";

    const skillsDir = path.join(cloneDir, "skills");
    const entries = await fs.readdir(skillsDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(skillsDir, entry.name, "SKILL.md");
      const exists = await fs.stat(candidate).then((s) => s.isFile()).catch(() => false);
      if (exists) return path.posix.join("skills", entry.name);
    }

    throw new Error("Could not determine skill path automatically. Provide an explicit GitHub tree URL or path.");
  } finally {
    await fs.rm(tmpBase, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function installMarketplaceSkill(
  workspaceDir: string,
  input: InstallSkillInput,
): Promise<InstalledMarketplaceSkill> {
  await ensureInstallDirs(workspaceDir);

  let repository = input.repository?.trim() ? normalizeRepo(input.repository) : null;
  let requestedPath = input.path?.trim() ? input.path.trim().replace(/^\/+/, "") : null;
  let gitRef = "main";

  if (input.githubUrl?.trim()) {
    const parsed = parseGithubUrl(input.githubUrl.trim());
    repository = parsed.repository;
    if (!requestedPath && parsed.path) requestedPath = parsed.path;
    if (parsed.ref) gitRef = parsed.ref;
  }

  if (!repository) {
    throw new Error("Install requires a repository or GitHub URL");
  }

  const skillPath = await resolveSkillPathInRepo(repository, gitRef, requestedPath);
  const baseName = input.name?.trim() || path.posix.basename(skillPath === "." ? repository.split("/")[1] : skillPath);
  const id = safeName(baseName);
  const targetDir = path.join(installationRoot(workspaceDir), id);

  const exists = await fs.stat(targetDir).then(() => true).catch(() => false);
  if (exists) {
    throw new Error(`Skill "${id}" is already installed`);
  }

  await runGitCloneSubset(repository, gitRef, skillPath, targetDir);

  const skillDoc = path.join(targetDir, "SKILL.md");
  const validSkill = await fs.stat(skillDoc).then((s) => s.isFile()).catch(() => false);
  if (!validSkill) {
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => undefined);
    throw new Error("Installed path does not contain SKILL.md");
  }

  const record: InstalledMarketplaceSkill = {
    id,
    name: input.name?.trim() || id,
    description: input.description?.trim() || "",
    repository,
    githubUrl: `https://github.com/${repository}`,
    path: skillPath,
    installPath: targetDir,
    installedAt: new Date().toISOString(),
    source: input.source ?? "manual",
  };

  const records = await readInstallRecords(workspaceDir);
  records[id] = record;
  await writeInstallRecords(workspaceDir, records);

  logger.info(`[skills-marketplace] Installed ${record.id} from ${record.repository}:${record.path}`);
  return record;
}

export async function listInstalledMarketplaceSkills(workspaceDir: string): Promise<InstalledMarketplaceSkill[]> {
  const records = await readInstallRecords(workspaceDir);
  const values = Object.values(records);
  values.sort((a, b) => b.installedAt.localeCompare(a.installedAt));
  return values;
}

export async function uninstallMarketplaceSkill(workspaceDir: string, skillId: string): Promise<InstalledMarketplaceSkill> {
  const id = safeName(skillId);
  const records = await readInstallRecords(workspaceDir);
  const existing = records[id];
  if (!existing) {
    throw new Error(`Installed marketplace skill "${id}" not found`);
  }

  // Security: ensure installPath is within the expected marketplace directory
  const expectedRoot = path.resolve(installationRoot(workspaceDir));
  const resolvedPath = path.resolve(existing.installPath);
  if (!resolvedPath.startsWith(`${expectedRoot}${path.sep}`) || resolvedPath === expectedRoot) {
    throw new Error(`Refusing to remove skill outside ${expectedRoot}`);
  }

  await fs.rm(existing.installPath, { recursive: true, force: true });
  delete records[id];
  await writeInstallRecords(workspaceDir, records);

  logger.info(`[skills-marketplace] Uninstalled ${id}`);
  return existing;
}
