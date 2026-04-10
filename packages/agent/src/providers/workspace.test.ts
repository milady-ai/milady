/**
 * Tests for workspace resolution and boilerplate detection.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isDefaultBoilerplate,
  resolveDefaultAgentWorkspaceDir,
} from "./workspace";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("resolveDefaultAgentWorkspaceDir", () => {
  it("prefers an explicit workspace env override", () => {
    const workspaceDir = makeTempDir("workspace-override-");

    expect(
      resolveDefaultAgentWorkspaceDir({
        MILADY_WORKSPACE_DIR: workspaceDir,
      } as NodeJS.ProcessEnv),
    ).toBe(workspaceDir);
  });

  it("uses the runtime cwd when it looks like a project workspace", () => {
    const workspaceDir = makeTempDir("workspace-cwd-");
    writeFileSync(path.join(workspaceDir, "package.json"), "{}", "utf8");
    mkdirSync(path.join(workspaceDir, "skills"), { recursive: true });

    expect(
      resolveDefaultAgentWorkspaceDir(
        {} as NodeJS.ProcessEnv,
        () => os.homedir(),
        () => workspaceDir,
      ),
    ).toBe(workspaceDir);
  });

  it("falls back to the state-dir workspace for packaged runtime directories", () => {
    const homeDir = makeTempDir("workspace-home-");
    const packagedDir = path.join(
      homeDir,
      "Milady.app",
      "Contents",
      "Resources",
      "app",
      "milady-dist",
    );
    mkdirSync(packagedDir, { recursive: true });
    writeFileSync(path.join(packagedDir, "package.json"), "{}", "utf8");

    expect(
      resolveDefaultAgentWorkspaceDir(
        {} as NodeJS.ProcessEnv,
        () => homeDir,
        () => packagedDir,
      ),
    ).toBe(path.join(homeDir, ".milady", "workspace"));
  });

  it("keeps explicit state-dir isolation ahead of runtime cwd inference", () => {
    const workspaceDir = makeTempDir("workspace-state-cwd-");
    const stateDir = makeTempDir("workspace-state-root-");
    writeFileSync(path.join(workspaceDir, "package.json"), "{}", "utf8");

    expect(
      resolveDefaultAgentWorkspaceDir(
        {
          ELIZA_STATE_DIR: stateDir,
        } as NodeJS.ProcessEnv,
        () => os.homedir(),
        () => workspaceDir,
      ),
    ).toBe(path.join(stateDir, "workspace"));
  });
});

describe("isDefaultBoilerplate", () => {
  it("returns true for exact default AGENTS.md content", () => {
    const content = `# Agents

You are an autonomous AI agent powered by elizaOS.

## Capabilities

- Respond to user messages conversationally
- Execute actions and use available tools
- Access and manage knowledge from your workspace
- Maintain context across conversations

## Guidelines

- Be helpful, concise, and accurate
- Ask for clarification when instructions are ambiguous
- Use tools when they would help accomplish the user's goal
- Respect the user's preferences and communication style
`;
    expect(isDefaultBoilerplate("AGENTS.md", content)).toBe(true);
  });

  it("returns true when content has extra whitespace around it", () => {
    const content = `
  # Agents

You are an autonomous AI agent powered by elizaOS.

## Capabilities

- Respond to user messages conversationally
- Execute actions and use available tools
- Access and manage knowledge from your workspace
- Maintain context across conversations

## Guidelines

- Be helpful, concise, and accurate
- Ask for clarification when instructions are ambiguous
- Use tools when they would help accomplish the user's goal
- Respect the user's preferences and communication style
  `;
    expect(isDefaultBoilerplate("AGENTS.md", content)).toBe(true);
  });

  it("returns false for customized content", () => {
    const content = `# Agents

You are Mima, a cozy companion agent.

## Guidelines

- Be warm and supportive
`;
    expect(isDefaultBoilerplate("AGENTS.md", content)).toBe(false);
  });

  it("returns false for unknown file names", () => {
    expect(
      isDefaultBoilerplate(
        "CUSTOM.md" as Parameters<typeof isDefaultBoilerplate>[0],
        "anything",
      ),
    ).toBe(false);
  });

  it("returns true for default TOOLS.md content", () => {
    const content = `# Tools

Available tools and capabilities for the agent.

## Built-in Tools

The agent has access to tools provided by enabled plugins.
Each plugin may register actions, providers, and evaluators
that extend the agent's capabilities.

## Usage

Tools are invoked automatically when the agent determines
they would help accomplish the user's goal. No manual
configuration is required.
`;
    expect(isDefaultBoilerplate("TOOLS.md", content)).toBe(true);
  });

  it("matches default boilerplate ignoring elizaOS name casing", () => {
    const content = `# Agents

You are an autonomous AI agent powered by ELIZAOS.

## Capabilities

- Respond to user messages conversationally
- Execute actions and use available tools
- Access and manage knowledge from your workspace
- Maintain context across conversations

## Guidelines

- Be helpful, concise, and accurate
- Ask for clarification when instructions are ambiguous
- Use tools when they would help accomplish the user's goal
- Respect the user's preferences and communication style
`;
    expect(isDefaultBoilerplate("AGENTS.md", content)).toBe(true);
  });
});
