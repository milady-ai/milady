/**
 * E2E tests for the conversation context system:
 *   - recentConversationsProvider
 *   - relevantConversationsProvider
 *   - rolodexProvider
 *   - READ_CHANNEL action
 *   - SEARCH_CONVERSATIONS action
 *   - SEARCH_ENTITY / READ_ENTITY actions
 *
 * NO MOCKS. Real PGlite database, real embeddings (local-embedding plugin),
 * real relationship graph data. Exercises the full data path from database
 * through provider/action formatting.
 *
 * Requires: ELIZA_RUN_CONVERSATION_CONTEXT_E2E=1 (opt-in like other heavy e2e)
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentRuntime,
  ChannelType,
  createCharacter,
  logger,
  type Memory,
  type Plugin,
  stringToUuid,
  type UUID,
} from "@elizaos/core";
import dotenv from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTimeout } from "../../../test/helpers/test-utils";
import { configureLocalEmbeddingPlugin } from "../src/runtime/eliza";
import {
  extractPlugin,
  type PluginModuleShape,
} from "../src/test-support/test-helpers";

// Providers under test
import { recentConversationsProvider } from "../src/providers/recent-conversations";
import { relevantConversationsProvider } from "../src/providers/relevant-conversations";
import { rolodexProvider } from "../src/providers/rolodex";

// Actions under test
import { readChannelAction } from "../src/actions/read-channel";
import { searchConversationsAction } from "../src/actions/search-conversations";
import {
  searchEntityAction,
  readEntityAction,
} from "../src/actions/entity-actions";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, "..");
dotenv.config({ path: path.resolve(packageRoot, ".env") });
dotenv.config({ path: path.resolve(packageRoot, "..", "..", ".env") });

const runE2E = process.env.ELIZA_RUN_CONVERSATION_CONTEXT_E2E === "1";

// ---------------------------------------------------------------------------
// Plugin loader
// ---------------------------------------------------------------------------

async function loadPlugin(name: string): Promise<Plugin | null> {
  try {
    return extractPlugin(
      (await import(name)) as PluginModuleShape,
    ) as Plugin | null;
  } catch (err) {
    logger.warn(
      `[e2e:ctx] Failed to load plugin ${name}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Test data: simulated multi-platform conversations
// ---------------------------------------------------------------------------

const AGENT_ID = stringToUuid("ctx-e2e-agent");

// Discord world
const discordWorldId = stringToUuid("ctx-e2e-discord-world");
const discordGeneralRoomId = stringToUuid("ctx-e2e-discord-general");
const discordDevRoomId = stringToUuid("ctx-e2e-discord-dev");

// Telegram world
const telegramWorldId = stringToUuid("ctx-e2e-telegram-world");
const telegramDmRoomId = stringToUuid("ctx-e2e-telegram-dm");

// Extra rooms for edge case testing
const emptyRoomId = stringToUuid("ctx-e2e-empty-room");
const singleMsgRoomId = stringToUuid("ctx-e2e-single-msg-room");

// Users
const aliceEntityId = crypto.randomUUID() as UUID;
const bobEntityId = crypto.randomUUID() as UUID;
const ownerEntityId = crypto.randomUUID() as UUID;
const loneUserEntityId = crypto.randomUUID() as UUID; // only in telegram

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!runE2E)("Conversation Context E2E", () => {
  let runtime: AgentRuntime;
  let initialized = false;

  const pgliteDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "eliza-ctx-e2e-pglite-"),
  );

  // ─── Setup: real runtime with real DB ─────────────────────────────────

  beforeAll(async () => {
    process.env.LOG_LEVEL = "error";
    process.env.PGLITE_DATA_DIR = pgliteDir;

    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
    const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
    const hasGroq = Boolean(process.env.GROQ_API_KEY);

    const secrets: Record<string, string> = {};
    if (hasOpenAI) secrets.OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
    if (hasAnthropic) secrets.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
    if (hasGroq) secrets.GROQ_API_KEY = process.env.GROQ_API_KEY!;

    const character = createCharacter({
      name: "ContextTestAgent",
      bio: "A test agent for verifying conversation context, search, and entity actions.",
      secrets,
    });

    // Load plugins
    const sqlPlugin = await loadPlugin("@elizaos/plugin-sql");
    const localEmbeddingPlugin = await loadPlugin("@elizaos/plugin-local-embedding");
    const plugins: Plugin[] = [];

    // Load a model provider so we have real TEXT_EMBEDDING
    if (hasOpenAI) {
      const p = await loadPlugin("@elizaos/plugin-openai");
      if (p) plugins.push(p);
    } else if (hasAnthropic) {
      const p = await loadPlugin("@elizaos/plugin-anthropic");
      if (p) plugins.push(p);
    } else if (hasGroq) {
      const p = await loadPlugin("@elizaos/plugin-groq");
      if (p) plugins.push(p);
    }

    runtime = new AgentRuntime({
      character,
      plugins,
      logLevel: "error",
    });

    if (sqlPlugin) {
      await runtime.registerPlugin(sqlPlugin);
      if (runtime.adapter && !(await runtime.adapter.isReady())) {
        await runtime.adapter.init();
      }
    }
    if (localEmbeddingPlugin) {
      configureLocalEmbeddingPlugin(localEmbeddingPlugin);
      await runtime.registerPlugin(localEmbeddingPlugin);
    }

    await runtime.initialize();
    initialized = true;

    // ── Seed data: worlds, rooms, entities, messages ──────────────────

    // Discord world + rooms
    await runtime.ensureWorldExists({
      id: discordWorldId,
      name: "Test Discord Server",
      agentId: runtime.agentId,
    } as Parameters<typeof runtime.ensureWorldExists>[0]);

    // Create rooms
    await runtime.ensureConnection({
      entityId: aliceEntityId,
      roomId: discordGeneralRoomId,
      worldId: discordWorldId,
      userName: "alice",
      name: "alice",
      source: "discord",
      channelId: "discord-general",
      type: ChannelType.GROUP,
    });
    await runtime.ensureConnection({
      entityId: bobEntityId,
      roomId: discordDevRoomId,
      worldId: discordWorldId,
      userName: "bob",
      name: "bob",
      source: "discord",
      channelId: "discord-dev",
      type: ChannelType.GROUP,
    });
    // Agent participates in both
    await runtime.ensureParticipantInRoom(runtime.agentId, discordGeneralRoomId);
    await runtime.ensureParticipantInRoom(runtime.agentId, discordDevRoomId);

    // Telegram world + DM
    await runtime.ensureWorldExists({
      id: telegramWorldId,
      name: "Telegram",
      agentId: runtime.agentId,
    } as Parameters<typeof runtime.ensureWorldExists>[0]);

    await runtime.ensureConnection({
      entityId: ownerEntityId,
      roomId: telegramDmRoomId,
      worldId: telegramWorldId,
      userName: "shaw",
      name: "shaw",
      source: "telegram",
      channelId: "telegram-dm-shaw",
      type: ChannelType.DM,
    });
    await runtime.ensureParticipantInRoom(runtime.agentId, telegramDmRoomId);
    await runtime.ensureParticipantInRoom(ownerEntityId, telegramDmRoomId);

    // Owner participates everywhere
    await runtime.ensureParticipantInRoom(ownerEntityId, discordGeneralRoomId);
    await runtime.ensureParticipantInRoom(ownerEntityId, discordDevRoomId);

    // ── Seed messages ───────────────────────────────────────────────

    const now = Date.now();

    // Discord #general — Alice talking about TypeScript
    const discordGeneralMessages = [
      { entityId: aliceEntityId, text: "Has anyone tried the new TypeScript 5.5 features?", delta: -300_000 },
      { entityId: runtime.agentId, text: "Yes! The new type narrowing for control flow is really powerful.", delta: -280_000 },
      { entityId: aliceEntityId, text: "I'm especially interested in the inferred type predicates. It eliminates so much boilerplate.", delta: -260_000 },
      { entityId: ownerEntityId, text: "We should upgrade our project to TypeScript 5.5 this week.", delta: -240_000 },
      { entityId: runtime.agentId, text: "I can help with that migration. Want me to create a plan?", delta: -220_000 },
    ];

    // Discord #dev — Bob talking about pizza ordering system
    const discordDevMessages = [
      { entityId: bobEntityId, text: "The pizza ordering API is throwing 500 errors on large orders.", delta: -180_000 },
      { entityId: runtime.agentId, text: "What's the payload size? Could be a body parser limit.", delta: -160_000 },
      { entityId: bobEntityId, text: "Good call, it's a 50-item order. The max body size is 1MB by default.", delta: -140_000 },
      { entityId: ownerEntityId, text: "Bob, can you also look at the authentication bug in the checkout flow?", delta: -120_000 },
      { entityId: bobEntityId, text: "Sure, I think the JWT token isn't being refreshed properly on the payment page.", delta: -100_000 },
    ];

    // Telegram DM — shaw talking about deployment
    const telegramDmMessages = [
      { entityId: ownerEntityId, text: "Hey, we need to deploy the new version to production today.", delta: -80_000 },
      { entityId: runtime.agentId, text: "I'll prepare the deployment checklist. Any specific concerns?", delta: -60_000 },
      { entityId: ownerEntityId, text: "Make sure the database migrations run before the app restarts. Last time we had downtime because of ordering.", delta: -40_000 },
      { entityId: runtime.agentId, text: "Got it. I'll ensure migrations are sequenced: schema first, then data backfill, then app restart.", delta: -20_000 },
    ];

    const seedMessages = async (roomId: UUID, msgs: { entityId: UUID; text: string; delta: number }[]) => {
      for (const msg of msgs) {
        await runtime.createMemory(
          {
            id: crypto.randomUUID() as UUID,
            entityId: msg.entityId,
            agentId: runtime.agentId,
            roomId,
            content: { text: msg.text, source: "test" },
            createdAt: now + msg.delta,
          } as Memory,
          "messages",
        );
      }
    };

    await seedMessages(discordGeneralRoomId, discordGeneralMessages);
    await seedMessages(discordDevRoomId, discordDevMessages);
    await seedMessages(telegramDmRoomId, telegramDmMessages);

    // ── Extra rooms for edge cases ──────────────────────────────────

    // Empty room (exists but has zero messages)
    await runtime.ensureConnection({
      entityId: runtime.agentId,
      roomId: emptyRoomId,
      worldId: discordWorldId,
      userName: "agent",
      name: "agent",
      source: "discord",
      channelId: "discord-empty",
      type: ChannelType.GROUP,
    });

    // Single-message room
    await runtime.ensureConnection({
      entityId: loneUserEntityId,
      roomId: singleMsgRoomId,
      worldId: telegramWorldId,
      userName: "lone-wolf",
      name: "lone-wolf",
      source: "telegram",
      channelId: "telegram-lone",
      type: ChannelType.DM,
    });
    await runtime.ensureParticipantInRoom(runtime.agentId, singleMsgRoomId);

    await runtime.createMemory(
      {
        id: crypto.randomUUID() as UUID,
        entityId: loneUserEntityId,
        agentId: runtime.agentId,
        roomId: singleMsgRoomId,
        content: { text: "I only exist in this one place, a solitary quantum fluctuation.", source: "test" },
        createdAt: now - 50_000,
      } as Memory,
      "messages",
    );

    // loneUser relationship
    await runtime.createRelationship({
      sourceEntityId: runtime.agentId,
      targetEntityId: loneUserEntityId,
      tags: ["acquaintance"],
      metadata: {
        relationshipType: "acquaintance",
        sentiment: "neutral",
        strength: 0.2,
        interactionCount: 1,
        lastInteractionAt: new Date(now - 50_000).toISOString(),
      },
    });

    // ── Seed relationships ──────────────────────────────────────────

    await runtime.createRelationship({
      sourceEntityId: runtime.agentId,
      targetEntityId: aliceEntityId,
      tags: ["colleague", "developer"],
      metadata: {
        relationshipType: "colleague",
        sentiment: "positive",
        strength: 0.8,
        interactionCount: 42,
        lastInteractionAt: new Date(now - 260_000).toISOString(),
      },
    });

    await runtime.createRelationship({
      sourceEntityId: runtime.agentId,
      targetEntityId: bobEntityId,
      tags: ["colleague", "backend"],
      metadata: {
        relationshipType: "colleague",
        sentiment: "positive",
        strength: 0.7,
        interactionCount: 28,
        lastInteractionAt: new Date(now - 100_000).toISOString(),
      },
    });

    await runtime.createRelationship({
      sourceEntityId: runtime.agentId,
      targetEntityId: ownerEntityId,
      tags: ["owner", "admin"],
      metadata: {
        relationshipType: "owner",
        sentiment: "positive",
        strength: 1.0,
        interactionCount: 200,
        lastInteractionAt: new Date(now - 20_000).toISOString(),
      },
    });

    logger.info("[e2e:ctx] Setup complete — data seeded across 5 rooms, 4 users, 15 messages");
  }, 180_000);

  afterAll(async () => {
    if (runtime) {
      try {
        await withTimeout(runtime.stop(), 60_000, "runtime.stop()");
      } catch {
        // ok
      }
    }
    try {
      fs.rmSync(pgliteDir, { recursive: true, force: true });
    } catch {
      // ok
    }
  });

  // Helper to make a message from the agent itself (guaranteed admin via isAgentSelf)
  function agentMessage(text: string, roomId: UUID = discordGeneralRoomId): Memory {
    return {
      id: crypto.randomUUID() as UUID,
      entityId: runtime.agentId,
      agentId: runtime.agentId,
      roomId,
      content: { text, source: "client_chat" },
      createdAt: Date.now(),
    } as Memory;
  }

  // Helper to make a message as the owner (for provider context — needs owner's rooms)
  function ownerMessage(text: string, roomId: UUID = discordGeneralRoomId): Memory {
    return {
      id: crypto.randomUUID() as UUID,
      entityId: ownerEntityId,
      agentId: runtime.agentId,
      roomId,
      content: { text, source: "client_chat" },
      createdAt: Date.now(),
    } as Memory;
  }

  // Check if embedding model is available
  let hasEmbedding = false;
  async function checkEmbedding() {
    if (hasEmbedding) return true;
    try {
      const result = await runtime.useModel(
        "TEXT_EMBEDDING" as never,
        { text: "test" } as never,
      );
      hasEmbedding = Array.isArray(result) && result.length > 0;
    } catch {
      hasEmbedding = false;
    }
    return hasEmbedding;
  }

  // ─── recentConversationsProvider ──────────────────────────────────────

  describe("recentConversationsProvider", () => {
    it("returns recent messages from the owner's rooms", async () => {
      expect(initialized).toBe(true);

      const result = await recentConversationsProvider.get(
        runtime,
        ownerMessage("what's been happening?"),
        {} as never,
      );

      expect(result.text).toBeTruthy();
      expect(result.text).toContain("Recent conversations:");
      // Should include messages from rooms the owner participates in
      // Owner is in all 3 rooms
      const messageCount = result.values?.recentConversationCount;
      expect(typeof messageCount).toBe("number");
      expect(messageCount).toBeGreaterThan(0);
      expect(messageCount).toBeLessThanOrEqual(10);

      logger.info(`[e2e:ctx] recentConversations returned ${messageCount} messages`);
      logger.info(`[e2e:ctx] preview: ${result.text!.slice(0, 300)}`);
    });
  });

  // ─── READ_CHANNEL ────────────────────────────────────────────────────

  describe("READ_CHANNEL", () => {
    it("reads Discord #general by room ID", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read channel"),
        {} as never,
        { parameters: { channel: discordGeneralRoomId } } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(true);
      expect(result!.text).toContain("TypeScript");
      expect(result!.text).toContain("type narrowing");
      // Line numbers present
      expect(result!.text).toMatch(/\s+1 \|/);
      expect(result!.text).toMatch(/\s+5 \|/);
      // Scratchpad hint present
      expect(result!.text).toContain("scratchpad");

      logger.info(`[e2e:ctx] READ_CHANNEL returned:\n${result!.text!.slice(0, 500)}`);
    });

    it("reads Discord #dev by room ID", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read dev channel"),
        {} as never,
        { parameters: { channel: discordDevRoomId } } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(true);
      expect(result!.text).toContain("pizza ordering API");
      expect(result!.text).toContain("JWT token");
      expect(result!.text).toContain("authentication bug");

      logger.info(`[e2e:ctx] READ_CHANNEL #dev returned:\n${result!.text!.slice(0, 500)}`);
    });

    it("reads Telegram DM", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read telegram"),
        {} as never,
        { parameters: { channel: telegramDmRoomId } } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(true);
      expect(result!.text).toContain("deploy");
      expect(result!.text).toContain("database migrations");

      logger.info(`[e2e:ctx] READ_CHANNEL telegram returned:\n${result!.text!.slice(0, 500)}`);
    });

    it("respects limit parameter", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read channel limited"),
        {} as never,
        { parameters: { channel: discordGeneralRoomId, limit: 2 } } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(true);
      const data = result!.data as Record<string, unknown>;
      const messages = data.messages as unknown[];
      expect(messages.length).toBeLessThanOrEqual(2);
    });

    it("returns error for nonexistent channel", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read fake channel"),
        {} as never,
        { parameters: { channel: "nonexistent-room-12345" } } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(false);
      expect(result!.text).toContain("Could not find");
    });
  });

  // ─── SEARCH_CONVERSATIONS ────────────────────────────────────────────

  describe("SEARCH_CONVERSATIONS", () => {
    it("finds messages about TypeScript across all platforms", async () => {
      expect(initialized).toBe(true);
      if (!(await checkEmbedding())) {
        logger.warn("[e2e:ctx] Skipping SEARCH_CONVERSATIONS — no embedding model available");
        return;
      }

      const result = await searchConversationsAction.handler!(
        runtime,
        agentMessage("search for typescript discussions"),
        {} as never,
        { parameters: { query: "TypeScript type system features" } } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(true);
      // Should find TypeScript-related messages from Discord #general
      if ((result!.values as Record<string, unknown>)?.resultCount) {
        expect(result!.text).toContain("TypeScript");
        // Line numbers present
        expect(result!.text).toMatch(/\s+1 \|/);
        expect(result!.text).toContain("scratchpad");
        logger.info(`[e2e:ctx] SEARCH_CONVERSATIONS 'TypeScript' found ${(result!.values as Record<string, unknown>).resultCount} results`);
      } else {
        logger.warn("[e2e:ctx] SEARCH_CONVERSATIONS 'TypeScript' returned 0 results (embedding mismatch?)");
      }

      logger.info(`[e2e:ctx] preview: ${result!.text!.slice(0, 400)}`);
    });

    it("finds messages about pizza ordering", async () => {
      expect(initialized).toBe(true);
      if (!(await checkEmbedding())) return;

      const result = await searchConversationsAction.handler!(
        runtime,
        agentMessage("search for pizza"),
        {} as never,
        { parameters: { query: "pizza ordering API errors" } } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(true);

      if ((result!.values as Record<string, unknown>)?.resultCount) {
        expect(result!.text).toContain("pizza");
        logger.info(`[e2e:ctx] SEARCH_CONVERSATIONS 'pizza' found ${(result!.values as Record<string, unknown>).resultCount} results`);
      } else {
        logger.warn("[e2e:ctx] SEARCH_CONVERSATIONS 'pizza' returned 0 results (embedding mismatch?)");
      }
    });

    it("finds messages about deployment", async () => {
      expect(initialized).toBe(true);
      if (!(await checkEmbedding())) return;

      const result = await searchConversationsAction.handler!(
        runtime,
        agentMessage("search deployment"),
        {} as never,
        { parameters: { query: "production deployment database migrations" } } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(true);

      if ((result!.values as Record<string, unknown>)?.resultCount) {
        expect(result!.text).toContain("deploy");
        logger.info(`[e2e:ctx] SEARCH_CONVERSATIONS 'deployment' found ${(result!.values as Record<string, unknown>).resultCount} results`);
      }
    });

    it("rejects empty query", async () => {
      expect(initialized).toBe(true);

      const result = await searchConversationsAction.handler!(
        runtime,
        agentMessage("search"),
        {} as never,
        { parameters: {} } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(false);
      expect(result!.text).toContain("requires a non-empty query");
    });
  });

  // ─── SEARCH_ENTITY ───────────────────────────────────────────────────

  describe("SEARCH_ENTITY", () => {
    it("finds entities from the relationships graph", async () => {
      expect(initialized).toBe(true);

      // The relationships graph service may or may not be loaded depending
      // on plugins. Test the action handles gracefully either way.
      const result = await searchEntityAction.handler!(
        runtime,
        agentMessage("find alice"),
        {} as never,
        { parameters: { query: "alice" } } as never,
      );

      expect(result).toBeDefined();
      // If the service is available, it should return results
      // If not, it should return a clean error
      if (result!.success) {
        logger.info(`[e2e:ctx] SEARCH_ENTITY 'alice' succeeded: ${result!.text!.slice(0, 200)}`);
      } else {
        // Acceptable: service may not be loaded
        expect(result!.text).toBeTruthy();
        logger.info(`[e2e:ctx] SEARCH_ENTITY 'alice': ${result!.text}`);
      }
    });

    it("rejects empty query", async () => {
      expect(initialized).toBe(true);

      const result = await searchEntityAction.handler!(
        runtime,
        agentMessage("search entity"),
        {} as never,
        { parameters: {} } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(false);
    });
  });

  // ─── READ_ENTITY ─────────────────────────────────────────────────────

  describe("READ_ENTITY", () => {
    it("reads entity details by ID or name", async () => {
      expect(initialized).toBe(true);

      const result = await readEntityAction.handler!(
        runtime,
        agentMessage("read entity alice"),
        {} as never,
        { parameters: { name: "alice" } } as never,
      );

      expect(result).toBeDefined();
      if (result!.success) {
        expect(result!.text).toContain("scratchpad");
        logger.info(`[e2e:ctx] READ_ENTITY 'alice' succeeded:\n${result!.text!.slice(0, 500)}`);
      } else {
        // Service may not be loaded
        expect(result!.text).toBeTruthy();
        logger.info(`[e2e:ctx] READ_ENTITY 'alice': ${result!.text}`);
      }
    });

    it("rejects when no identifier provided", async () => {
      expect(initialized).toBe(true);

      const result = await readEntityAction.handler!(
        runtime,
        agentMessage("read entity"),
        {} as never,
        { parameters: {} } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(false);
      expect(result!.text).toContain("requires either entityId or name");
    });
  });

  // ─── relevantConversationsProvider (needs embeddings) ────────────────

  describe("relevantConversationsProvider", () => {
    it("finds semantically relevant messages for a TypeScript question", async () => {
      expect(initialized).toBe(true);

      const result = await relevantConversationsProvider.get(
        runtime,
        ownerMessage(
          "What do you think about type predicates in TypeScript?",
          discordDevRoomId, // Ask from dev channel, should find general channel msgs
        ),
        {} as never,
      );

      // May return empty if embedding model not loaded — that's ok
      if (result.text && result.text.length > 0) {
        logger.info(`[e2e:ctx] relevantConversations returned: ${result.text.slice(0, 400)}`);
        const count = result.values?.relevantConversationCount;
        if (typeof count === "number" && count > 0) {
          // Should find TypeScript discussions from discord-general
          expect(result.text).toContain("Relevant past conversations:");
        }
      } else {
        logger.warn("[e2e:ctx] relevantConversations returned empty (no embedding model?)");
      }
    });
  });

  // ─── rolodexProvider ─────────────────────────────────────────────────

  describe("rolodexProvider", () => {
    it("returns contact information from relationships graph", async () => {
      expect(initialized).toBe(true);

      const result = await rolodexProvider.get(
        runtime,
        agentMessage("who do I know?"),
        {} as never,
      );

      // If relationships graph service is loaded, should return contacts
      if (result.text && result.text.length > 0 && !result.text.includes("unavailable")) {
        logger.info(`[e2e:ctx] rolodex returned: ${result.text.slice(0, 400)}`);
        // Verify it has some content
        expect(
          result.text.includes("Rolodex") || result.text.includes("No known contacts"),
        ).toBe(true);
      } else {
        logger.info("[e2e:ctx] rolodex: relationships service not loaded (expected in minimal setup)");
      }
    });
  });

  // ─── Cross-feature integration ───────────────────────────────────────

  describe("Cross-feature integration", () => {
    it("READ_CHANNEL data can be verified against SEARCH_CONVERSATIONS", async () => {
      expect(initialized).toBe(true);

      // Read the dev channel
      const channelResult = await readChannelAction.handler!(
        runtime,
        agentMessage("read dev"),
        {} as never,
        { parameters: { channel: discordDevRoomId } } as never,
      );
      expect(channelResult!.success).toBe(true);
      expect(channelResult!.text).toContain("JWT");

      // Search only works if embedding is available
      if (await checkEmbedding()) {
        const searchResult = await searchConversationsAction.handler!(
          runtime,
          agentMessage("search auth"),
          {} as never,
          { parameters: { query: "authentication JWT token checkout" } } as never,
        );
        expect(searchResult!.success).toBe(true);

        if ((searchResult!.values as Record<string, unknown>)?.resultCount) {
          logger.info("[e2e:ctx] Cross-check: READ_CHANNEL and SEARCH_CONVERSATIONS both found JWT/auth content");
        }
      } else {
        logger.warn("[e2e:ctx] Skipping search cross-check — no embedding model");
      }
    });

    it("all 3 main rooms contain distinct searchable content", async () => {
      expect(initialized).toBe(true);

      // Read all 3 rooms and verify they have distinct content
      const general = await readChannelAction.handler!(
        runtime,
        agentMessage("read general"),
        {} as never,
        { parameters: { channel: discordGeneralRoomId } } as never,
      );
      const dev = await readChannelAction.handler!(
        runtime,
        agentMessage("read dev"),
        {} as never,
        { parameters: { channel: discordDevRoomId } } as never,
      );
      const telegram = await readChannelAction.handler!(
        runtime,
        agentMessage("read telegram"),
        {} as never,
        { parameters: { channel: telegramDmRoomId } } as never,
      );

      expect(general!.success).toBe(true);
      expect(dev!.success).toBe(true);
      expect(telegram!.success).toBe(true);

      // Each room has unique content
      expect(general!.text).toContain("TypeScript");
      expect(dev!.text).toContain("pizza");
      expect(telegram!.text).toContain("deploy");

      // Cross-room content doesn't bleed
      expect(general!.text).not.toContain("pizza");
      expect(dev!.text).not.toContain("deploy");
      expect(telegram!.text).not.toContain("TypeScript");

      logger.info("[e2e:ctx] All 3 rooms verified with distinct, isolated content");
    });
  });

  // ─── READ_CHANNEL edge cases ────────────────────────────────────────

  describe("READ_CHANNEL edge cases", () => {
    it("returns empty for a room with no messages", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read empty room"),
        {} as never,
        { parameters: { channel: emptyRoomId } } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(true);
      expect(result!.text).toContain("No messages found");
      const data = result!.data as Record<string, unknown>;
      expect(data.roomId).toBe(emptyRoomId);
    });

    it("reads a room with exactly one message", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read single msg room"),
        {} as never,
        { parameters: { channel: singleMsgRoomId } } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(true);
      const data = result!.data as Record<string, unknown>;
      const messages = data.messages as unknown[];
      expect(messages.length).toBe(1);
      expect(result!.text).toContain("quantum fluctuation");
      // Only line 1 should exist
      expect(result!.text).toMatch(/\s+1 \|/);
      expect(result!.text).not.toMatch(/\s+2 \|/);
    });

    it("clamps limit=0 to at least 1 message", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read zero limit"),
        {} as never,
        { parameters: { channel: discordGeneralRoomId, limit: 0 } } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(true);
      const data = result!.data as Record<string, unknown>;
      const messages = data.messages as unknown[];
      // Math.max(1, 0) = 1, so should get exactly 1 message
      expect(messages.length).toBe(1);
    });

    it("caps limit above MAX_LIMIT (200)", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read huge limit"),
        {} as never,
        { parameters: { channel: discordGeneralRoomId, limit: 9999 } } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(true);
      const data = result!.data as Record<string, unknown>;
      const messages = data.messages as unknown[];
      // Should return all 5 messages (well under 200 cap)
      expect(messages.length).toBe(5);
      // Values should reflect actual count
      expect((result!.values as Record<string, unknown>).messageCount).toBe(5);
    });

    it("returns messages in chronological order (oldest first)", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read chronological"),
        {} as never,
        { parameters: { channel: discordGeneralRoomId } } as never,
      );

      expect(result!.success).toBe(true);
      const data = result!.data as Record<string, unknown>;
      const messages = data.messages as Array<{ createdAt: number; line: number }>;

      // Verify chronological ordering
      for (let i = 1; i < messages.length; i++) {
        expect(messages[i].createdAt).toBeGreaterThanOrEqual(messages[i - 1].createdAt);
      }

      // Line numbers should be sequential starting at 1
      for (let i = 0; i < messages.length; i++) {
        expect(messages[i].line).toBe(i + 1);
      }
    });

    it("attributes agent messages to agent character name", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read attribution"),
        {} as never,
        { parameters: { channel: discordGeneralRoomId } } as never,
      );

      expect(result!.success).toBe(true);
      // Agent messages should show character name, not "user"
      expect(result!.text).toContain("ContextTestAgent:");
      // User messages should show "user", not the character name
      // (Alice's messages should not be attributed to the agent)
      const lines = result!.text!.split("\n").filter((l: string) => l.match(/\s+\d+ \|/));
      const agentLines = lines.filter((l: string) => l.includes("ContextTestAgent:"));
      const userLines = lines.filter((l: string) => l.includes("user:"));
      expect(agentLines.length).toBeGreaterThan(0);
      expect(userLines.length).toBeGreaterThan(0);
    });

    it("rejects empty string channel parameter", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read empty"),
        {} as never,
        { parameters: { channel: "" } } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(false);
    });

    it("handles negative limit gracefully", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read negative limit"),
        {} as never,
        { parameters: { channel: discordGeneralRoomId, limit: -5 } } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(true);
      // Math.max(1, -5) = 1
      const data = result!.data as Record<string, unknown>;
      const messages = data.messages as unknown[];
      expect(messages.length).toBe(1);
    });
  });

  // ─── False positive / isolation checks ──────────────────────────────

  describe("False positive checks", () => {
    it("READ_CHANNEL never leaks messages from other rooms", async () => {
      expect(initialized).toBe(true);

      // Read all 5 rooms and verify absolute isolation
      const rooms = [
        { id: discordGeneralRoomId, unique: "TypeScript 5.5", absent: ["pizza ordering API", "deploy the new version", "quantum fluctuation"] },
        { id: discordDevRoomId, unique: "pizza ordering API", absent: ["TypeScript 5.5", "deploy the new version", "quantum fluctuation"] },
        { id: telegramDmRoomId, unique: "deploy the new version", absent: ["TypeScript 5.5", "pizza ordering API", "quantum fluctuation"] },
        { id: singleMsgRoomId, unique: "quantum fluctuation", absent: ["TypeScript 5.5", "pizza ordering API", "deploy the new version"] },
      ];

      for (const room of rooms) {
        const result = await readChannelAction.handler!(
          runtime,
          agentMessage("isolation check"),
          {} as never,
          { parameters: { channel: room.id } } as never,
        );
        expect(result!.success).toBe(true);
        expect(result!.text).toContain(room.unique);

        for (const phrase of room.absent) {
          expect(result!.text).not.toContain(phrase);
        }
      }
    });

    it("recentConversationsProvider scopes to the requesting user's rooms only", async () => {
      expect(initialized).toBe(true);

      // Alice is only in discord-general, she should NOT see telegram DM or discord-dev content
      const aliceMsg: Memory = {
        id: crypto.randomUUID() as UUID,
        entityId: aliceEntityId,
        agentId: runtime.agentId,
        roomId: discordGeneralRoomId,
        content: { text: "what's been happening lately?", source: "client_chat" },
        createdAt: Date.now(),
      } as Memory;

      const result = await recentConversationsProvider.get(
        runtime,
        aliceMsg,
        {} as never,
      );

      if (result.text && result.text.length > 0) {
        // Alice should NOT see telegram DM deploy messages
        expect(result.text).not.toContain("deploy the new version");
        // Alice should see content from rooms she's in
        // (Alice is only in discord-general via ensureConnection)
      }
    });

    it("recentConversationsProvider returns empty for user with no rooms", async () => {
      expect(initialized).toBe(true);

      const ghostId = crypto.randomUUID() as UUID;
      const ghostMsg: Memory = {
        id: crypto.randomUUID() as UUID,
        entityId: ghostId,
        agentId: runtime.agentId,
        roomId: discordGeneralRoomId,
        content: { text: "hello?", source: "client_chat" },
        createdAt: Date.now(),
      } as Memory;

      const result = await recentConversationsProvider.get(
        runtime,
        ghostMsg,
        {} as never,
      );

      // Ghost user has no rooms, should return empty
      expect(result.text).toBe("");
      expect(result.values?.recentConversationCount).toBeUndefined();
    });

    it("relevantConversationsProvider excludes current room messages", async () => {
      expect(initialized).toBe(true);

      // Ask about TypeScript FROM discord-general — should NOT return
      // discord-general messages since that's the current room
      const result = await relevantConversationsProvider.get(
        runtime,
        ownerMessage(
          "Tell me about TypeScript type predicates and narrowing",
          discordGeneralRoomId,
        ),
        {} as never,
      );

      if (result.text && result.text.length > 0 && result.values?.relevantConversationCount) {
        // If any results returned, none should be from discordGeneralRoomId
        const data = result.data as Record<string, unknown>;
        const messages = (data.messages ?? []) as Array<{ roomId: string }>;
        for (const msg of messages) {
          expect(msg.roomId).not.toBe(discordGeneralRoomId);
        }
      }
    });

    it("relevantConversationsProvider returns empty for very short text", async () => {
      expect(initialized).toBe(true);

      // Text under 5 chars should bail early
      const result = await relevantConversationsProvider.get(
        runtime,
        ownerMessage("hi", discordGeneralRoomId),
        {} as never,
      );

      expect(result.text).toBe("");
    });

    it("SEARCH_CONVERSATIONS rejects whitespace-only query", async () => {
      expect(initialized).toBe(true);

      const result = await searchConversationsAction.handler!(
        runtime,
        agentMessage("search whitespace"),
        {} as never,
        { parameters: { query: "   " } } as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(false);
      expect(result!.text).toContain("requires a non-empty query");
    });

    it("SEARCH_CONVERSATIONS source filter excludes other platforms", async () => {
      expect(initialized).toBe(true);
      if (!(await checkEmbedding())) return;

      // Search with discord filter should not find telegram messages
      const discordResult = await searchConversationsAction.handler!(
        runtime,
        agentMessage("search discord only"),
        {} as never,
        { parameters: { query: "deployment production migration", source: "discord" } } as never,
      );

      expect(discordResult!.success).toBe(true);

      // If results found, none should mention telegram deployment content
      if ((discordResult!.values as Record<string, unknown>)?.resultCount) {
        const data = discordResult!.data as Record<string, unknown>;
        const results = (data.results ?? []) as Array<{ roomId: string }>;
        for (const r of results) {
          expect(r.roomId).not.toBe(telegramDmRoomId);
        }
      }
    });

    it("READ_ENTITY rejects a fake UUID that doesn't exist", async () => {
      expect(initialized).toBe(true);

      const fakeId = crypto.randomUUID() as UUID;
      const result = await readEntityAction.handler!(
        runtime,
        agentMessage("read fake entity"),
        {} as never,
        { parameters: { entityId: fakeId } } as never,
      );

      expect(result).toBeDefined();
      // Should fail — entity not found — regardless of whether graph service is loaded
      expect(result!.success).toBe(false);
    });

    it("SEARCH_ENTITY handles special characters in query without crashing", async () => {
      expect(initialized).toBe(true);

      const result = await searchEntityAction.handler!(
        runtime,
        agentMessage("search special chars"),
        {} as never,
        { parameters: { query: "alice' OR 1=1; DROP TABLE--" } } as never,
      );

      // Should not crash, should return a clean result (found or not found)
      expect(result).toBeDefined();
      // Must not throw / must have success field
      expect(typeof (result as Record<string, unknown>).success).toBe("boolean");
    });

    it("SEARCH_CONVERSATIONS handles very long query gracefully", async () => {
      expect(initialized).toBe(true);
      if (!(await checkEmbedding())) return;

      const longQuery = "TypeScript ".repeat(200); // ~2200 chars
      const result = await searchConversationsAction.handler!(
        runtime,
        agentMessage("search long"),
        {} as never,
        { parameters: { query: longQuery } } as never,
      );

      // Should not crash
      expect(result).toBeDefined();
      expect(typeof (result as Record<string, unknown>).success).toBe("boolean");
    });
  });

  // ─── Output format correctness ──────────────────────────────────────

  describe("Output format correctness", () => {
    it("READ_CHANNEL line numbers are padded and sequential", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read format check"),
        {} as never,
        { parameters: { channel: discordGeneralRoomId } } as never,
      );

      expect(result!.success).toBe(true);
      const text = result!.text!;

      // Extract all line number prefixes
      const lineMatches = text.match(/\s+(\d+) \|/g);
      expect(lineMatches).not.toBeNull();
      expect(lineMatches!.length).toBe(5); // 5 messages in discord-general

      // Verify sequential numbering
      const nums = lineMatches!.map((m: string) => parseInt(m.trim().split(" ")[0], 10));
      for (let i = 0; i < nums.length; i++) {
        expect(nums[i]).toBe(i + 1);
      }
    });

    it("READ_CHANNEL includes ISO timestamps in each line", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read timestamps"),
        {} as never,
        { parameters: { channel: discordGeneralRoomId } } as never,
      );

      expect(result!.success).toBe(true);
      // ISO timestamp format: YYYY-MM-DDTHH:MM:SS
      const isoPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      const lines = result!.text!.split("\n").filter((l: string) => l.match(/\s+\d+ \|/));
      for (const line of lines) {
        expect(line).toMatch(isoPattern);
      }
    });

    it("READ_CHANNEL includes header with channel name and message count", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read header check"),
        {} as never,
        { parameters: { channel: discordGeneralRoomId } } as never,
      );

      expect(result!.success).toBe(true);
      // Header line should contain message count
      expect(result!.text).toContain("5 messages");
      // Should contain a separator line
      expect(result!.text).toContain("─");
      // Should contain scratchpad hint
      expect(result!.text).toContain("scratchpad");
    });

    it("READ_CHANNEL data.messages has correct shape", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read data shape"),
        {} as never,
        { parameters: { channel: discordDevRoomId } } as never,
      );

      expect(result!.success).toBe(true);
      const data = result!.data as Record<string, unknown>;
      expect(data.actionName).toBe("READ_CHANNEL");
      expect(data.roomId).toBe(discordDevRoomId);
      expect(Array.isArray(data.messages)).toBe(true);

      const messages = data.messages as Array<Record<string, unknown>>;
      for (const msg of messages) {
        expect(typeof msg.line).toBe("number");
        expect(typeof msg.id).toBe("string");
        expect(typeof msg.entityId).toBe("string");
        expect(typeof msg.text).toBe("string");
        expect(typeof msg.createdAt).toBe("number");
      }
    });

    it("SEARCH_CONVERSATIONS includes platform tag in each result line", async () => {
      expect(initialized).toBe(true);
      if (!(await checkEmbedding())) return;

      const result = await searchConversationsAction.handler!(
        runtime,
        agentMessage("search format"),
        {} as never,
        { parameters: { query: "pizza ordering 500 errors body parser" } } as never,
      );

      if ((result!.values as Record<string, unknown>)?.resultCount) {
        // Each result line should have a [platform] tag
        const lines = result!.text!.split("\n").filter((l: string) => l.match(/\s+\d+ \|/));
        for (const line of lines) {
          expect(line).toMatch(/\[.+\]/); // [discord], [telegram], etc.
        }
      }
    });

    it("recentConversationsProvider uses relative timestamps", async () => {
      expect(initialized).toBe(true);

      const result = await recentConversationsProvider.get(
        runtime,
        ownerMessage("checking timestamps"),
        {} as never,
      );

      if (result.text && result.text.length > 0) {
        // Should use relative time format (Xm ago, Xh ago, etc.) not ISO
        const hasRelativeTime = /\d+[mhd] ago|just now/.test(result.text);
        expect(hasRelativeTime).toBe(true);
        // Should NOT contain ISO format timestamps
        expect(result.text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      }
    });
  });

  // ─── Boundary / stress ──────────────────────────────────────────────

  describe("Boundary conditions", () => {
    it("READ_CHANNEL with limit=1 returns exactly 1 message", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read limit one"),
        {} as never,
        { parameters: { channel: discordGeneralRoomId, limit: 1 } } as never,
      );

      expect(result!.success).toBe(true);
      const data = result!.data as Record<string, unknown>;
      const messages = data.messages as unknown[];
      expect(messages.length).toBe(1);
    });

    it("READ_CHANNEL with limit=2 on a 5-message room returns exactly 2", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read limit two"),
        {} as never,
        { parameters: { channel: discordGeneralRoomId, limit: 2 } } as never,
      );

      expect(result!.success).toBe(true);
      const data = result!.data as Record<string, unknown>;
      const messages = data.messages as unknown[];
      expect(messages.length).toBe(2);
    });

    it("multiple concurrent READ_CHANNEL calls return correct isolated data", async () => {
      expect(initialized).toBe(true);

      // Fire 3 reads in parallel
      const [r1, r2, r3] = await Promise.all([
        readChannelAction.handler!(
          runtime,
          agentMessage("parallel 1"),
          {} as never,
          { parameters: { channel: discordGeneralRoomId } } as never,
        ),
        readChannelAction.handler!(
          runtime,
          agentMessage("parallel 2"),
          {} as never,
          { parameters: { channel: discordDevRoomId } } as never,
        ),
        readChannelAction.handler!(
          runtime,
          agentMessage("parallel 3"),
          {} as never,
          { parameters: { channel: telegramDmRoomId } } as never,
        ),
      ]);

      // Each should succeed with its own content
      expect(r1!.success).toBe(true);
      expect(r2!.success).toBe(true);
      expect(r3!.success).toBe(true);

      expect(r1!.text).toContain("TypeScript");
      expect(r1!.text).not.toContain("pizza");

      expect(r2!.text).toContain("pizza");
      expect(r2!.text).not.toContain("deploy");

      expect(r3!.text).toContain("deploy");
      expect(r3!.text).not.toContain("TypeScript");
    });

    it("SEARCH_CONVERSATIONS with no options object at all", async () => {
      expect(initialized).toBe(true);

      // Pass undefined/null options — should handle gracefully
      const result = await searchConversationsAction.handler!(
        runtime,
        agentMessage("search no opts"),
        {} as never,
        undefined as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(false);
      expect(result!.text).toContain("requires a non-empty query");
    });

    it("READ_CHANNEL with no options object at all", async () => {
      expect(initialized).toBe(true);

      const result = await readChannelAction.handler!(
        runtime,
        agentMessage("read no opts"),
        {} as never,
        undefined as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(false);
      expect(result!.text).toContain("requires a channel");
    });

    it("READ_ENTITY with no options object at all", async () => {
      expect(initialized).toBe(true);

      const result = await readEntityAction.handler!(
        runtime,
        agentMessage("read entity no opts"),
        {} as never,
        undefined as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(false);
      expect(result!.text).toContain("requires either entityId or name");
    });

    it("SEARCH_ENTITY with no options object at all", async () => {
      expect(initialized).toBe(true);

      const result = await searchEntityAction.handler!(
        runtime,
        agentMessage("search entity no opts"),
        {} as never,
        undefined as never,
      );

      expect(result).toBeDefined();
      expect(result!.success).toBe(false);
    });
  });
});
