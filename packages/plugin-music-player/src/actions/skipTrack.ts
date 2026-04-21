import {
    type Action,
    type ActionExample,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
} from '@elizaos/core';
import { MusicService } from '../service';
import { resolveMusicGuildIdForPlayback } from '../utils/resolveMusicGuildId';

const MUSIC_SERVICE_NAME = 'music';

export const skipTrack: Action = {
    name: 'SKIP_TRACK',
    similes: ['SKIP', 'NEXT_TRACK', 'SKIP_SONG', 'NEXT_SONG'],
    description:
        'Skip the current track and play the next queued song. Use for skip, next track, or next song. ' +
        'Never use PLAY_AUDIO for skip — use SKIP_TRACK.',
    validate: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
        const musicService = runtime.getService(MUSIC_SERVICE_NAME) as unknown as MusicService;
        if (!musicService) return false;
        // Allow from any source — find any active guild
        const queues = musicService.getQueues();
        for (const [guildId] of queues) {
            if (musicService.getCurrentTrack(guildId)) return true;
        }
        return false;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: any,
        callback: HandlerCallback
    ) => {
        const musicService = runtime.getService(MUSIC_SERVICE_NAME) as unknown as MusicService;
        if (!musicService) {
            await callback({
                text: 'Music service is not available.',
                source: message.content.source,
            });
            return;
        }

        const room = state.data?.room || (await runtime.getRoom(message.roomId));
        const guildId = resolveMusicGuildIdForPlayback(message, room, musicService);

        if (!guildId) {
            await callback({
                text: 'Nothing is playing right now.',
                source: message.content.source,
            });
            return;
        }

        const currentTrack = musicService.getCurrentTrack(guildId);
        if (!currentTrack) {
            await callback({
                text: 'No track is currently playing.',
                source: message.content.source,
            });
            return;
        }

        const skipped = await musicService.skip(guildId, message.entityId);
        if (skipped && currentTrack) {
            const nextTrack = musicService.getCurrentTrack(guildId);
            if (nextTrack) {
                await callback({
                    text: `Skipped **${currentTrack.title}**. Now playing: **${nextTrack.title}**`,
                    source: message.content.source,
                });
            } else {
                await callback({
                    text: `Skipped **${currentTrack.title}**. Queue is now empty.`,
                    source: message.content.source,
                });
            }
        } else {
            await callback({
                text: 'Failed to skip track.',
                source: message.content.source,
            });
        }
    },
    examples: [
        [
            {
                name: '{{name1}}',
                content: { text: 'skip' },
            },
            {
                name: '{{name2}}',
                content: { text: 'Skipping to the next track!', actions: ['SKIP_TRACK'] },
            },
        ],
    ] as ActionExample[][],
} as Action;

export default skipTrack;

