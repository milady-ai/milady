import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDirManager } from "../test/helpers/temp-dir";
import {
  resolveWorkspaceDefaultSkillsSourceDir,
  syncWorkspaceDefaultSkills,
} from "./sync-workspace-default-skills.mjs";

function writeSkill(
  repoRoot: string,
  skillId: string,
  body = "# test skill\n",
) {
  const skillDir = path.join(
    repoRoot,
    "eliza",
    "packages",
    "skills",
    "skills",
    skillId,
  );
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${skillId}\ndescription: test\n---\n\n${body}`,
    "utf8",
  );
  fs.writeFileSync(path.join(skillDir, "notes.md"), "notes", "utf8");
}

const { makeTempDir, cleanupTempDirs } = createTempDirManager("milady-skills-");

afterEach(() => {
  cleanupTempDirs();
});

describe("sync-workspace-default-skills", () => {
  it("prefers the repo-local bundled skills tree", () => {
    const repoRoot = makeTempDir();
    writeSkill(repoRoot, "eliza-cloud");

    const sourceDir = resolveWorkspaceDefaultSkillsSourceDir(repoRoot);

    expect(sourceDir).toBe(
      path.join(repoRoot, "eliza", "packages", "skills", "skills"),
    );
  });

  it("copies bundled skills into the hidden workspace defaults dir", () => {
    const repoRoot = makeTempDir();
    writeSkill(repoRoot, "eliza-cloud");
    writeSkill(repoRoot, "elizaos");

    const result = syncWorkspaceDefaultSkills({ repoRoot });

    expect(result.syncedSkillIds).toEqual(["eliza-cloud", "elizaos"]);
    expect(
      fs.readFileSync(
        path.join(repoRoot, "skills", ".defaults", "eliza-cloud", "SKILL.md"),
        "utf8",
      ),
    ).toContain("name: eliza-cloud");
    expect(
      fs.existsSync(
        path.join(repoRoot, "skills", ".defaults", "elizaos", "notes.md"),
      ),
    ).toBe(true);
  });
});
