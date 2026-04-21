import {
    type Component,
    type IAgentRuntime,
    type Room,
    type UUID,
    createUniqueUuid,
    logger,
} from '@elizaos/core';
import { v4 } from 'uuid';

/**
 * Analytics data for a guild/room
 */
export interface DJAnalytics {
    totalTracksPlayed: number;
    totalPlayTime: number; // milliseconds
    mostPlayedTracks: Array<{ url: string; title: string; playCount: number; lastPlayed: number }>;
    mostRequestedBy: Array<{ entityId: UUID; name: string; requestCount: number }>;
    popularTimes: Array<{ hour: number; playCount: number }>; // 0-23
    popularDays: Array<{ day: number; playCount: number }>; // 0-6 (Sunday = 0)
    milestones: Array<{ type: string; value: number; timestamp: number }>;
    sessionStats: {
        totalSessions: number;
        averageSessionDuration: number; // milliseconds
        longestSession: number; // milliseconds
    };
}

const ANALYTICS_COMPONENT_TYPE = 'dj_analytics';
const ANALYTICS_ENTITY_PREFIX = 'dj-analytics';

function getAnalyticsEntityId(runtime: IAgentRuntime, roomId: UUID): UUID {
    return createUniqueUuid(runtime, `${ANALYTICS_ENTITY_PREFIX}-${roomId}`);
}

async function ensureAnalyticsEntity(
    runtime: IAgentRuntime,
    roomId: UUID
): Promise<{ entityId: UUID; room: Room | null; effectiveRoomId: UUID; effectiveWorldId: UUID } | null> {
    let room: Room | null = null;
    let effectiveRoomId: UUID = roomId;
    let effectiveWorldId: UUID = runtime.agentId as UUID;

    try {
        room = await runtime.getRoom(roomId);
        if (room) {
            effectiveWorldId = room.worldId || (runtime.agentId as UUID);
        } else {
            logger.warn(
                `[DJ Analytics] Room ${roomId} not found in database, creating fallback room for analytics storage`
            );
            // Create a fallback room using agentId
            effectiveRoomId = runtime.agentId as UUID;
            effectiveWorldId = runtime.agentId as UUID;

            // Ensure the fallback world and room exist in the database
            try {
                await runtime.ensureWorldExists({
                    id: effectiveWorldId,
                    name: 'DJ Analytics Fallback World',
                    agentId: runtime.agentId,
                    serverId: effectiveWorldId,
                    metadata: { purpose: 'analytics-fallback' },
                });
                logger.debug(`[DJ Analytics] Ensured fallback world ${effectiveWorldId}`);
            } catch (worldError) {
                logger.debug(`[DJ Analytics] Fallback world may already exist: ${worldError instanceof Error ? worldError.message : String(worldError)}`);
            }

            try {
                await runtime.ensureRoomExists({
                    id: effectiveRoomId,
                    name: 'DJ Analytics Fallback Room',
                    source: 'dj-plugin',
                    type: 'GROUP' as any,
                    channelId: effectiveRoomId,
                    serverId: effectiveRoomId,
                    worldId: effectiveWorldId,
                    metadata: { purpose: 'analytics-fallback' },
                });
                logger.debug(`[DJ Analytics] Created fallback room ${effectiveRoomId}`);
            } catch (roomError) {
                logger.debug(`[DJ Analytics] Fallback room may already exist: ${roomError instanceof Error ? roomError.message : String(roomError)}`);
            }
        }
    } catch (error) {
        logger.warn(
            `[DJ Analytics] Error checking room ${roomId}: ${error instanceof Error ? error.message : String(error)}, using agentId as fallback`
        );
        effectiveRoomId = runtime.agentId as UUID;
        effectiveWorldId = runtime.agentId as UUID;
    }

    const entityId = getAnalyticsEntityId(runtime, roomId);
    let entity = await runtime.getEntityById(entityId);

    if (!entity) {
        const created = await runtime.createEntity({
            id: entityId,
            names: [
                room?.name ? `DJ Analytics (${room.name})` : `DJ Analytics (${roomId.slice(0, 8)})`,
            ],
            metadata: {
                dj: {
                    type: 'analytics',
                    roomId,
                    roomName: room?.name,
                    serverId: room?.serverId,
                },
            },
            agentId: runtime.agentId,
        });

        if (!created) {
            entity = await runtime.getEntityById(entityId);
            if (!entity) {
                logger.error(
                    `[DJ Analytics] Failed to ensure analytics entity exists for room ${roomId}`
                );
                return null;
            }
        }
    }

    return { entityId, room, effectiveRoomId, effectiveWorldId };
}

/**
 * Get analytics for a guild/room
 */
