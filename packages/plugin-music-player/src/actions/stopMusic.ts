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

/**
 * Finds the first guild with an active track.
 */
function findActiveGuildId(musicService: MusicService): string | null {
    const queues = musicService.getQueues();
    for (const [guildId] of queues) {
        if (musicService.getCurrentTrack(guildId)) return guildId;
    }
    return null;
}

export const stopMusic: Action = {
    name: 'STOP_MUSIC',
    similes: [
        'STOP_AUDIO',
        'STOP_PLAYING',
        'STOP_SONG',
        'TURN_OFF_MUSIC',
        'MUSIC_OFF',
        'SILENCE',
    ],
    description:
        'Stop playback and clear the queue. Use when the user wants music off or the queue cleared. ' +
        'Never use PLAY_AUDIO for stop — use STOP_MUSIC.',
    validate: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
        const musicService = runtime.getService(MUSIC_SERVICE_NAME) as unknown as MusicService;
        if (!musicService) return false;
        return findActiveGuildId(musicService) !== null;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: any,
        callback: HandlerCallback,
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

        const track = musicService.getCurrentTrack(guildId);
        await musicService.stopPlayback(guildId);
        musicService.clear(guildId);

        await callback({
            text: track
                ? `Stopped playing **${track.title}** and cleared the queue.`
                : 'Playback stopped.',
            source: message.content.source,
        });
    },
    examples: [
        [
            {
                name: '{{name1}}',
                content: { text: 'stop the music' },
            },
            {
                name: '{{name2}}',
                content: { text: 'Stopped the music and cleared the queue.', actions: ['STOP_MUSIC'] },
            },
        ],
        [
            {
                name: '{{name1}}',
                content: { text: 'turn off the music please' },
            },
            {
                name: '{{name2}}',
                content: { text: 'Music stopped!', actions: ['STOP_MUSIC'] },
            },
        ],
    ] as ActionExample[][],
} as Action;

export default stopMusic;
