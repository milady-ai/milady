import {
    type Action,
    type ActionExample,
    type Content,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
    logger,
} from '@elizaos/core';
import type { SmartMusicFetchService, FetchProgress } from '@elizaos/plugin-music-player';
import { savePlaylist, loadPlaylists } from '../components/playlists';
import type { Playlist } from '../components/playlists';

/**
 * ADD_TO_PLAYLIST action - downloads music and adds to a playlist
 * Uses smart fallback to find and download music if needed
 */
export const addToPlaylist: Action = {
    name: 'ADD_TO_PLAYLIST',
    similes: [
        'ADD_SONG_TO_PLAYLIST',
        'PUT_IN_PLAYLIST',
        'SAVE_TO_PLAYLIST',
        'ADD_TRACK_TO_PLAYLIST',
    ],
    description:
        'Add music to a playlist. If the music is not in the library, it will be downloaded first using smart fallback. Creates the playlist if it doesn\'t exist.',
    validate: async (_runtime: IAgentRuntime, _message: Memory, _state: State) => {
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback
    ) => {
        const messageText = message.content.text || '';

        // Parse message to extract song query and playlist name
        // Expected patterns: "add [song] to [playlist]", "add [song] to playlist [name]", etc.
        const addToPattern = /add\s+(.+?)\s+to\s+(?:playlist\s+)?(.+)/i;
        const match = messageText.match(addToPattern);

        if (!match) {
            await callback({
                text: 'Please specify what song to add and which playlist. Example: "add Bohemian Rhapsody to my favorites"',
                source: message.content.source,
            });
            return;
        }

        const songQuery = match[1].trim();
        const playlistName = match[2].trim();

        if (!songQuery || songQuery.length < 3) {
            await callback({
                text: "Please specify a song name (at least 3 characters).",
                source: message.content.source,
            });
            return;
        }

        if (!playlistName || playlistName.length < 2) {
            await callback({
                text: "Please specify a playlist name (at least 2 characters).",
                source: message.content.source,
            });
            return;
        }

        try {
            // Step 1: Fetch the music using smart fallback
            const { SmartMusicFetchService } = await import('@elizaos/plugin-music-player');

            const smartFetch = new SmartMusicFetchService(runtime);
            const preferredQuality = (runtime.getSetting('MUSIC_QUALITY_PREFERENCE') as string) || 'mp3_320';

            await callback({
                text: `🔍 Searching for "${songQuery}"...`,
                source: message.content.source,
            });

            let lastProgress = '';
            const onProgress = async (progress: FetchProgress) => {
                const statusText = `${progress.status}${progress.details ? `: ${progress.details}` : ''}`;
                if (statusText !== lastProgress) {
                    lastProgress = statusText;
                    logger.info(`[ADD_TO_PLAYLIST] ${statusText}`);
                }
            };

            const result = await smartFetch.fetchMusic({
                query: songQuery,
                requestedBy: message.entityId,
                onProgress,
                preferredQuality: preferredQuality as 'flac' | 'mp3_320' | 'any',
            });

            if (!result.success || !result.url) {
                await callback({
                    text: `❌ Couldn't find or download "${songQuery}". ${result.error || 'Please try a different search term.'}`,
                    source: message.content.source,
                });
                return;
            }

            // Step 2: Load or create the playlist
            const existingPlaylists = await loadPlaylists(runtime, message.entityId);
            let targetPlaylist = existingPlaylists.find(
                p => p.name.toLowerCase() === playlistName.toLowerCase()
            );

            if (!targetPlaylist) {
                // Create new playlist
                targetPlaylist = {
                    id: crypto.randomUUID(),
                    name: playlistName,
                    tracks: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
            }

            // Step 3: Add track to playlist (avoid duplicates)
            const trackExists = targetPlaylist.tracks.some(t => t.url === result.url);

            if (!trackExists) {
                targetPlaylist.tracks.push({
                    url: result.url,
                    title: result.title || songQuery,
                    duration: result.duration,
                    addedAt: Date.now(),
                });
                targetPlaylist.updatedAt = Date.now();

                // Save the playlist
                await savePlaylist(runtime, message.entityId, targetPlaylist);

                let sourceEmoji = '';
                if (result.source === 'library') {
                    sourceEmoji = '📚';
                } else if (result.source === 'ytdlp') {
                    sourceEmoji = '🎬';
                } else if (result.source === 'torrent') {
                    sourceEmoji = '🌊';
                }

                let responseText = `${sourceEmoji} Added **${result.title || songQuery}** to playlist "${playlistName}"`;
                if (result.source === 'torrent') {
                    responseText += '\n_Downloaded via torrent_';
                }
                responseText += `\n📝 Playlist now has ${targetPlaylist.tracks.length} track${targetPlaylist.tracks.length !== 1 ? 's' : ''}`;

                await callback({
                    text: responseText,
                    actions: ['ADD_TO_PLAYLIST_RESPONSE'],
                    source: message.content.source,
                });
            } else {
                await callback({
                    text: `ℹ️ **${result.title || songQuery}** is already in playlist "${playlistName}"`,
                    source: message.content.source,
                });
            }

            await runtime.createMemory(
                {
                    entityId: message.entityId,
                    agentId: message.agentId,
                    roomId: message.roomId,
                    content: {
                        source: message.content.source,
                        thought: `Added ${result.title || songQuery} to playlist ${playlistName} (source: ${result.source})`,
                        actions: ['ADD_TO_PLAYLIST'],
                    },
                    metadata: {
                        type: 'ADD_TO_PLAYLIST',
                        audioUrl: result.url,
                        title: result.title || songQuery,
                        playlistName,
                        playlistId: targetPlaylist.id,
                        source: result.source,
                    },
                },
                'messages'
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Error in ADD_TO_PLAYLIST action:', errorMessage);

            await callback({
                text: `❌ I encountered an error while trying to add "${songQuery}" to playlist "${playlistName}". ${errorMessage}`,
                source: message.content.source,
            });
        }
    },
    examples: [
        [
            {
                name: '{{name1}}',
                content: {
                    text: 'Add Stairway to Heaven to my rock classics playlist',
                },
            },
            {
                name: '{{name2}}',
                content: {
                    text: "I'll add that to your rock classics playlist!",
                    actions: ['ADD_TO_PLAYLIST'],
                },
            },
        ],
        [
            {
                name: '{{name1}}',
                content: {
                    text: 'add some Pink Floyd to playlist chill vibes',
                },
            },
            {
                name: '{{name2}}',
                content: {
                    text: "Finding Pink Floyd and adding to chill vibes!",
                    actions: ['ADD_TO_PLAYLIST'],
                },
            },
        ],
        [
            {
                name: '{{name1}}',
                content: {
                    text: 'put Bohemian Rhapsody in my favorites',
                },
            },
            {
                name: '{{name2}}',
                content: {
                    text: "Adding Bohemian Rhapsody to your favorites!",
                    actions: ['ADD_TO_PLAYLIST'],
                },
            },
        ],
    ] as ActionExample[][],
} as Action;

export default addToPlaylist;

