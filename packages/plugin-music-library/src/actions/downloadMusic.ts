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

/**
 * DOWNLOAD_MUSIC action - downloads music to library without playing
 * Uses smart fallback from plugin-music-player to find and download music
 */
export const downloadMusic: Action = {
    name: 'DOWNLOAD_MUSIC',
    similes: [
        'FETCH_MUSIC',
        'GET_MUSIC',
        'DOWNLOAD_SONG',
        'SAVE_MUSIC',
        'GRAB_MUSIC',
    ],
    description:
        'Download music to the local library without playing it. Uses smart fallback to find and download music from various sources (library, streaming, torrents).',
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
        const query = messageText.trim();
        
        if (!query || query.length < 3) {
            await callback({
                text: "Please tell me what song you'd like to download (at least 3 characters).",
                source: message.content.source,
            });
            return;
        }

        try {
            // Dynamically import SmartMusicFetchService from plugin-music-player
            const { SmartMusicFetchService } = await import('@elizaos/plugin-music-player');
            
            const smartFetch = new SmartMusicFetchService(runtime);
            const preferredQuality = (runtime.getSetting('MUSIC_QUALITY_PREFERENCE') as string) || 'mp3_320';
            
            // Send initial status
            await callback({
                text: `🔍 Searching for "${query}"...`,
                source: message.content.source,
            });

            let lastProgress = '';
            const onProgress = async (progress: FetchProgress) => {
                const statusText = `${progress.status}${progress.details ? `: ${progress.details}` : ''}`;
                if (statusText !== lastProgress) {
                    lastProgress = statusText;
                    logger.info(`[DOWNLOAD_MUSIC] ${statusText}`);
                    
                    // Send progress updates
                    await callback({
                        text: `🎵 ${statusText}`,
                        source: message.content.source,
                    });
                }
            };

            const result = await smartFetch.fetchMusic({
                query,
                requestedBy: message.entityId,
                onProgress,
                preferredQuality: preferredQuality as 'flac' | 'mp3_320' | 'any',
            });

            if (!result.success || !result.url) {
                await callback({
                    text: `❌ Couldn't find or download "${query}". ${result.error || 'Please try a different search term.'}`,
                    source: message.content.source,
                });
                return;
            }

            let sourceEmoji = '';
            let sourceText = '';
            if (result.source === 'library') {
                sourceEmoji = '📚';
                sourceText = 'Already in your library';
            } else if (result.source === 'ytdlp') {
                sourceEmoji = '🎬';
                sourceText = 'Downloaded from streaming service';
            } else if (result.source === 'torrent') {
                sourceEmoji = '🌊';
                sourceText = 'Downloaded via torrent';
            }

            const responseText = `${sourceEmoji} **${result.title || query}** - ${sourceText}\n✅ Available in your music library`;

            await runtime.createMemory(
                {
                    entityId: message.entityId,
                    agentId: message.agentId,
                    roomId: message.roomId,
                    content: {
                        source: message.content.source,
                        thought: `Downloaded music: ${result.title || query} (source: ${result.source})`,
                        actions: ['DOWNLOAD_MUSIC'],
                    },
                    metadata: {
                        type: 'DOWNLOAD_MUSIC',
                        audioUrl: result.url,
                        title: result.title || query,
                        source: result.source,
                    },
                },
                'messages'
            );

            await callback({
                text: responseText,
                actions: ['DOWNLOAD_MUSIC_RESPONSE'],
                source: message.content.source,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Error in DOWNLOAD_MUSIC action:', errorMessage);

            await callback({
                text: `❌ I encountered an error while trying to download "${query}". ${errorMessage}`,
                source: message.content.source,
            });
        }
    },
    examples: [
        [
            {
                name: '{{name1}}',
                content: {
                    text: 'Download Comfortably Numb by Pink Floyd',
                },
            },
            {
                name: '{{name2}}',
                content: {
                    text: "I'll download that to your library!",
                    actions: ['DOWNLOAD_MUSIC'],
                },
            },
        ],
        [
            {
                name: '{{name1}}',
                content: {
                    text: 'fetch some Led Zeppelin for me',
                },
            },
            {
                name: '{{name2}}',
                content: {
                    text: "Searching and downloading Led Zeppelin!",
                    actions: ['DOWNLOAD_MUSIC'],
                },
            },
        ],
        [
            {
                name: '{{name1}}',
                content: {
                    text: 'grab the entire Dark Side of the Moon album',
                },
            },
            {
                name: '{{name2}}',
                content: {
                    text: "I'll download that album for you!",
                    actions: ['DOWNLOAD_MUSIC'],
                },
            },
        ],
    ] as ActionExample[][],
} as Action;

export default downloadMusic;

