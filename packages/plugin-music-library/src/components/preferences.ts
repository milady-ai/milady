import { type IAgentRuntime, type UUID, logger } from '@elizaos/core';
import { v4 } from 'uuid';

/**
 * User music preferences
 */
export interface UserMusicPreferences {
    favoriteGenres?: string[];
    favoriteArtists?: string[];
    favoriteTracks?: Array<{ url: string; title: string; playCount?: number }>;
    dislikedTracks?: string[]; // URLs
    skipHistory?: Array<{ url: string; timestamp: number }>;
    requestHistory?: Array<{ url: string; title: string; timestamp: number }>;
    listeningSessions?: Array<{ startTime: number; endTime?: number; tracksPlayed: number }>;
}

const PREFERENCES_COMPONENT_TYPE = 'dj_preferences';

/**
 * Update user music preferences
 */
export async function updateUserPreferences(
    runtime: IAgentRuntime,
    entityId: UUID,
    preferences: Partial<UserMusicPreferences>,
    roomId?: UUID,
    worldId?: UUID
): Promise<UserMusicPreferences> {
    // Try to get existing component with proper filtering
    const existingComponent = await runtime.getComponent(
        entityId,
        PREFERENCES_COMPONENT_TYPE,
        worldId,
        runtime.agentId
    );

    const current: UserMusicPreferences = existingComponent
        ? (existingComponent.data.preferences as UserMusicPreferences) || {}
        : {};

    const updated: UserMusicPreferences = {
        ...current,
        ...preferences,
        // Merge arrays
        favoriteGenres: [
            ...new Set([...(current.favoriteGenres || []), ...(preferences.favoriteGenres || [])]),
        ],
        favoriteArtists: [
            ...new Set([...(current.favoriteArtists || []), ...(preferences.favoriteArtists || [])]),
        ],
        favoriteTracks: mergeFavoriteTracks(current.favoriteTracks || [], preferences.favoriteTracks || []),
        dislikedTracks: [
            ...new Set([...(current.dislikedTracks || []), ...(preferences.dislikedTracks || [])]),
        ],
        skipHistory: [...(current.skipHistory || []), ...(preferences.skipHistory || [])].slice(-100), // Keep last 100
        requestHistory: [...(current.requestHistory || []), ...(preferences.requestHistory || [])].slice(-100),
        listeningSessions: [...(current.listeningSessions || []), ...(preferences.listeningSessions || [])].slice(-50),
    };

    if (existingComponent) {
        await runtime.updateComponent({
            ...existingComponent,
            data: {
                ...existingComponent.data,
                preferences: updated,
            },
        });
    } else {
        const entity = await runtime.getEntityById(entityId);
        if (!entity) {
            throw new Error(`Entity ${entityId} not found`);
        }

        // Determine roomId and worldId for component creation
        // We need to ensure the room/world exists in the database, otherwise use agentId as fallback
        let finalRoomId: UUID = runtime.agentId as UUID;
        let finalWorldId: UUID = runtime.agentId as UUID;

        if (roomId) {
            try {
                const room = await runtime.getRoom(roomId);
                if (room) {
                    finalRoomId = roomId;
                    finalWorldId = room.worldId || (runtime.agentId as UUID);
                } else {
                    logger.warn(
                        `[DJ Preferences] Room ${roomId} not found in database, creating fallback room for component creation`
                    );
                    // Ensure the fallback world and room exist in the database
                    try {
                        await runtime.ensureWorldExists({
                            id: finalWorldId,
                            name: 'DJ Preferences Fallback World',
                            agentId: runtime.agentId,
                            serverId: finalWorldId,
                            metadata: { purpose: 'preferences-fallback' },
                        });
                        logger.debug(`[DJ Preferences] Ensured fallback world ${finalWorldId}`);
                    } catch (worldError) {
                        logger.debug(`[DJ Preferences] Fallback world may already exist: ${worldError instanceof Error ? worldError.message : String(worldError)}`);
                    }

                    try {
                        await runtime.ensureRoomExists({
                            id: finalRoomId,
                            name: 'DJ Preferences Fallback Room',
                            source: 'dj-plugin',
                            type: 'GROUP' as any,
                            channelId: finalRoomId,
                            serverId: finalRoomId,
                            worldId: finalWorldId,
                            metadata: { purpose: 'preferences-fallback' },
                        });
                        logger.debug(`[DJ Preferences] Created fallback room ${finalRoomId}`);
                    } catch (roomError) {
                        logger.debug(`[DJ Preferences] Fallback room may already exist: ${roomError instanceof Error ? roomError.message : String(roomError)}`);
                    }
                }
            } catch (error) {
                logger.warn(
                    `[DJ Preferences] Error checking room ${roomId}: ${error instanceof Error ? error.message : String(error)}, using agentId as fallback`
                );
            }
        }

        await runtime.createComponent({
            id: v4() as UUID,
            entityId,
            agentId: runtime.agentId,
            roomId: finalRoomId,
            worldId: finalWorldId,
            sourceEntityId: runtime.agentId,
            type: PREFERENCES_COMPONENT_TYPE,
            createdAt: Date.now(),
            data: {
                preferences: updated,
            },
        });
    }

    return updated;
}

