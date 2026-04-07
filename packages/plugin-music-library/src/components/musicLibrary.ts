// @ts-nocheck - Type cast issues with roomId expecting string | undefined but UUID is fine at runtime
import {
    type IAgentRuntime,
    type Memory,
    type UUID,
    logger,
} from '@elizaos/core';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';

/**
 * Represents a song in the global music library
 */
export interface LibrarySong {
    id: string;
    url: string;
    title: string;
    artist?: string;
    channel?: string;
    duration?: number;
    playCount: number;
    lastPlayed: number; // timestamp
    firstAdded: number; // timestamp
    requestedBy: Set<string>; // set of user IDs who requested this song
}

const MUSIC_LIBRARY_NAMESPACE = '7f3e5e3e-8f3e-4e3e-8f3e-7f3e5e3e8f3e';
const MUSIC_LIBRARY_TABLE = 'music_library';

/**
 * Generate a deterministic UUID for a song based on its URL
 */
function generateSongId(url: string): string {
    // Normalize the URL to handle different formats
    const normalizedUrl = url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '');
    return uuidv5(normalizedUrl, MUSIC_LIBRARY_NAMESPACE);
}

/**
 * Internal: Convert stored song data to LibrarySong with Set
 */
function hydrateSong(stored: any): LibrarySong {
    return {
        ...stored,
        requestedBy: new Set(stored.requestedBy || []),
    };
}

/**
 * Internal: Convert LibrarySong to storable format
 */
function dehydrateSong(song: LibrarySong): any {
    return {
        ...song,
        requestedBy: Array.from(song.requestedBy),
    };
}

/**
 * Get a song from the library by URL
 */
export async function getSong(
    runtime: IAgentRuntime,
    url: string
): Promise<LibrarySong | null> {
    const songId = generateSongId(url);

    try {
        // Need to get ALL memories to find the specific song
        // count: 1 would only return one random memory, not necessarily the song we want
        const memories = await runtime.getMemories({
            tableName: MUSIC_LIBRARY_TABLE,
            roomId: runtime.agentId as string | undefined as any, // Use agentId as global scope
            count: 1000, // Get enough to find the song
        });

        const songMemory = memories.find((m) => m.content.songId === songId);
        if (songMemory && songMemory.content.song) {
            return hydrateSong(songMemory.content.song);
        }
    } catch (error) {
        logger.debug(`Song not found in library: ${url}`);
    }

    return null;
}

/**
 * Add or update a song in the library
 */
export async function addSongToLibrary(
    runtime: IAgentRuntime,
    songData: {
        url: string;
        title: string;
        artist?: string;
        channel?: string;
        duration?: number;
        requestedBy?: string;
    }
): Promise<LibrarySong> {
    const songId = generateSongId(songData.url);
    const now = Date.now();

    // Try to get existing song
    let song = await getSong(runtime, songData.url);

    if (song) {
        // Update existing song
        song.playCount++;
        song.lastPlayed = now;
        if (songData.requestedBy) {
            song.requestedBy.add(songData.requestedBy);
        }
        // Update metadata if provided
        if (songData.title) song.title = songData.title;
        if (songData.artist) song.artist = songData.artist;
        if (songData.channel) song.channel = songData.channel;
        if (songData.duration) song.duration = songData.duration;
    } else {
        // Create new song
        song = {
            id: songId,
            url: songData.url,
            title: songData.title,
            artist: songData.artist,
            channel: songData.channel,
            duration: songData.duration,
            playCount: 1,
            lastPlayed: now,
            firstAdded: now,
            requestedBy: songData.requestedBy ? new Set([songData.requestedBy]) : new Set(),
        };
    }

    // Save to music_library table
    const memory: Memory = {
        id: uuidv4() as UUID,
        entityId: runtime.agentId, // Global scope
        agentId: runtime.agentId,
        roomId: runtime.agentId, // Use agentId as global room
        content: {
            songId,
            song: dehydrateSong(song),
            text: `${song.title} - ${song.artist || song.channel || 'Unknown'}`,
            source: 'music_library',
        },
        createdAt: now,
    };

    await runtime.createMemory(memory, MUSIC_LIBRARY_TABLE);

    logger.info(`[MusicLibrary] Added song to library: "${song.title}" (${song.playCount} plays, ID: ${songId.slice(0, 8)}...)`);

    return song;
}

/**
 * Get recent songs from the library (sorted by last played)
 */
