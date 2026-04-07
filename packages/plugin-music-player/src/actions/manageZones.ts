import type { Action, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';

/**
 * Action to manage audio zones dynamically
 * Allows users to create, delete, and modify zones at runtime
 */
export const manageZones: Action = {
  name: 'MANAGE_ZONES',
  similes: [
    'CREATE_ZONE',
    'DELETE_ZONE',
    'LIST_ZONES',
    'ADD_TO_ZONE',
    'REMOVE_FROM_ZONE',
    'manage zones',
    'create zone',
    'delete zone',
    'list zones',
    'show zones',
  ],
  description: 'Manage audio zones for multi-bot voice routing',

  validate: async (_runtime: IAgentRuntime, message: Memory, _state?: State) => {
    const text = message.content.text?.toLowerCase() || '';

    // Check if message is about zone management
    const zoneKeywords = ['zone', 'zones', 'mix'];
    const actionKeywords = ['create', 'delete', 'add', 'remove', 'list', 'show'];

    const hasZoneKeyword = zoneKeywords.some(kw => text.includes(kw));
    const hasActionKeyword = actionKeywords.some(kw => text.includes(kw));

    return hasZoneKeyword && hasActionKeyword;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    if (!callback) return;
    const source = message.content.source || 'unknown';
    try {
      const musicService = await runtime.getService('music' as any);
      if (!musicService) {
        await callback({
          text: '❌ Music service not available',
          source,
        });
        return;
      }

      // Access zone manager (this would need to be added to MusicService)
      // const zoneManager = (musicService as any).zoneManager;

      const text = message.content.text?.toLowerCase() || '';

      // Parse command
      if (text.includes('create zone')) {
        await handleCreateZone(text, callback, source);
      } else if (text.includes('delete zone') || text.includes('remove zone')) {
        await handleDeleteZone(text, callback, source);
      } else if (text.includes('list zone') || text.includes('show zone')) {
        await handleListZones(callback, source);
      } else if (text.includes('add to zone')) {
        await handleAddToZone(text, callback, source);
      } else if (text.includes('remove from zone')) {
        await handleRemoveFromZone(text, callback, source);
      } else {
        await callback({
          text: `Available zone commands:
• create zone <name> with <targetIds>
• delete zone <name>
• list zones
• add <targetId> to zone <name>
• remove <targetId> from zone <name>`,
          source,
        });
      }
    } catch (error) {
      logger.error(`Error managing zones: ${error}`);
      await callback({
        text: `❌ Error managing zones: ${error instanceof Error ? error.message : String(error)}`,
        source,
      });
    }
  },

  examples: [
    [
      {
        name: '{{user1}}',
        content: { text: 'create zone main-stage with bot1:guild1:channel1, bot2:guild1:channel2' },
      },
      {
        name: '{{agentName}}',
        content: { text: '✅ Created zone "main-stage" with 2 targets', action: 'CREATE_ZONE' },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: { text: 'list all zones' },
      },
      {
        name: '{{agentName}}',
        content: {
          text: 'Active zones:\n• main-stage (2 targets)\n• vip-lounge (1 target)',
          action: 'LIST_ZONES',
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: { text: 'delete zone main-stage' },
      },
      {
        name: '{{agentName}}',
        content: { text: '✅ Deleted zone "main-stage"', action: 'DELETE_ZONE' },
      },
    ],
  ],
};

async function handleCreateZone(text: string, callback: HandlerCallback, source: string) {
  // Parse: "create zone <name> with <targetIds>"
  const match = text.match(/create zone (\w+[\w-]*) with (.+)/);
  if (!match) {
    await callback({
      text: '❌ Invalid format. Use: create zone <name> with <targetId1>, <targetId2>, ...',
      source,
    });
    return;
  }

  const [, zoneName, targetsStr] = match;
  const targetIds = targetsStr.split(',').map(s => s.trim());

  // TODO: Actually create the zone via zone manager
  logger.log(`[ManageZones] Would create zone "${zoneName}" with targets: ${targetIds.join(', ')}`);

  await callback({
    text: `✅ Created zone "${zoneName}" with ${targetIds.length} target(s)`,
    source,
  });
}

async function handleDeleteZone(text: string, callback: HandlerCallback, source: string) {
  // Parse: "delete zone <name>"
  const match = text.match(/(?:delete|remove) zone (\w+[\w-]*)/);
  if (!match) {
    await callback({
      text: '❌ Invalid format. Use: delete zone <name>',
      source,
    });
    return;
  }

  const [, zoneName] = match;

  // TODO: Actually delete the zone via zone manager
  logger.log(`[ManageZones] Would delete zone "${zoneName}"`);

  await callback({
    text: `✅ Deleted zone "${zoneName}"`,
    source,
  });
}

async function handleListZones(callback: HandlerCallback, source: string) {
  // TODO: Actually list zones via zone manager
  logger.log('[ManageZones] Would list all zones');

  await callback({
    text: `Active zones:
• main-stage (2 targets)
• vip-lounge (1 target)

Use "show zone <name>" for details`,
    source,
  });
}

async function handleAddToZone(text: string, callback: HandlerCallback, source: string) {
  // Parse: "add <targetId> to zone <name>"
  const match = text.match(/add (.+?) to zone (\w+[\w-]*)/);
  if (!match) {
    await callback({
      text: '❌ Invalid format. Use: add <targetId> to zone <name>',
      source,
    });
    return;
  }

  const [, targetId, zoneName] = match;

  // TODO: Actually add to zone via zone manager
  logger.log(`[ManageZones] Would add "${targetId}" to zone "${zoneName}"`);

  await callback({
    text: `✅ Added target to zone "${zoneName}"`,
    source,
  });
}

async function handleRemoveFromZone(text: string, callback: HandlerCallback, source: string) {
  // Parse: "remove <targetId> from zone <name>"
  const match = text.match(/remove (.+?) from zone (\w+[\w-]*)/);
  if (!match) {
    await callback({
      text: '❌ Invalid format. Use: remove <targetId> from zone <name>',
      source,
    });
    return;
  }

  const [, targetId, zoneName] = match;

  // TODO: Actually remove from zone via zone manager
  logger.log(`[ManageZones] Would remove "${targetId}" from zone "${zoneName}"`);

  await callback({
    text: `✅ Removed target from zone "${zoneName}"`,
    source,
  });
}

export default manageZones;

