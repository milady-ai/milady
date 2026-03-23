/**
 * Integration test: Onboarding → Config Persistence → Character Build round-trip.
 *
 * Proves that when a user completes onboarding with a preset character (Chen),
 * ALL personality fields (style, adjectives, topics, postExamples,
 * messageExamples) survive the full pipeline:
 *
 *   1. Client sends submitOnboarding() with preset data
 *   2. persistCompatOnboardingDefaults() writes to config
 *   3. Config is reloaded
 *   4. buildCharacterFromConfig() produces a complete character
 *   5. The character has all preset fields populated
 *
 * This catches the bug where only name/bio/system were persisted while
 * style/adjectives/topics/examples were silently dropped.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STYLE_PRESETS } from "../../onboarding-presets";

// ── Mock the config module so we can capture what gets saved ──────────
let savedConfig: Record<string, unknown> = {};

vi.mock("../../config/config", () => ({
  loadElizaConfig: vi.fn(() => structuredClone(savedConfig)),
  saveElizaConfig: vi.fn((config: Record<string, unknown>) => {
    savedConfig = structuredClone(config);
  }),
}));

import { persistCompatOnboardingDefaults } from "../server";

// ── Mock the plugin imports so buildCharacterFromConfig doesn't blow up ──
vi.mock("@elizaos/plugin-agent-orchestrator", () => ({ default: {} }));
vi.mock("@elizaos/plugin-agent-skills", () => ({ default: {} }));
vi.mock("@elizaos/plugin-anthropic", () => ({ default: {} }));
vi.mock("@elizaos/plugin-browser", () => ({ default: {} }));
vi.mock("@elizaos/plugin-cli", () => ({ default: {} }));
vi.mock("@elizaos/plugin-coding-agent", () => ({ default: {} }));
vi.mock("@elizaos/plugin-computeruse", () => ({ default: {} }));
vi.mock("@elizaos/plugin-cron", () => ({ default: {} }));
vi.mock("@elizaos/plugin-discord", () => ({ default: {} }));
vi.mock("@elizaos/plugin-edge-tts", () => ({ default: {} }));
vi.mock("@elizaos/plugin-elevenlabs", () => ({ default: {} }));
vi.mock("@elizaos/plugin-elizacloud", () => ({ default: {} }));
vi.mock("@elizaos/plugin-experience", () => ({ default: {} }));
vi.mock("@elizaos/plugin-form", () => ({ default: {} }));
vi.mock("@elizaos/plugin-google-genai", () => ({ default: {} }));
vi.mock("@elizaos/plugin-groq", () => ({ default: {} }));
vi.mock("@elizaos/plugin-knowledge", () => ({ default: {} }));
vi.mock("@elizaos/plugin-local-embedding", () => ({ default: {} }));
vi.mock("@elizaos/plugin-ollama", () => ({ default: {} }));
vi.mock("@elizaos/plugin-openai", () => ({ default: {} }));
vi.mock("@elizaos/plugin-openrouter", () => ({ default: {} }));
vi.mock("@elizaos/plugin-pdf", () => ({ default: {} }));
vi.mock("@elizaos/plugin-personality", () => ({ default: {} }));
vi.mock("@elizaos/plugin-plugin-manager", () => ({ default: {} }));
vi.mock("@elizaos/plugin-rolodex", () => ({ default: {} }));
vi.mock("@elizaos/plugin-secrets-manager", () => ({ default: {} }));
vi.mock("@elizaos/plugin-shell", () => ({ default: {} }));
vi.mock("@elizaos/plugin-sql", () => ({ default: {} }));
vi.mock("@elizaos/plugin-telegram", () => ({ default: {} }));
vi.mock("@elizaos/plugin-trajectory-logger", () => ({ default: {} }));
vi.mock("@elizaos/plugin-trust", () => ({ default: {} }));
vi.mock("@elizaos/plugin-twitch", () => ({ default: {} }));
vi.mock("@miladyai/plugin-wechat", () => ({ default: {} }));

import { buildCharacterFromConfig } from "../../runtime/eliza";
import type { ElizaConfig } from "../../config/config";

describe("Onboarding → Character round-trip", () => {
  const chenPreset = STYLE_PRESETS.find((p) => p.name === "Chen")!;

  beforeEach(() => {
    savedConfig = {};
  });

  it("Chen preset: all personality fields survive persist → build round-trip", () => {
    // ── Step 1: Simulate the onboarding submission body ──────────────
    // This is what the frontend sends via submitOnboarding().
    const systemPrompt = chenPreset.system.replace(/\{\{name\}\}/g, "Chen");
    const onboardingBody = {
      name: "Chen",
      bio: chenPreset.bio,
      systemPrompt,
      style: chenPreset.style,
      adjectives: chenPreset.adjectives,
      topics: chenPreset.topics,
      postExamples: chenPreset.postExamples,
      messageExamples: chenPreset.messageExamples,
    };

    // ── Step 2: persistCompatOnboardingDefaults writes to config ─────
    const adminEntityId = persistCompatOnboardingDefaults(onboardingBody);
    expect(adminEntityId).toBeTruthy();

    // ── Step 3: Verify the saved config has ALL fields ───────────────
    const agents = savedConfig.agents as Record<string, unknown>;
    expect(agents).toBeTruthy();
    const list = agents.list as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    const agentEntry = list[0];

    expect(agentEntry.name).toBe("Chen");
    expect(agentEntry.bio).toEqual(chenPreset.bio);
    expect(agentEntry.system).toBe(systemPrompt);
    expect(agentEntry.style).toEqual(chenPreset.style);
    expect(agentEntry.adjectives).toEqual(chenPreset.adjectives);
    expect(agentEntry.topics).toEqual(chenPreset.topics);
    expect(agentEntry.postExamples).toEqual(chenPreset.postExamples);
    expect(agentEntry.messageExamples).toEqual(chenPreset.messageExamples);

    // ── Step 4: Build character from the persisted config ────────────
    // This is what happens when the agent restarts.
    const character = buildCharacterFromConfig(savedConfig as ElizaConfig);

    // ── Step 5: Verify the built character has ALL personality data ──
    expect(character.name).toBe("Chen");

    // Bio should be the preset bio (array of strings with {{name}})
    expect(Array.isArray(character.bio)).toBe(true);
    expect((character.bio as string[]).length).toBe(chenPreset.bio.length);

    // System prompt should be populated
    expect(character.system).toBe(systemPrompt);

    // Style rules should be fully populated
    expect(character.style).toBeTruthy();
    expect(character.style?.all?.length).toBeGreaterThan(0);
    expect(character.style?.chat?.length).toBeGreaterThan(0);
    expect(character.style?.post?.length).toBeGreaterThan(0);

    // Adjectives should be populated
    expect(character.adjectives).toBeTruthy();
    expect(character.adjectives?.length).toBe(chenPreset.adjectives.length);
    expect(character.adjectives).toContain("warm");
    expect(character.adjectives).toContain("gentle");

    // Topics should be populated
    expect(Array.isArray(character.topics)).toBe(true);
    expect((character.topics as string[]).length).toBe(
      chenPreset.topics!.length,
    );
    expect(character.topics).toContain("emotional intelligence");
    expect(character.topics).toContain("design thinking");

    // Post examples should be populated
    expect(character.postExamples.length).toBeGreaterThan(0);
    expect(character.postExamples).toContain("you've got this");

    // Message examples should be populated and normalized
    expect(character.messageExamples.length).toBeGreaterThan(0);
  });

  it("name-only config: preset fallback populates all character fields", () => {
    // ── Simulate a config where only the name was saved (worst case) ─
    // This tests the bundled preset fallback path.
    savedConfig = {
      agents: { list: [{ id: "main", name: "Chen" }] },
    };

    const character = buildCharacterFromConfig(savedConfig as ElizaConfig);

    expect(character.name).toBe("Chen");

    // Even with name-only config, the bundled preset should fill everything
    expect(character.style).toBeTruthy();
    expect(character.style?.all?.length).toBeGreaterThan(0);

    expect(character.adjectives).toBeTruthy();
    expect(character.adjectives?.length).toBeGreaterThan(0);

    expect(Array.isArray(character.topics)).toBe(true);
    expect((character.topics as string[]).length).toBeGreaterThan(0);

    expect(character.postExamples.length).toBeGreaterThan(0);
    expect(character.messageExamples.length).toBeGreaterThan(0);
  });

  it("non-preset character: custom fields persist without preset fallback", () => {
    const customBody = {
      name: "MyCustomBot",
      bio: ["A custom bot for testing."],
      systemPrompt: "You are MyCustomBot, a test agent.",
      style: { all: ["be concise"], chat: ["be friendly"], post: ["be witty"] },
      adjectives: ["helpful", "fast"],
      topics: ["testing", "automation"],
      postExamples: ["hello world"],
      messageExamples: [
        [
          { user: "{{user1}}", content: { text: "hi" } },
          { user: "MyCustomBot", content: { text: "hello!" } },
        ],
      ],
    };

    persistCompatOnboardingDefaults(customBody);
    const character = buildCharacterFromConfig(savedConfig as ElizaConfig);

    expect(character.name).toBe("MyCustomBot");
    expect(character.style?.all).toContain("be concise");
    expect(character.adjectives).toContain("helpful");
    expect(character.topics).toContain("testing");
    expect(character.postExamples).toContain("hello world");
    expect(character.messageExamples.length).toBeGreaterThan(0);
  });

  it("all preset characters have complete data after round-trip", () => {
    // Verify every bundled preset character works end-to-end
    for (const preset of STYLE_PRESETS) {
      savedConfig = {};
      const systemPrompt = preset.system.replace(/\{\{name\}\}/g, preset.name);

      persistCompatOnboardingDefaults({
        name: preset.name,
        bio: preset.bio,
        systemPrompt,
        style: preset.style,
        adjectives: preset.adjectives,
        topics: preset.topics,
        postExamples: preset.postExamples,
        messageExamples: preset.messageExamples,
      });

      const character = buildCharacterFromConfig(savedConfig as ElizaConfig);

      expect(character.name).toBe(preset.name);
      expect(character.style?.all?.length).toBeGreaterThan(
        0,
        `${preset.name}: style.all should not be empty`,
      );
      expect(character.adjectives?.length).toBeGreaterThan(
        0,
        `${preset.name}: adjectives should not be empty`,
      );
      expect(character.postExamples.length).toBeGreaterThan(
        0,
        `${preset.name}: postExamples should not be empty`,
      );
      expect(character.messageExamples.length).toBeGreaterThan(
        0,
        `${preset.name}: messageExamples should not be empty`,
      );

      if (preset.topics && preset.topics.length > 0) {
        expect(
          Array.isArray(character.topics) && character.topics.length > 0,
        ).toBe(true);
      }
    }
  });
});