export async function getAnalytics(
    runtime: IAgentRuntime,
    roomId: UUID
): Promise<DJAnalytics | null> {
    const entityId = getAnalyticsEntityId(runtime, roomId);
    let component = await runtime.getComponent(entityId, ANALYTICS_COMPONENT_TYPE, undefined, runtime.agentId);

    if (!component) {
        component = await runtime.getComponent(roomId, ANALYTICS_COMPONENT_TYPE, undefined, runtime.agentId);
    }

    if (!component || !component.data.analytics) {
        return null;
    }

    return component.data.analytics as DJAnalytics;
}

/**
 * Initialize analytics for a room
 */
async function initializeAnalytics(
    runtime: IAgentRuntime,
    roomId: UUID
): Promise<Component | null> {
    const context = await ensureAnalyticsEntity(runtime, roomId);
    if (!context) {
        return null;
    }

    const { entityId, effectiveRoomId, effectiveWorldId } = context;
    const now = Date.now();
    const initialAnalytics: DJAnalytics = {
        totalTracksPlayed: 0,
        totalPlayTime: 0,
        mostPlayedTracks: [],
        mostRequestedBy: [],
        popularTimes: Array.from({ length: 24 }, (_, i) => ({ hour: i, playCount: 0 })),
        popularDays: Array.from({ length: 7 }, (_, i) => ({ day: i, playCount: 0 })),
        milestones: [],
        sessionStats: {
            totalSessions: 0,
            averageSessionDuration: 0,
            longestSession: 0,
        },
    };

    const success = await runtime.createComponent({
        id: v4() as UUID,
        entityId,
        agentId: runtime.agentId,
        roomId: effectiveRoomId,
        worldId: effectiveWorldId,
        sourceEntityId: runtime.agentId,
        type: ANALYTICS_COMPONENT_TYPE,
        createdAt: now,
        data: {
            analytics: initialAnalytics,
        },
    });

    if (!success) {
        return null;
    }

    // Return the component we just created
    return await runtime.getComponent(entityId, ANALYTICS_COMPONENT_TYPE, undefined, runtime.agentId);
}

/**
 * Track a track being played
 */
export async function trackTrackPlayed(
    runtime: IAgentRuntime,
    roomId: UUID,
    track: { url: string; title: string },
    duration: number,
    requestedBy?: { entityId: UUID; name: string }
): Promise<void> {
    const entityId = getAnalyticsEntityId(runtime, roomId);
    let component = await runtime.getComponent(entityId, ANALYTICS_COMPONENT_TYPE, undefined, runtime.agentId);

    if (!component) {
        component = await runtime.getComponent(roomId, ANALYTICS_COMPONENT_TYPE, undefined, runtime.agentId);
    }

    if (!component) {
        const newComponent = await initializeAnalytics(runtime, roomId);
        if (!newComponent) {
            return; // Failed to initialize
        }
        component = newComponent;
    }

    const analytics: DJAnalytics = (component.data.analytics as DJAnalytics) || {
        totalTracksPlayed: 0,
        totalPlayTime: 0,
        mostPlayedTracks: [],
        mostRequestedBy: [],
        popularTimes: Array.from({ length: 24 }, (_, i) => ({ hour: i, playCount: 0 })),
        popularDays: Array.from({ length: 7 }, (_, i) => ({ day: i, playCount: 0 })),
        milestones: [],
        sessionStats: {
            totalSessions: 0,
            averageSessionDuration: 0,
            longestSession: 0,
        },
    };

    // Update totals
    analytics.totalTracksPlayed += 1;
    analytics.totalPlayTime += duration;

    // Update most played tracks
    const trackIndex = analytics.mostPlayedTracks.findIndex((t) => t.url === track.url);
    const now = Date.now();
    if (trackIndex >= 0) {
        analytics.mostPlayedTracks[trackIndex].playCount += 1;
        analytics.mostPlayedTracks[trackIndex].lastPlayed = now;
    } else {
        analytics.mostPlayedTracks.push({
            url: track.url,
            title: track.title,
            playCount: 1,
            lastPlayed: now,
        });
    }
    analytics.mostPlayedTracks.sort((a, b) => b.playCount - a.playCount);
    analytics.mostPlayedTracks = analytics.mostPlayedTracks.slice(0, 100); // Keep top 100

    // Update most requested by
    if (requestedBy) {
        const requesterIndex = analytics.mostRequestedBy.findIndex(
            (r) => r.entityId === requestedBy.entityId
        );
        if (requesterIndex >= 0) {
            analytics.mostRequestedBy[requesterIndex].requestCount += 1;
        } else {
            analytics.mostRequestedBy.push({
                entityId: requestedBy.entityId,
                name: requestedBy.name,
                requestCount: 1,
            });
        }
        analytics.mostRequestedBy.sort((a, b) => b.requestCount - a.requestCount);
        analytics.mostRequestedBy = analytics.mostRequestedBy.slice(0, 50); // Keep top 50
    }

    // Update popular times
    const hour = new Date().getHours();
    analytics.popularTimes[hour].playCount += 1;

    // Update popular days
    const day = new Date().getDay();
    analytics.popularDays[day].playCount += 1;

    // Check for milestones
    const milestones = [
        { type: 'tracks_100', value: 100 },
        { type: 'tracks_500', value: 500 },
        { type: 'tracks_1000', value: 1000 },
        { type: 'tracks_5000', value: 5000 },
        { type: 'tracks_10000', value: 10000 },
    ];

    for (const milestone of milestones) {
        if (
            analytics.totalTracksPlayed === milestone.value &&
            !analytics.milestones.some((m) => m.type === milestone.type)
        ) {
            analytics.milestones.push({
                type: milestone.type,
                value: milestone.value,
                timestamp: now,
            });

            // Emit milestone event
            runtime.emitEvent(['DJ_MILESTONE'], {
                type: milestone.type,
                value: milestone.value,
                timestamp: now,
                roomId: roomId,
            });
        }
    }

    if (component) {
        await runtime.updateComponent({
            ...component,
            data: {
                ...component.data,
                analytics,
            },
        });
    }
}

