import { type IAgentRuntime, type UUID, logger, createUniqueUuid } from '@elizaos/core';
import { v4 } from 'uuid';

/**
 * Per-Guild DJ Settings
 * Comprehensive settings for DJ behavior specific to each guild/room
 */
export interface DJGuildSettings {
  // Autonomy & Behavior
  autonomyLevel?: 'MANUAL' | 'BALANCED' | 'AUTONOMOUS' | 'RADIO';
  enabled: boolean; // DJ features enabled for this guild
  
  // Auto-Fill Configuration
  autoFillEnabled: boolean;
  autoFillThreshold?: number; // Number of tracks to trigger auto-fill
  timeBasedProgramming: boolean;
  repetitionControlEnabled: boolean;
  
  // DJ Commentary
  introsEnabled: boolean;
  commentaryEnabled: boolean;
  useLLMForCommentary: boolean;
  jokesSetting: boolean;
  
  // Automatic Events
  autoTriviaEnabled: boolean;
  autoTriviaMinTracks?: number;
  autoTriviaMinMinutes?: number;
  
  autoJokesEnabled: boolean;
  autoJokesMinTracks?: number;
  autoJokesMinMinutes?: number;
  
  autoRecapEnabled: boolean;
  autoRecapMinTracks?: number;
  autoRecapMinMinutes?: number;
  
  // Radio Station Info
  stationName?: string;
  stationDescription?: string;
  
  // Advanced
  listenerTrackingEnabled: boolean;
  audioQuality?: 'high' | 'medium' | 'low';
  crossFadeEnabled: boolean;
  crossFadeDuration?: number; // milliseconds
  
  // Metadata
  createdAt: number;
  updatedAt: number;
  createdBy?: UUID;
  lastModifiedBy?: UUID;
}

/**
 * Default guild settings
 */