/**
 * Get user music preferences
 */
export async function getUserPreferences(
    runtime: IAgentRuntime,
    entityId: UUID
): Promise<UserMusicPreferences | null> {
    const component = await runtime.getComponent(
        entityId,
        PREFERENCES_COMPONENT_TYPE,
        undefined,
        runtime.agentId
    );

    if (!component || !component.data.preferences) {
        return null;
    }

    return (component.data.preferences as UserMusicPreferences) || null;
}

/**
 * Get preferences for all users in a room
 */
export async function getRoomPreferences(
    runtime: IAgentRuntime,
    roomId: UUID
): Promise<Map<UUID, UserMusicPreferences>> {
    const entities = await runtime.getEntitiesForRoom(roomId, true);
    const preferences = new Map<UUID, UserMusicPreferences>();

    for (const entity of entities) {
        const prefs = await getUserPreferences(runtime, entity.id!);
        if (prefs) {
            preferences.set(entity.id!, prefs);
        }
    }

    return preferences;
}

/**
 * Merge favorite tracks, incrementing play count
 */
function mergeFavoriteTracks(
    current: UserMusicPreferences['favoriteTracks'],
    newTracks: UserMusicPreferences['favoriteTracks']
): UserMusicPreferences['favoriteTracks'] {
    if (!newTracks || newTracks.length === 0) {
        return current || [];
    }

    type FavoriteTrack = NonNullable<UserMusicPreferences['favoriteTracks']>[0];
    const trackMap = new Map<string, FavoriteTrack>();

    // Add existing tracks
    (current || []).forEach((track) => {
        trackMap.set(track.url, { ...track, playCount: track.playCount || 1 });
    });

    // Add/update new tracks
    newTracks.forEach((track) => {
        const existing = trackMap.get(track.url);
        if (existing) {
            trackMap.set(track.url, {
                ...existing,
                playCount: (existing.playCount || 1) + 1,
            });
        } else {
            trackMap.set(track.url, { ...track, playCount: 1 });
        }
    });

    return Array.from(trackMap.values()).sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
}

/**
 * Track a track request
 */
export async function trackTrackRequest(
    runtime: IAgentRuntime,
    entityId: UUID,
    track: { url: string; title: string },
    roomId?: UUID,
    worldId?: UUID
): Promise<void> {
    await updateUserPreferences(
        runtime,
        entityId,
        {
            requestHistory: [
                {
                    url: track.url,
                    title: track.title,
                    timestamp: Date.now(),
                },
            ],
        },
        roomId,
        worldId
    );
}

/**
 * Track a skip
 */
export async function trackSkip(
    runtime: IAgentRuntime,
    entityId: UUID,
    trackUrl: string,
    roomId?: UUID,
    worldId?: UUID
): Promise<void> {
    await updateUserPreferences(
        runtime,
        entityId,
        {
            skipHistory: [
                {
                    url: trackUrl,
                    timestamp: Date.now(),
                },
            ],
        },
        roomId,
        worldId
    );
}

/**
 * Track favorite track
 */
export async function trackFavorite(
    runtime: IAgentRuntime,
    entityId: UUID,
    track: { url: string; title: string },
    roomId?: UUID,
    worldId?: UUID
): Promise<void> {
    await updateUserPreferences(
        runtime,
        entityId,
        {
            favoriteTracks: [track],
        },
        roomId,
        worldId
    );
}

