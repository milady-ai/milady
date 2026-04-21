/**
 * Eliza plugin for elizaOS — workspace context, session keys, and agent
 * lifecycle actions (restart).
 *
 * Compaction is handled by core auto-compaction in the recent-messages provider.
 * Memory search/get actions are superseded by plugin-scratchpad.
 */

import type { IAgentRuntime, Plugin, ServiceClass } from "@elizaos/core";
import { AgentEventService } from "@elizaos/core";
import { calendarAction } from "../actions/calendar.js";
import { emoteAction } from "../actions/emote.js";
import {
  readEntityAction,
  searchEntityAction,
} from "../actions/entity-actions.js";
import { gmailAction } from "../actions/gmail.js";
import { lifeAction } from "../actions/life.js";
import { readChannelAction } from "../actions/read-channel.js";
import { launchAppAction, stopAppAction } from "../actions/app-control.js";
import { restartAction } from "../actions/restart.js";
import { searchConversationsAction } from "../actions/search-conversations.js";
import { sendAdminMessageAction } from "../actions/send-admin-message.js";
import { setUserNameAction } from "../actions/set-user-name.js";
import {
  addRegisteredSkillSlug,
  clearRegisteredSkillSlugs,
  skillCommandAction,
} from "../actions/skill-command.js";
import { terminalAction } from "../actions/terminal.ts";
import { webSearchAction } from "../actions/web-search.js";
import {
  ensureProactiveAgentTask,
  registerProactiveTaskWorker,
} from "../activity-profile/proactive-worker.js";
import { lateJoinWhitelistEvaluator } from "../evaluators/late-join-whitelist.js";
import {
  ensureLifeOpsSchedulerTask,
  registerLifeOpsTaskWorker,
} from "../lifeops/runtime.js";
import { activityProfileProvider } from "../providers/activity-profile.js";
import { adminPanelProvider } from "../providers/admin-panel.js";
import { adminTrustProvider } from "../providers/admin-trust.js";
import { escalationTriggerProvider } from "../providers/escalation-trigger.js";
import { lifeOpsProvider } from "../providers/lifeops.js";
import { recentConversationsProvider } from "../providers/recent-conversations.js";
import { relevantConversationsProvider } from "../providers/relevant-conversations.js";
import { roleBackfillProvider } from "../providers/role-backfill.js";
import { rolodexProvider } from "../providers/rolodex.js";
import { createSessionKeyProvider } from "../providers/session-bridge.js";
import {
  getSessionProviders,
  resolveDefaultSessionStorePath,
} from "../providers/session-utils.js";
import { createChannelProfileProvider } from "../providers/simple-mode.js";
import { createDynamicSkillProvider } from "../providers/skill-provider.js";
import { uiCatalogProvider } from "../providers/ui-catalog.js";
import { createUserNameProvider } from "../providers/user-name.js";
import { resolveDefaultAgentWorkspaceDir } from "../providers/workspace.js";
import { createWorkspaceProvider } from "../providers/workspace-provider.js";
import { MiladyCharacterPersistenceService } from "../services/character-persistence.js";
import { inboxTriageAction } from "../actions/inbox-triage.js";
import { inboxDigestAction } from "../actions/inbox-digest.js";
import { inboxRespondAction } from "../actions/inbox-respond.js";
import { inboxTriageProvider } from "../providers/inbox-triage.js";
import { createTriggerTaskAction } from "../triggers/action.js";
import { registerTriggerTaskWorker } from "../triggers/runtime.js";
import { setCustomActionsRuntime } from "./custom-actions.js";

export type ElizaPluginConfig = {
  workspaceDir?: string;
  initMaxChars?: number;
  sessionStorePath?: string;
  agentId?: string;
};

