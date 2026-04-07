import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
  type UUID,
  ChannelType,
} from '@elizaos/core';
import type { MusicLibraryService } from '../services/musicLibraryService';

const MUSIC_SERVICE_NAME = 'music';
const MUSIC_LIBRARY_SERVICE_NAME = 'musicLibrary';

export const loadPlaylist: Action = {
  name: 'LOAD_PLAYLIST',
  similes: ['PLAY_PLAYLIST', 'LOAD_QUEUE', 'RESTORE_PLAYLIST', 'PLAY_SAVED_PLAYLIST'],
  description: 'Load a saved playlist and add all tracks to the queue. Works best in DMs to avoid flooding group chats.',
  validate: async (_runtime: IAgentRuntime, message: Memory, _state?: State) => {
    if (message.content.source !== 'discord') {
      return false;
    }
    
    // Prefer DMs, but allow in any channel
    return true;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: any,
    callback?: HandlerCallback
  ) => {
    if (!callback) {
      return;
    }

    const musicService = runtime.getService(MUSIC_SERVICE_NAME) as any;
    if (!musicService) {
      await callback({
        text: 'Music service is not available.',
        source: message.content.source,
      });
      return;
    }

    const musicLibrary = runtime.getService(MUSIC_LIBRARY_SERVICE_NAME) as MusicLibraryService | null;
    if (!musicLibrary) {
      await callback({
        text: 'Music library service is not available.',
        source: message.content.source,
      });
      return;
    }

    const room = state?.data?.room || (await runtime.getRoom(message.roomId));
    const currentServerId = room?.serverId;

    if (!currentServerId) {
      await callback({
        text: 'I could not determine which server you are in.',
        source: message.content.source,
      });
      return;
    }

    // Get user entity ID
    const userId = message.entityId as UUID;
    if (!userId) {
      await callback({
        text: 'I could not determine your user ID.',
        source: message.content.source,
      });
      return;
    }

    try {
      // Get all playlists for the user
      const playlists = await musicLibrary.loadPlaylists(userId);

      if (playlists.length === 0) {
        await callback({
          text: "You don't have any saved playlists. Save a queue first using 'save playlist'.",
          source: message.content.source,
        });
        return;
      }

      // Extract playlist name from message (if provided)
      const messageText = message.content.text || '';
      let playlistName: string | undefined;
      
      // Try to match playlist name in various formats
      const nameMatch = messageText.match(/(?:load|play|restore).*?playlist.*?(?:named|called)?\s*["']?([^"']+)["']?/i);
      if (nameMatch) {
        playlistName = nameMatch[1]?.trim();
      } else {
        // Try to find a quoted string
        const quotedMatch = messageText.match(/["']([^"']+)["']/);
        if (quotedMatch) {
          playlistName = quotedMatch[1]?.trim();
        }
      }

      let selectedPlaylist;
      if (playlistName) {
        // Find playlist by name (case-insensitive)
        selectedPlaylist = playlists.find(
          (p) => p.name.toLowerCase() === playlistName!.toLowerCase()
        );
        if (!selectedPlaylist) {
          await callback({
            text: `I couldn't find a playlist named "${playlistName}". Your playlists: ${playlists.map((p) => `"${p.name}"`).join(', ')}`,
            source: message.content.source,
          });
          return;
        }
      } else {
        // If no name specified, use the most recent playlist
        selectedPlaylist = playlists.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      }

      // Add all tracks from playlist to queue
      let addedCount = 0;
      for (const track of selectedPlaylist.tracks) {
        try {
          await musicService.addTrack(currentServerId, {
            url: track.url,
            title: track.title,
            duration: track.duration,
            requestedBy: userId,
          });
          addedCount++;
        } catch (error) {
          logger.error(`Error adding track ${track.url} to queue: ${error}`);
        }
      }

      const room = state?.data?.room || (await runtime.getRoom(message.roomId));
      const isDM = room?.type === ChannelType.DM;
      
      let responseText = `Loaded playlist "${selectedPlaylist.name}" and added ${addedCount} track${addedCount !== 1 ? 's' : ''} to the queue.`;
      
      if (!isDM) {
        responseText += ` 💡 Tip: You can manage playlists in DMs to keep group chats clean! Just send me a DM.`;
      }

      await callback({
        text: responseText,
        source: message.content.source,
      });
    } catch (error) {
      logger.error(`Error loading playlist: ${error}`);
      await callback({
        text: 'I encountered an error while loading the playlist. Please try again.',
        source: message.content.source,
      });
    }
  },
  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'load my playlist',
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: 'Loaded playlist "My Favorites" and added 5 tracks to the queue.',
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'play playlist "Workout Mix"',
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: 'Loaded playlist "Workout Mix" and added 10 tracks to the queue.',
        },
      },
    ],
  ] as ActionExample[][],
};

export default loadPlaylist;

