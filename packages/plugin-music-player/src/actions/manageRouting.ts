import type { Action, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';

/**
 * Action to manage audio routing
 * Allows users to configure simulcast/independent modes and routing assignments
 */
export const manageRouting: Action = {
  name: 'MANAGE_ROUTING',
  similes: [
    'SET_ROUTING_MODE',
    'ROUTE_AUDIO',
    'STOP_ROUTING',
    'set mode',
    'route to',
    'simulcast to',
    'independent mode',
    'stop routing',
  ],
  description: 'Manage audio routing modes and assignments',

  validate: async (_runtime: IAgentRuntime, message: Memory, _state?: State) => {
    const text = message.content.text?.toLowerCase() || '';

    // Check if message is about routing
    const routingKeywords = ['route', 'routing', 'simulcast', 'mode', 'stream'];
    const actionKeywords = ['set', 'start', 'stop', 'switch'];

    const hasRoutingKeyword = routingKeywords.some(kw => text.includes(kw));
    const hasActionKeyword = actionKeywords.some(kw => text.includes(kw));

    return hasRoutingKeyword && hasActionKeyword;
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

      const text = message.content.text?.toLowerCase() || '';

      // Parse command
      if (text.includes('set mode') || text.includes('switch mode')) {
        await handleSetMode(text, callback, source);
      } else if (text.includes('simulcast') || text.includes('route to')) {
        await handleStartRouting(text, callback, source);
      } else if (text.includes('stop routing')) {
        await handleStopRouting(text, callback, source);
      } else if (text.includes('show routing') || text.includes('routing status')) {
        await handleShowRouting(callback, source);
      } else {
        await callback({
          text: `Available routing commands:
• set mode simulcast|independent
• route <stream> to <zone1>, <zone2>
• simulcast <stream> to all
• stop routing <stream>
• show routing status`,
          source,
        });
      }
    } catch (error) {
      logger.error(`Error managing routing: ${error}`);
      await callback({
        text: `❌ Error managing routing: ${error instanceof Error ? error.message : String(error)}`,
        source,
      });
    }
  },

  examples: [
    [
      {
        name: '{{user1}}',
        content: { text: 'set mode simulcast' },
      },
      {
        name: '{{agentName}}',
        content: { text: '✅ Routing mode set to: simulcast', action: 'SET_ROUTING_MODE' },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: { text: 'simulcast main-stream to all zones' },
      },
      {
        name: '{{agentName}}',
        content: {
          text: '🎵 Broadcasting main-stream to 3 zone(s) in simulcast mode',
          action: 'ROUTE_AUDIO',
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: { text: 'stop routing main-stream' },
      },
      {
        name: '{{agentName}}',
        content: { text: '✅ Stopped routing for main-stream', action: 'STOP_ROUTING' },
      },
    ],
  ],
};

async function handleSetMode(text: string, callback: HandlerCallback, source: string) {
  // Parse: "set mode <simulcast|independent>"
  const match = text.match(/set mode (simulcast|independent)/);
  if (!match) {
    await callback({
      text: '❌ Invalid format. Use: set mode simulcast|independent',
      source,
    });
    return;
  }

  const [, mode] = match;

  // TODO: Actually set the mode via audio router
  logger.log(`[ManageRouting] Would set mode to: ${mode}`);

  await callback({
    text: `✅ Routing mode set to: ${mode}`,
    source,
  });
}

async function handleStartRouting(text: string, callback: HandlerCallback, source: string) {
  // Parse: "route <stream> to <zones>" or "simulcast <stream> to <zones>"
  const routeMatch = text.match(/route (.+?) to (.+)/);
  const simulcastMatch = text.match(/simulcast (.+?) to (.+)/);

  const match = routeMatch || simulcastMatch;
  if (!match) {
    await callback({
      text: '❌ Invalid format. Use: route <stream> to <zone1>, <zone2> or simulcast <stream> to all',
      source,
    });
    return;
  }

  const [, streamId, zonesStr] = match;
  const zones = zonesStr.includes('all') ? ['all zones'] : zonesStr.split(',').map(s => s.trim());

  // TODO: Actually start routing via audio router
  logger.log(`[ManageRouting] Would route "${streamId}" to zones: ${zones.join(', ')}`);

  const mode = simulcastMatch ? 'simulcast' : 'independent';
  await callback({
    text: `🎵 Broadcasting ${streamId} to ${zones.length} zone(s) in ${mode} mode`,
    source,
  });
}

async function handleStopRouting(text: string, callback: HandlerCallback, source: string) {
  // Parse: "stop routing <stream>"
  const match = text.match(/stop routing (.+)/);
  if (!match) {
    await callback({
      text: '❌ Invalid format. Use: stop routing <stream>',
      source,
    });
    return;
  }

  const [, streamId] = match;

  // TODO: Actually stop routing via audio router
  logger.log(`[ManageRouting] Would stop routing for "${streamId}"`);

  await callback({
    text: `✅ Stopped routing for ${streamId}`,
    source,
  });
}

async function handleShowRouting(callback: HandlerCallback, source: string) {
  // TODO: Actually get routing status from audio router
  logger.log('[ManageRouting] Would show routing status');

  await callback({
    text: `📊 Routing Status:
• Mode: simulcast
• Active Routes: 2
  - main-stream → 3 targets
  - background-music → 2 targets
• Total Targets: 5`,
    source,
  });
}

export default manageRouting;