export async function getRecentSongs(
    runtime: IAgentRuntime,
    limit: number = 10
): Promise<LibrarySong[]> {
    try {
        const memories = await runtime.getMemories({
            tableName: MUSIC_LIBRARY_TABLE,
            roomId: runtime.agentId as string | undefined as any,
            count: 100, // Get more than we need to sort
        });

        logger.debug(`[MusicLibrary] getRecentSongs: Found ${memories.length} raw memories in ${MUSIC_LIBRARY_TABLE}`);

        const songs = memories
            .filter((m) => m.content.song)
            .map((m) => hydrateSong(m.content.song))
            .sort((a, b) => b.lastPlayed - a.lastPlayed)
            .slice(0, limit);

        logger.debug(`[MusicLibrary] getRecentSongs: Returning ${songs.length} songs`);

        return songs;
    } catch (error) {
        logger.error('[MusicLibrary] Error getting recent songs:', error);
        return [];
    }
}

/**
 * Search the library for songs matching a query
 */
export async function searchLibrary(
    runtime: IAgentRuntime,
    query: string,
    limit: number = 10
): Promise<LibrarySong[]> {
    try {
        const memories = await runtime.getMemories({
            tableName: MUSIC_LIBRARY_TABLE,
            roomId: runtime.agentId as string | undefined as any,
            count: 500, // Get a good sample to search through
        });

        const lowerQuery = query.toLowerCase();
        const matches: LibrarySong[] = [];

        for (const memory of memories) {
            if (!memory.content.song) continue;

            const song = hydrateSong(memory.content.song);
            const titleMatch = song.title.toLowerCase().includes(lowerQuery);
            const artistMatch = song.artist?.toLowerCase().includes(lowerQuery);
            const channelMatch = song.channel?.toLowerCase().includes(lowerQuery);

            if (titleMatch || artistMatch || channelMatch) {
                matches.push(song);
            }
        }

        // Sort by play count (descending) and last played (descending)
        matches.sort((a, b) => {
            if (a.playCount !== b.playCount) {
                return b.playCount - a.playCount;
            }
            return b.lastPlayed - a.lastPlayed;
        });

        return matches.slice(0, limit);
    } catch (error) {
        logger.error('Error searching library:', error);
        return [];
    }
}

/**
 * Get the most recently played song
 */
export async function getLastPlayedSong(
    runtime: IAgentRuntime
): Promise<LibrarySong | null> {
    const recent = await getRecentSongs(runtime, 1);
    return recent[0] || null;
}

/**
 * Get all songs sorted by play count
 */
export async function getMostPlayedSongs(
    runtime: IAgentRuntime,
    limit: number = 10
): Promise<LibrarySong[]> {
    try {
        const memories = await runtime.getMemories({
            tableName: MUSIC_LIBRARY_TABLE,
            roomId: runtime.agentId as string | undefined as any,
            count: 500,
        });

        const songs = memories
            .filter((m) => m.content.song)
            .map((m) => hydrateSong(m.content.song))
            .sort((a, b) => {
                if (a.playCount !== b.playCount) {
                    return b.playCount - a.playCount;
                }
                return b.lastPlayed - a.lastPlayed;
            })
            .slice(0, limit);

        return songs;
    } catch (error) {
        logger.error('Error getting most played songs:', error);
        return [];
    }
}

/**
 * Get library statistics
 */
export async function getLibraryStats(
    runtime: IAgentRuntime
): Promise<{
    totalSongs: number;
    totalPlays: number;
    mostPlayed?: LibrarySong;
}> {
    try {
        const memories = await runtime.getMemories({
            tableName: MUSIC_LIBRARY_TABLE,
            roomId: runtime.agentId as string | undefined as any,
            count: 1000,
        });

        const songs = memories
            .filter((m) => m.content.song)
            .map((m) => hydrateSong(m.content.song));

        const totalSongs = songs.length;
        const totalPlays = songs.reduce((sum, song) => sum + song.playCount, 0);

        let mostPlayed: LibrarySong | undefined;
        if (songs.length > 0) {
            mostPlayed = songs.reduce((max, song) =>
                song.playCount > max.playCount ? song : max
            );
        }

        return {
            totalSongs,
            totalPlays,
            mostPlayed,
        };
    } catch (error) {
        logger.error('Error getting library stats:', error);
        return {
            totalSongs: 0,
            totalPlays: 0,
        };
    }
}

