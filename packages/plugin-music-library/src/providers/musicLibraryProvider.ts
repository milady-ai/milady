import {
    type IAgentRuntime,
    type Memory,
    type Provider,
    type State,
    logger,
} from '@elizaos/core';
import { 
    getRecentSongs, 
    getMostPlayedSongs, 
    getLibraryStats,
    searchLibrary 
} from '../components/musicLibrary';

/**
 * Check if the message is asking about available tracks/library
 */
function isAskingAboutAvailable(messageText: string): boolean {
    const lower = messageText.toLowerCase();
    const patterns = [
        /what.*(do you|can you).*have/i,
        /what.*available/i,
        /what.*in.*library/i,
        /what.*tracks/i,
        /what.*songs/i,
        /list.*(tracks|songs|music)/i,
        /show.*(tracks|songs|music|library)/i,
        /what.*you.*got/i,
        /what.*can.*play/i,
        /available.*tracks/i,
        /available.*songs/i,
        /your.*library/i,
        /music.*library/i,
    ];
    
    return patterns.some(pattern => pattern.test(lower));
}

export const musicLibraryProvider: Provider = {
    name: 'MUSIC_LIBRARY',
    get: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> => {
        try {
            const messageText = (message.content?.text || '').trim();
            const isAskingForList = isAskingAboutAvailable(messageText);
            
            // If user is asking about available tracks, provide comprehensive list
            if (isAskingForList) {
                const stats = await getLibraryStats(runtime);
                const mostPlayed = await getMostPlayedSongs(runtime, 20);
                const recentSongs = await getRecentSongs(runtime, 10);
                
                let context = '# Music Library - Available Tracks\n\n';
                
                // Library statistics
                context += `## Library Statistics\n`;
                context += `- Total tracks in library: ${stats.totalSongs}\n`;
                context += `- Total plays: ${stats.totalPlays}\n`;
                if (stats.mostPlayed) {
                    const artist = stats.mostPlayed.artist || stats.mostPlayed.channel || 'Unknown Artist';
                    context += `- Most played: "${stats.mostPlayed.title}" by ${artist} (${stats.mostPlayed.playCount} plays)\n`;
                }
                context += '\n';
                
                // Most played tracks
                if (mostPlayed.length > 0) {
                    context += `## Most Played Tracks (Top ${mostPlayed.length})\n\n`;
                    mostPlayed.forEach((song, index) => {
                        const artist = song.artist || song.channel || 'Unknown Artist';
                        context += `${index + 1}. "${song.title}" by ${artist}`;
                        context += ` (${song.playCount} play${song.playCount !== 1 ? 's' : ''})`;
                        if (song.duration) {
                            const minutes = Math.floor(song.duration / 60);
                            const seconds = song.duration % 60;
                            context += ` - ${minutes}:${seconds.toString().padStart(2, '0')}`;
                        }
                        context += '\n';
                    });
                    context += '\n';
                }
                
                // Recently played tracks
                if (recentSongs.length > 0) {
                    context += `## Recently Played Tracks\n\n`;
                    recentSongs.forEach((song, index) => {
                        const timeAgo = formatTimeAgo(Date.now() - song.lastPlayed);
                        const artist = song.artist || song.channel || 'Unknown Artist';
                        context += `${index + 1}. "${song.title}" by ${artist}`;
                        if (song.playCount > 1) {
                            context += ` (played ${song.playCount} times)`;
                        }
                        context += ` - ${timeAgo}\n`;
                    });
                    context += '\n';
                }
                
                if (stats.totalSongs === 0) {
                    context += 'Note: The library is currently empty. Tracks will be added as they are played.\n';
                } else {
                    context += 'Note: You can ask me to play any of these tracks by name, or say "play it" to refer to the most recent track.\n';
                }
                
                return context;
            }
            
            // Default behavior: show recent songs for context
            const recentSongs = await getRecentSongs(runtime, 5);

            if (recentSongs.length === 0) {
                return '';
            }

            // Format the recent songs as context
            let context = '# Recently Played Songs\n\n';
            
            recentSongs.forEach((song, index) => {
                const timeAgo = formatTimeAgo(Date.now() - song.lastPlayed);
                const artist = song.artist || song.channel || 'Unknown Artist';
                context += `${index + 1}. "${song.title}" by ${artist}`;
                if (song.playCount > 1) {
                    context += ` (played ${song.playCount} times)`;
                }
                context += ` - ${timeAgo}\n`;
            });

            context += '\nNote: When the user says "it", "that", "this song", or similar references without specifying a song name, they are likely referring to the most recent song listed above.\n';

            return context;
        } catch (error) {
            logger.error('Error in music library provider:', error);
            return '';
        }
    },
};

/**
 * Format milliseconds into a human-readable time ago string
 */
function formatTimeAgo(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }
    if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    if (minutes > 0) {
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
    return 'just now';
}

export default musicLibraryProvider;