export const DEFAULT_GUILD_SETTINGS: DJGuildSettings = {
  autonomyLevel: 'BALANCED',
  enabled: true,
  autoFillEnabled: true,
  autoFillThreshold: 3,
  timeBasedProgramming: true,
  repetitionControlEnabled: true,
  introsEnabled: true,
  commentaryEnabled: false,
  useLLMForCommentary: true,
  jokesSetting: true,
  autoTriviaEnabled: true,
  autoTriviaMinTracks: 5,
  autoTriviaMinMinutes: 30,
  autoJokesEnabled: true,
  autoJokesMinTracks: 7,
  autoJokesMinMinutes: 20,
  autoRecapEnabled: true,
  autoRecapMinTracks: 4,
  autoRecapMinMinutes: 15,
  listenerTrackingEnabled: true,
  audioQuality: 'high',
  crossFadeEnabled: true,
  crossFadeDuration: 3000,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const DJ_GUILD_SETTINGS_COMPONENT_TYPE = 'dj_guild_settings';
const DJ_GUILD_SETTINGS_ENTITY_PREFIX = 'dj-guild-settings';

function getDJGuildSettingsEntityId(runtime: IAgentRuntime, roomId: UUID): UUID {
  return createUniqueUuid(runtime, `${DJ_GUILD_SETTINGS_ENTITY_PREFIX}-${roomId}`);
}

/**
 * Get DJ guild settings for a room
 */
export async function getDJGuildSettings(
  runtime: IAgentRuntime,
  roomId: UUID
): Promise<DJGuildSettings> {
  const entityId = getDJGuildSettingsEntityId(runtime, roomId);
  const component = await runtime.getComponent(entityId, DJ_GUILD_SETTINGS_COMPONENT_TYPE, undefined, runtime.agentId);
  
  if (!component || !component.data.settings) {
    return DEFAULT_GUILD_SETTINGS;
  }
  
  return { ...DEFAULT_GUILD_SETTINGS, ...(component.data.settings as DJGuildSettings) };
}

/**
 * Set DJ guild settings for a room
 */
export async function setDJGuildSettings(
  runtime: IAgentRuntime,
  roomId: UUID,
  settings: Partial<DJGuildSettings>,
  modifiedBy?: UUID
): Promise<void> {
  try {
    const entityId = getDJGuildSettingsEntityId(runtime, roomId);
    const existingComponent = await runtime.getComponent(entityId, DJ_GUILD_SETTINGS_COMPONENT_TYPE, undefined, runtime.agentId);
    
    const currentSettings = existingComponent?.data.settings 
      ? { ...DEFAULT_GUILD_SETTINGS, ...(existingComponent.data.settings as DJGuildSettings) }
      : DEFAULT_GUILD_SETTINGS;
    
    const newSettings: DJGuildSettings = { 
      ...currentSettings, 
      ...settings,
      updatedAt: Date.now(),
      lastModifiedBy: modifiedBy || runtime.agentId,
    };
    
    if (existingComponent) {
      // Update existing component
      await runtime.updateComponent({
        ...existingComponent,
        data: {
          ...existingComponent.data,
          settings: newSettings,
        },
      });
    } else {
      // Create new component
      // Ensure room exists
      let room = await runtime.getRoom(roomId);
      let effectiveRoomId = roomId;
      let effectiveWorldId = runtime.agentId as UUID;
      
      if (!room) {
        logger.warn(`Room ${roomId} not found, using agent ID as fallback`);
        effectiveRoomId = runtime.agentId as UUID;
        effectiveWorldId = runtime.agentId as UUID;
        
        await runtime.ensureWorldExists({
          id: effectiveWorldId,
          name: 'DJ Settings Fallback World',
          agentId: runtime.agentId,
          serverId: effectiveWorldId,
          metadata: { purpose: 'dj-settings-fallback' },
        });
        
        await runtime.ensureRoomExists({
          id: effectiveRoomId,
          name: 'DJ Settings Fallback Room',
          source: 'dj-plugin',
          type: 'GROUP' as any,
          channelId: effectiveRoomId,
          serverId: effectiveRoomId,
          worldId: effectiveWorldId,
          metadata: { purpose: 'dj-settings-fallback' },
        });
      } else {
        effectiveWorldId = room.worldId || (runtime.agentId as UUID);
      }
      
      newSettings.createdAt = Date.now();
      newSettings.createdBy = modifiedBy || runtime.agentId;
      
      await runtime.createComponent({
        id: v4() as UUID,
        entityId,
        agentId: runtime.agentId,
        roomId: effectiveRoomId,
        worldId: effectiveWorldId,
        sourceEntityId: runtime.agentId,
        type: DJ_GUILD_SETTINGS_COMPONENT_TYPE,
        createdAt: Date.now(),
        data: {
          settings: newSettings,
        },
      });
    }
    
    logger.info(`Updated DJ guild settings for room ${roomId}`);
  } catch (error) {
    logger.error(`Error setting DJ guild settings: ${error}`);
    throw error;
  }
}

/**
 * Reset DJ guild settings to defaults
 */
export async function resetDJGuildSettings(
  runtime: IAgentRuntime,
  roomId: UUID,
  modifiedBy?: UUID
): Promise<void> {
  await setDJGuildSettings(runtime, roomId, DEFAULT_GUILD_SETTINGS, modifiedBy);
}

/**
 * Enable/disable DJ for a guild
 */
export async function toggleDJ(
  runtime: IAgentRuntime,
  roomId: UUID,
  enabled: boolean,
  modifiedBy?: UUID
): Promise<void> {
  await setDJGuildSettings(runtime, roomId, { enabled }, modifiedBy);
}

/**
 * Set autonomy level for a guild
 */
export async function setAutonomyLevel(
  runtime: IAgentRuntime,
  roomId: UUID,
  level: 'MANUAL' | 'BALANCED' | 'AUTONOMOUS' | 'RADIO',
  modifiedBy?: UUID
): Promise<void> {
  await setDJGuildSettings(runtime, roomId, { autonomyLevel: level }, modifiedBy);
}

/**
 * Get all configured guilds
 */
export async function getAllConfiguredGuilds(
  _runtime: IAgentRuntime
): Promise<Array<{ roomId: UUID; settings: DJGuildSettings }>> {
  // This would require a database query to find all components of type DJ_GUILD_SETTINGS_COMPONENT_TYPE
  // For now, return empty array as this would need to be implemented at the runtime level
  logger.warn('getAllConfiguredGuilds not fully implemented - requires runtime-level query support');
  return [];
}