/**
 * Track a listening session
 */
export async function trackSession(
    runtime: IAgentRuntime,
    roomId: UUID,
    duration: number
): Promise<void> {
    const entityId = getAnalyticsEntityId(runtime, roomId);
    let component = await runtime.getComponent(entityId, ANALYTICS_COMPONENT_TYPE, undefined, runtime.agentId);

    if (!component) {
        component = await runtime.getComponent(roomId, ANALYTICS_COMPONENT_TYPE, undefined, runtime.agentId);
    }

    if (!component) {
        const newComponent = await initializeAnalytics(runtime, roomId);
        if (!newComponent) {
            return; // Failed to initialize
        }
        component = newComponent;
    }

    const analytics: DJAnalytics = (component.data.analytics as DJAnalytics) || {
        totalTracksPlayed: 0,
        totalPlayTime: 0,
        mostPlayedTracks: [],
        mostRequestedBy: [],
        popularTimes: Array.from({ length: 24 }, (_, i) => ({ hour: i, playCount: 0 })),
        popularDays: Array.from({ length: 7 }, (_, i) => ({ day: i, playCount: 0 })),
        milestones: [],
        sessionStats: {
            totalSessions: 0,
            averageSessionDuration: 0,
            longestSession: 0,
        },
    };

    analytics.sessionStats.totalSessions += 1;
    const totalDuration =
        analytics.sessionStats.averageSessionDuration * (analytics.sessionStats.totalSessions - 1) +
        duration;
    analytics.sessionStats.averageSessionDuration =
        totalDuration / analytics.sessionStats.totalSessions;
    analytics.sessionStats.longestSession = Math.max(
        analytics.sessionStats.longestSession,
        duration
    );

    if (component) {
        await runtime.updateComponent({
            ...component,
            data: {
                ...component.data,
                analytics,
            },
        });
    }
}

/**
 * Track a listener snapshot for analytics
 * Called by the listener tracking service in plugin-radio
 */
export async function trackListenerSnapshot(
    runtime: IAgentRuntime,
    roomId: UUID,
    snapshot: {
        timestamp: number;
        listenerCount: number;
        humanListenerCount: number;
        botListenerCount: number;
    }
): Promise<void> {
    const setup = await ensureAnalyticsEntity(runtime, roomId);
    if (!setup) {
        return;
    }

    const { entityId, effectiveRoomId, effectiveWorldId } = setup;

    // Get or create component
    let component = await runtime.getComponent(entityId, ANALYTICS_COMPONENT_TYPE, undefined, runtime.agentId);
    
    if (!component) {
        const created = await runtime.createComponent({
            id: v4() as UUID,
            entityId,
            agentId: runtime.agentId,
            roomId: effectiveRoomId,
            worldId: effectiveWorldId,
            sourceEntityId: runtime.agentId,
            type: ANALYTICS_COMPONENT_TYPE,
            createdAt: Date.now(),
            data: {
                listenerHistory: [],
            },
        });

        if (!created) {
            logger.error('Failed to create listener tracking component');
            return;
        }

        // Re-fetch the component
        component = await runtime.getComponent(entityId, ANALYTICS_COMPONENT_TYPE, undefined, runtime.agentId);
        if (!component) {
            return;
        }
    }

    // Append snapshot to history
    const listenerHistory = (component.data.listenerHistory as any[]) || [];
    listenerHistory.push(snapshot);

    // Keep only last 24 hours of snapshots (assuming 1 per minute = 1440 snapshots)
    const MAX_SNAPSHOTS = 1440;
    if (listenerHistory.length > MAX_SNAPSHOTS) {
        listenerHistory.splice(0, listenerHistory.length - MAX_SNAPSHOTS);
    }

    await runtime.updateComponent({
        ...component,
        data: {
            ...component.data,
            listenerHistory,
        },
    });
}