export function createElizaPlugin(config?: ElizaPluginConfig): Plugin {
  const workspaceDir =
    config?.workspaceDir ?? resolveDefaultAgentWorkspaceDir();
  const agentId = config?.agentId ?? "main";
  const sessionStorePath =
    config?.sessionStorePath ?? resolveDefaultSessionStorePath(agentId);

  const baseProviders = [
    createChannelProfileProvider(),
    createWorkspaceProvider({
      workspaceDir,
      maxCharsPerFile: config?.initMaxChars,
    }),
    adminTrustProvider,
    adminPanelProvider,
    lifeOpsProvider,
    activityProfileProvider,

    createSessionKeyProvider({ defaultAgentId: agentId }),
    ...getSessionProviders({ storePath: sessionStorePath }),
    createDynamicSkillProvider(),
    createUserNameProvider(),
  ];

  // Emote IDs are now declared as an enum on the PLAY_EMOTE action parameter,
  // so they appear in the `# Available Actions` section automatically via
  // core's formatActions. No separate provider injection needed.
  //
  // Backwards-compat: character.settings.DISABLE_EMOTES still works — when set,
  // the PLAY_EMOTE action is excluded at init time so it never appears in the
  // prompt. Previously this was checked per-request in the emote provider.

  const plugin: Plugin = {
    name: "eliza",
    description: "Eliza workspace context, session keys, and lifecycle actions",

    services: [
      AgentEventService as ServiceClass,
      MiladyCharacterPersistenceService as ServiceClass,
    ],

    init: async (_pluginConfig, runtime: IAgentRuntime) => {
      registerTriggerTaskWorker(runtime);
      registerLifeOpsTaskWorker(runtime);
      registerProactiveTaskWorker(runtime);
      setCustomActionsRuntime(runtime);
      void ensureLifeOpsSchedulerTask(runtime).catch((error) => {
        runtime.logger?.warn?.(
          `[lifeops] Failed to ensure scheduler task: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      void ensureProactiveAgentTask(runtime).catch((error) => {
        runtime.logger?.warn?.(
          `[proactive] Failed to ensure proactive task: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

      // Honour DISABLE_EMOTES: remove PLAY_EMOTE so it never appears in prompts.
      if (runtime.character?.settings?.DISABLE_EMOTES) {
        const idx = plugin.actions?.findIndex((a) => a.name === "PLAY_EMOTE");
        if (idx != null && idx >= 0) {
          plugin.actions?.splice(idx, 1);
        }
      }

      // ── Auto-register skills as slash commands ───────────────────────
      // Runs after plugin-agent-skills init so getLoadedSkills() is populated.
      // Uses a deferred check because skill loading is async and may complete
      // after this init() returns.
      const registerSkillsAsCommands = () => {
        try {
          const skillsService = runtime.getService(
            "AGENT_SKILLS_SERVICE",
          ) as unknown as
            | {
                getLoadedSkills: () => Array<{
                  slug: string;
                  name: string;
                  description: string;
                }>;
              }
            | undefined;
          if (!skillsService) return false;

          const skills = skillsService.getLoadedSkills();
          if (skills.length === 0) return false;

          // Dynamically import plugin-commands registry (may not be loaded)
          let registerCommand: (cmd: Record<string, unknown>) => void;
          let initForRuntime: (agentId: string) => void;
          try {
            const cmds = require("@elizaos/plugin-commands");
            registerCommand = cmds.registerCommand;
            initForRuntime = cmds.initForRuntime;
          } catch {
            return false; // plugin-commands not available
          }

          // Ensure the command store is scoped to this runtime
          initForRuntime(runtime.agentId);
          clearRegisteredSkillSlugs();

          let registered = 0;
          for (const skill of skills) {
            const slug = skill.slug.toLowerCase();
            try {
              registerCommand({
                key: `skill-${slug}`,
                description: skill.description.substring(0, 80),
                textAliases: [`/${slug}`],
                scope: "both",
                category: "skills",
                acceptsArgs: true,
                args: [
                  {
                    name: "input",
                    description: "Task or question for this skill",
                    captureRemaining: true,
                  },
                ],
              });
              addRegisteredSkillSlug(slug);
              registered++;
            } catch {
              // Command may already be registered (e.g. /stop conflicts)
            }
          }

          if (registered > 0) {
            const { logger } = require("@elizaos/core");
            logger.info(
              `[eliza] Registered ${registered} skills as slash commands`,
            );
          }
          return true;
        } catch {
          return false;
        }
      };

      // Try immediately, then retry after a delay for async skill loading
      if (!registerSkillsAsCommands()) {
        setTimeout(registerSkillsAsCommands, 5000);
      }
    },

    providers: [
      ...baseProviders,

      recentConversationsProvider,
      relevantConversationsProvider,
      rolodexProvider,

      uiCatalogProvider,
      roleBackfillProvider,
      escalationTriggerProvider,
      inboxTriageProvider,
    ],

    evaluators: [lateJoinWhitelistEvaluator],

    actions: [
      restartAction,
      launchAppAction,
      stopAppAction,
      sendAdminMessageAction,
      terminalAction,
      createTriggerTaskAction,
      emoteAction,
      calendarAction,
      gmailAction,
      lifeAction,
      setUserNameAction,
      skillCommandAction,
      webSearchAction,
      readChannelAction,
      searchConversationsAction,
      searchEntityAction,
      readEntityAction,
      inboxTriageAction,
      inboxDigestAction,
      inboxRespondAction,
    ],
  };

  return plugin;
}
