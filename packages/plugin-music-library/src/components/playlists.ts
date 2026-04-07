import { type IAgentRuntime, type UUID, logger } from '@elizaos/core';
import { v4 } from 'uuid';

/**
 * Represents a track in a playlist
 */
export interface PlaylistTrack {
    url: string;
    title: string;
    duration?: number;
    requestedBy?: string;
    dedicatedTo?: string;
    dedicationMessage?: string;
}

/**
 * Represents a saved playlist
 */
export interface Playlist {
    id: string;
    name: string;
    tracks: PlaylistTrack[];
    createdAt: number;
    updatedAt: number;
    isFavorite?: boolean;
}

const PLAYLIST_COMPONENT_TYPE = 'dj_playlist';

/**
 * Save a playlist to user's entity components
 */
export async function savePlaylist(
    runtime: IAgentRuntime,
    entityId: UUID,
    playlist: Omit<Playlist, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number }
): Promise<Playlist> {
    const playlistId = playlist.id || (v4() as string);
    const now = Date.now();

    const fullPlaylist: Playlist = {
        ...playlist,
        id: playlistId,
        createdAt: playlist.createdAt || now,
        updatedAt: now,
    };

    // Get existing playlists component
    const existingComponent = await runtime.getComponent(
        entityId,
        PLAYLIST_COMPONENT_TYPE,
        undefined,
        runtime.agentId
    );

    const playlists: Playlist[] = existingComponent
        ? (existingComponent.data.playlists as Playlist[]) || []
        : [];

    // Update or add playlist
    const index = playlists.findIndex((p) => p.id === playlistId);
    if (index >= 0) {
        playlists[index] = fullPlaylist;
    } else {
        playlists.push(fullPlaylist);
    }

    // Save to component
    if (existingComponent) {
        await runtime.updateComponent({
            ...existingComponent,
            data: {
                ...existingComponent.data,
                playlists,
            },
        });
    } else {
        // Get room and world for component creation
        const entity = await runtime.getEntityById(entityId);
        if (!entity) {
            throw new Error(`Entity ${entityId} not found`);
        }

        // Create new component - we'll use a default room/world
        // In practice, you might want to get the current room from context
        await runtime.createComponent({
            id: v4() as UUID,
            entityId,
            agentId: runtime.agentId,
            roomId: runtime.agentId as UUID, // Use agentId as default roomId
            worldId: runtime.agentId as UUID, // Use agentId as default worldId
            sourceEntityId: runtime.agentId,
            type: PLAYLIST_COMPONENT_TYPE,
            createdAt: now,
            data: {
                playlists,
            },
        });
    }

    logger.debug(`Saved playlist "${fullPlaylist.name}" for entity ${entityId}`);
    return fullPlaylist;
}

/**
 * Load all playlists for a user
 */
export async function loadPlaylists(
    runtime: IAgentRuntime,
    entityId: UUID
): Promise<Playlist[]> {
    const component = await runtime.getComponent(
        entityId,
        PLAYLIST_COMPONENT_TYPE,
        undefined,
        runtime.agentId
    );

    if (!component || !component.data.playlists) {
        return [];
    }

    return (component.data.playlists as Playlist[]) || [];
}

/**
 * Delete a playlist
 */
export async function deletePlaylist(
    runtime: IAgentRuntime,
    entityId: UUID,
    playlistId: string
): Promise<boolean> {
    const component = await runtime.getComponent(
        entityId,
        PLAYLIST_COMPONENT_TYPE,
        undefined,
        runtime.agentId
    );

    if (!component) {
        return false;
    }

    const playlists: Playlist[] = (component.data.playlists as Playlist[]) || [];
    const filtered = playlists.filter((p) => p.id !== playlistId);

    await runtime.updateComponent({
        ...component,
        data: {
            ...component.data,
            playlists: filtered,
        },
    });

    logger.debug(`Deleted playlist ${playlistId} for entity ${entityId}`);
    return true;
}

