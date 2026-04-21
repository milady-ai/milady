import { type IAgentRuntime, type Plugin, logger } from '@elizaos/core';
import { MusicService } from './service';
import { playAudio } from './actions/playAudio';
import { queueMusic } from './actions/queueMusic';
import { skipTrack } from './actions/skipTrack';
import { showQueue } from './actions/showQueue';
import { stopMusic } from './actions/stopMusic';
import { pauseMusic, resumeMusic } from './actions/pauseResumeMusic';
import { manageRouting } from './actions/manageRouting';
import { manageZones } from './actions/manageZones';
import { musicPlayerRoutes } from './routes';
import { musicPlayerInstructionsProvider } from './providers/musicPlayerInstructions';
import { installProcessActionsTransportPatch } from './runtime/processActionsTransportPatch';

// Export types for use by other plugins
export type { QueuedTrack, CrossFadeOptions } from './queue';
export { MusicService } from './service';
export { SmartMusicFetchService } from './services/smartMusicFetch';
export type { SmartFetchOptions, FetchResult, FetchProgress } from './services/smartMusicFetch';

// Export audio broadcast contracts
export type {
  IAudioBroadcast,
  AudioSubscription,
  BroadcastState,
  BroadcastTrackMetadata,
} from './contracts';

// Export broadcast core components
export { Broadcast } from './core';

// Export router components for multi-bot support
export {
  AudioRouter,
  type AudioRoutingMode,
  type AudioRouteConfig,
  ZoneManager,
  type Zone,
  MixSessionManager,
  type MixConfig,
  type MixSession,
} from './router';

const musicPlayerPlugin: Plugin = {
  name: 'music-player',
  description: 'Pure music playback engine with queue management, cross-fading, smart music fetching, and audio streaming API',
  services: [MusicService],
  // Transport controls listed before PLAY_AUDIO so prompts/XML tend to prefer them
  // for pause/skip/stop/resume (PLAY_AUDIO validate rejects transport-only text).
  actions: [
    pauseMusic,
    resumeMusic,
    stopMusic,
    skipTrack,
    manageRouting,
    manageZones,
    playAudio,
    queueMusic,
    showQueue,
  ],
  providers: [musicPlayerInstructionsProvider],
  routes: musicPlayerRoutes,
  init: async (_config: Record<string, string>, runtime: IAgentRuntime) => {
    installProcessActionsTransportPatch(runtime);

    // Don't block init - set up services after initialization completes
    runtime.getServiceLoadPromise('discord' as any).then(async (discordService) => {
      if (!discordService) {
        logger.warn(
          'Discord service not found - Music Player plugin will work in web-only mode'
        );
        return;
      }

      // Wait for Discord client to be ready before accessing voiceManager
      if ((discordService as any).clientReadyPromise) {
        logger.debug('Music Player waiting for Discord client to be ready...');
        await (discordService as any).clientReadyPromise;
      }

      runtime.getServiceLoadPromise('music' as any).then((musicService: any) => {
        if (!musicService) {
          logger.warn('Music service not available - Music Player plugin initialization incomplete');
          return;
        }

        // Initialize music service with voice manager from Discord service
        const voiceManager = (discordService as any).voiceManager;
        if (voiceManager) {
          musicService.setVoiceManager(voiceManager);
          logger.debug('Music service initialized with Discord voice manager');
        } else {
          logger.warn('Discord voice manager not available - Music Player will work in web-only mode');
        }
      }).catch((error) => {
        logger.error(`Error setting up music service: ${error}`);
      });
    }).catch((error) => {
      logger.warn(`Discord service not available - running in web-only mode: ${error}`);
    });

    logger.debug('Music Player plugin init complete (service setup deferred)');
  },
};

export default musicPlayerPlugin;
