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

const MUSIC_LIBRARY_SERVICE_NAME = 'musicLibrary';

export const deletePlaylist: Action = {
    name: 'DELETE_PLAYLIST',
    similes: ['REMOVE_PLAYLIST', 'DELETE_SAVED_PLAYLIST', 'REMOVE_SAVED_PLAYLIST'],
    description: 'Delete a saved playlist. Works best in DMs to avoid flooding group chats.',
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

        const musicLibrary = runtime.getService(MUSIC_LIBRARY_SERVICE_NAME) as MusicLibraryService | null;
        if (!musicLibrary) {
            await callback({
                text: 'Music library service is not available.',
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
                    text: "You don't have any saved playlists to delete.",
                    source: message.content.source,
                });
                return;
            }

            // Extract playlist name from message
            const messageText = message.content.text || '';
            let playlistName: string | undefined;

            // Try to match playlist name in various formats
            const nameMatch = messageText.match(/(?:delete|remove).*?playlist.*?(?:named|called)?\s*["']?([^"']+)["']?/i);
            if (nameMatch) {
                playlistName = nameMatch[1]?.trim();
            } else {
                // Try to find a quoted string
                const quotedMatch = messageText.match(/["']([^"']+)["']/);
                if (quotedMatch) {
                    playlistName = quotedMatch[1]?.trim();
                }
            }

            if (!playlistName) {
                // List available playlists if name not provided
                const playlistList = playlists.map((p) => `"${p.name}"`).join(', ');
                await callback({
                    text: `Please specify which playlist to delete. Your playlists: ${playlistList}\n\nExample: "delete playlist My Favorites"`,
                    source: message.content.source,
                });
                return;
            }

            // Find playlist by name (case-insensitive)
            const selectedPlaylist = playlists.find(
                (p) => p.name.toLowerCase() === playlistName!.toLowerCase()
            );

            if (!selectedPlaylist) {
                const playlistList = playlists.map((p) => `"${p.name}"`).join(', ');
                await callback({
                    text: `I couldn't find a playlist named "${playlistName}". Your playlists: ${playlistList}`,
                    source: message.content.source,
                });
                return;
            }

            // Delete the playlist
            const deleted = await musicLibrary.deletePlaylist(userId, selectedPlaylist.id);

            if (!deleted) {
                await callback({
                    text: 'I encountered an error while deleting the playlist. Please try again.',
                    source: message.content.source,
                });
                return;
            }

            const room = state?.data?.room || (await runtime.getRoom(message.roomId));
            const isDM = room?.type === ChannelType.DM;

            let responseText = `Deleted playlist "${selectedPlaylist.name}".`;

            if (!isDM) {
                responseText += ` 💡 Tip: You can manage playlists in DMs to keep group chats clean! Just send me a DM.`;
            }

            await callback({
                text: responseText,
                source: message.content.source,
            });
        } catch (error) {
            logger.error(`Error deleting playlist: ${error}`);
            await callback({
                text: 'I encountered an error while deleting the playlist. Please try again.',
                source: message.content.source,
            });
        }
    },
    examples: [
        [
            {
                name: '{{name1}}',
                content: {
                    text: 'delete playlist "My Favorites"',
                },
            },
            {
                name: '{{agentName}}',
                content: {
                    text: 'Deleted playlist "My Favorites".',
                },
            },
        ],
        [
            {
                name: '{{name1}}',
                content: {
                    text: 'remove playlist Workout Mix',
                },
            },
            {
                name: '{{agentName}}',
                content: {
                    text: 'Deleted playlist "Workout Mix".',
                },
            },
        ],
    ] as ActionExample[][],
};

export default deletePlaylist;

