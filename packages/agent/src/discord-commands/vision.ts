/**
 * Auto-vision: Analyse image attachments when the bot is mentioned.
 *
 * Phase 4 (2a) — hooks into the DISCORD_MESSAGE_RECEIVED event. When a
 * message mentions the bot AND has image attachments, it auto-triggers vision
 * analysis via the ANALYZE_IMAGE action from plugin-vision.
 *
 * This is zero-slash-command — it is automatic behaviour, not a user command.
 */

import { logger, type EventPayload, type IAgentRuntime, type Memory } from "@elizaos/core";
import { makeCommandMemory } from "./utils";

const LOG_PREFIX = "[discord-vision]";

/** Supported image content-types for auto-vision. */
const IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
]);

interface DiscordAttachment {
  contentType?: string | null;
  url: string;
  name?: string;
}

interface DiscordMessageParams extends EventPayload {
  message?: {
    content?: string;
    attachments?: Map<string, DiscordAttachment> | DiscordAttachment[];
    mentions?: { has?: (user: { id: string }) => boolean };
    reply?: (opts: { content: string }) => Promise<void>;
    channel?: { send?: (opts: { content: string }) => Promise<void> };
  };
  client?: { user?: { id?: string } };
}

/**
 * Register the auto-vision listener on DISCORD_MESSAGE_RECEIVED.
 * Called once from setupDiscordCommands.
 */
export function setupVisionAutoTrigger(runtime: IAgentRuntime): void {
  runtime.registerEvent(
    "DISCORD_MESSAGE_RECEIVED",
    async (params: DiscordMessageParams) => {
      const message = params?.message;
      if (!message) return;

      // Only fire when the bot is mentioned
      const botUser = params.client?.user;
      if (botUser?.id && message.mentions?.has) {
        if (!message.mentions.has(botUser as { id: string })) return;
      }

      // Collect image attachments
      const attachments = message.attachments
        ? Array.isArray(message.attachments)
          ? message.attachments
          : Array.from(message.attachments.values())
        : [];

      const imageAttachments = attachments.filter(
        (a) => a.contentType && IMAGE_CONTENT_TYPES.has(a.contentType.split(";")[0].trim()),
      );

      if (imageAttachments.length === 0) return;

      logger.info(
        `${LOG_PREFIX} Auto-vision triggered — ${imageAttachments.length} image(s) detected`,
      );

      // Find ANALYZE_IMAGE action
      const actions = runtime.getAllActions();
      const analyzeAction = actions.find((a) => a.name === "ANALYZE_IMAGE");

      if (!analyzeAction?.handler) {
        logger.warn(`${LOG_PREFIX} ANALYZE_IMAGE action not available (plugin-vision not loaded?)`);
        return;
      }

      for (const attachment of imageAttachments) {
        try {
          // Build a synthetic interaction-like object for makeCommandMemory.
          // Since this is not a slash command we build the memory manually.
          const { createUniqueUuid, stringToUuid } = await import("@elizaos/core");
          const entityId = createUniqueUuid(runtime, "discord-auto-vision");
          const roomId = createUniqueUuid(runtime, attachment.url);
          const memory = {
            id: stringToUuid(`vision-auto-${Date.now()}-${attachment.url}`),
            entityId,
            agentId: runtime.agentId,
            roomId,
            content: {
              text: `Analyze image: ${attachment.url}`,
              source: "discord",
              params: `<ANALYZE_IMAGE><url>${attachment.url}</url></ANALYZE_IMAGE>`,
              actions: ["ANALYZE_IMAGE"],
            },
          };

          const results: string[] = [];
          await analyzeAction.handler(
            runtime,
            memory as unknown as Memory,
            undefined,
            {},
            async (content: { text?: string }) => {
              if (content.text) results.push(content.text);
              return [];
            },
          );

          if (results.length > 0) {
            const reply = results.join("\n").slice(0, 2000);
            if (message.reply) {
              await message.reply({ content: `🔍 **Vision:** ${reply}` });
            } else if (message.channel?.send) {
              await message.channel.send({ content: `🔍 **Vision:** ${reply}` });
            }
          }
        } catch (err) {
          logger.error(
            `${LOG_PREFIX} Vision analysis failed for ${attachment.url}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    },
  );

  logger.info(`${LOG_PREFIX} Auto-vision listener registered`);
}
