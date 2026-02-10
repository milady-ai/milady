/**
 * Milaidy plugin for ElizaOS — workspace context, session keys, and agent
 * lifecycle actions (restart).
 *
 * Compaction is now a built-in runtime action (COMPACT_SESSION in basic-capabilities).
 * Memory search/get actions are superseded by plugin-scratchpad.
 */

import type {
  IAgentRuntime,
  Memory,
  MessagePayload,
  Plugin,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import {
  attachmentsProvider,
  entitiesProvider,
  factsProvider,
  getSessionProviders,
  resolveDefaultSessionStorePath,
} from "@elizaos/core";
import { restartAction } from "../actions/restart.js";
import {
  createSessionKeyProvider,
  resolveSessionKeyFromRoom,
} from "../providers/session-bridge.js";
import { generateCatalogPrompt } from "../shared/ui-catalog-prompt.js";
import { DEFAULT_AGENT_WORKSPACE_DIR } from "../providers/workspace.js";
import { createWorkspaceProvider } from "../providers/workspace-provider.js";

export type MilaidyPluginConfig = {
  workspaceDir?: string;
  bootstrapMaxChars?: number;
  sessionStorePath?: string;
  agentId?: string;
  /**
   * Enable bootstrap providers (attachments, entities, facts).
   * These add context but can consume significant tokens.
   * @default true
   */
  enableBootstrapProviders?: boolean;
};

export function createMilaidyPlugin(config?: MilaidyPluginConfig): Plugin {
  const workspaceDir = config?.workspaceDir ?? DEFAULT_AGENT_WORKSPACE_DIR;
  const agentId = config?.agentId ?? "main";
  const sessionStorePath =
    config?.sessionStorePath ?? resolveDefaultSessionStorePath(agentId);
  const enableBootstrap = config?.enableBootstrapProviders ?? true;

  const baseProviders = [
    createWorkspaceProvider({
      workspaceDir,
      maxCharsPerFile: config?.bootstrapMaxChars,
    }),
    createSessionKeyProvider({ defaultAgentId: agentId }),
    ...getSessionProviders({ storePath: sessionStorePath }),
  ];

  // Optionally add bootstrap providers (can be heavy for small context windows)
  const bootstrapProviders = enableBootstrap
    ? [attachmentsProvider, entitiesProvider, factsProvider]
    : [];

  // UI catalog provider — injects component knowledge so the agent can
  // generate UiSpec JSON and [CONFIG:pluginId] markers in responses.
  let catalogCache: string | null = null;
  const uiCatalogProvider: Provider = {
    name: "uiCatalog",
    description: "UI component catalog for rich chat responses",

    async get(
      runtime: IAgentRuntime,
      _message: Memory,
      _state: State,
    ): Promise<ProviderResult> {
      if (!catalogCache) {
        catalogCache = generateCatalogPrompt({ includeExamples: true });
      }
      // Build plugin list with short IDs for [CONFIG:id] markers.
      // Runtime plugin names are like "@elizaos/plugin-knowledge" — extract
      // the short id ("knowledge") so the agent outputs valid markers.
      const pluginLines = (runtime.plugins ?? []).map((p) => {
        const name = p.name ?? "";
        const short = name.replace(/^@elizaos\/plugin-/, "").replace(/^plugin-/, "");
        return `- ${short} (${name})`;
      });
      return {
        text: [
          catalogCache,
          "",
          "## UI Response Instructions",
          "",
          "### Plugin configuration forms",
          "When a user asks to configure, set up, or enable a plugin, include a `[CONFIG:pluginId]` marker in your response.",
          "The pluginId is the SHORT id from the list below (e.g. `telegram`, `knowledge`, `openai`).",
          "Example: \"Let me pull up the configuration for the knowledge plugin. [CONFIG:knowledge]\"",
          "The marker will be replaced with an interactive config form in the UI.",
          "",
          "### Rich interactive UI",
          "When showing dashboards, analytics, status overviews, or interactive UI, output UiSpec JSON in fenced ```json blocks.",
          "",
          "### Normal replies",
          "For normal conversational replies, respond with plain text only — do not output JSON or markers.",
          "",
          "### Available plugins (use the short id for CONFIG markers):",
          ...pluginLines,
        ].join("\n"),
      };
    },
  };

  return {
    name: "milaidy",
    description:
      "Milaidy workspace context, session keys, and lifecycle actions",

    providers: [...baseProviders, ...bootstrapProviders, uiCatalogProvider],

    actions: [restartAction],

    events: {
      // Inject Milaidy session keys into inbound messages before processing
      MESSAGE_RECEIVED: [
        async (payload: MessagePayload) => {
          const { runtime, message } = payload;
          if (!message || !runtime) return;

          // Ensure metadata is initialized so we can read and write to it.
          if (!message.metadata) {
            message.metadata = {
              type: "message",
            } as unknown as typeof message.metadata;
          }
          const meta = message.metadata as Record<string, unknown>;
          if (meta.sessionKey) return;

          const room = await runtime.getRoom(message.roomId);
          if (!room) return;

          const key = resolveSessionKeyFromRoom(agentId, room, {
            threadId: meta.threadId as string | undefined,
            groupId: meta.groupId as string | undefined,
            channel: (meta.channel as string | undefined) ?? room.source,
          });
          meta.sessionKey = key;
        },
      ],
    },
  };
}
