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
import type { Playlist } from '../components/playlists';

const MUSIC_SERVICE_NAME = 'music';
const MUSIC_LIBRARY_SERVICE_NAME = 'musicLibrary';

export const savePlaylist: Action = {
  name: 'SAVE_PLAYLIST',
  similes: ['SAVE_QUEUE', 'CREATE_PLAYLIST', 'STORE_PLAYLIST', 'SAVE_MUSIC_LIST'],
  description: 'Save the current music queue as a playlist for the user. Works best in DMs to avoid flooding group chats.',
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

    // Get current queue
    const queue = musicService.getQueueList(currentServerId);
    const currentTrack = musicService.getCurrentTrack(currentServerId);

    if (queue.length === 0 && !currentTrack) {
      await callback({
        text: 'The queue is empty. Add some tracks before saving a playlist.',
        source: message.content.source,
      });
      return;
    }

    // Extract playlist name from message (if provided)
    const messageText = message.content.text || '';
    const nameMatch = messageText.match(/(?:save|create|store).*?playlist.*?(?:named|called|as)?\s*["']?([^"']+)["']?/i);
    const playlistName = nameMatch?.[1]?.trim() || `Playlist ${new Date().toLocaleDateString()}`;

    try {
      // Get user entity ID
      const userId = message.entityId as UUID;
      if (!userId) {
        await callback({
          text: 'I could not determine your user ID.',
          source: message.content.source,
        });
        return;
      }

      // Convert queue to playlist format
      const tracks: Array<{ url: string; title: string; duration?: number }> = [];
      if (currentTrack) {
        tracks.push({
          url: currentTrack.url,
          title: currentTrack.title,
          duration: currentTrack.duration,
        });
      }
      for (const track of queue) {
        tracks.push({
          url: track.url,
          title: track.title,
          duration: track.duration,
        });
      }

      const playlist: Omit<Playlist, 'id' | 'createdAt' | 'updatedAt'> = {
        name: playlistName,
        tracks,
      };

      const savedPlaylist = await musicLibrary.savePlaylist(userId, playlist);

      const room = state?.data?.room || (await runtime.getRoom(message.roomId));
      const isDM = room?.type === ChannelType.DM;

      let responseText = `Saved playlist "${savedPlaylist.name}" with ${savedPlaylist.tracks.length} track${savedPlaylist.tracks.length !== 1 ? 's' : ''}.`;

      if (!isDM) {
        responseText += ` 💡 Tip: You can manage playlists in DMs to keep group chats clean! Just send me a DM and say "save playlist".`;
      }

      await callback({
        text: responseText,
        source: message.content.source,
      });
    } catch (error) {
      logger.error(`Error saving playlist: ${error}`);
      await callback({
        text: 'I encountered an error while saving the playlist. Please try again.',
        source: message.content.source,
      });
    }
  },
  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'save this as a playlist',
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: 'Saved playlist "Playlist 12/25/2024" with 5 tracks.',
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'create a playlist called "My Favorites"',
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: 'Saved playlist "My Favorites" with 3 tracks.',
        },
      },
    ],
  ] as ActionExample[][],
};

export default savePlaylist;

