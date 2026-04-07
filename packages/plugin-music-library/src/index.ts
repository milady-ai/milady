import { type IAgentRuntime, type Plugin, logger } from '@elizaos/core';
import { MusicInfoService } from './services/musicInfoService';
import { MusicEntityDetectionService } from './services/musicEntityDetectionService';
import { WikipediaExtractionService } from './services/wikipediaExtractionService';
import { WikipediaService } from './services/wikipediaClient';
import { YouTubeSearchService } from './services/youtubeSearch';
import { musicInfoProvider } from './providers/musicInfoProvider';
import { wikipediaProvider } from './providers/wikipediaProvider';
import { musicInfoInstructionsProvider } from './providers/musicInfoInstructions';
import musicLibraryProvider from './providers/musicLibraryProvider';
import { MusicLibraryService } from './services/musicLibraryService';

// Import actions
import savePlaylist from './actions/savePlaylist';
import loadPlaylist from './actions/loadPlaylist';
import listPlaylists from './actions/listPlaylists';
import deletePlaylist from './actions/deletePlaylist';
import searchYouTube from './actions/searchYouTube';
import playMusicQuery from './actions/playMusicQuery';
import downloadMusic from './actions/downloadMusic';
import addToPlaylist from './actions/addToPlaylist';

// Export types for use by other plugins
export type { TrackInfo, ArtistInfo, AlbumInfo, MusicInfoResult } from './types';
export type { AudioFeatures, AudioFeatureSeed, RecommendationRequest, TrackRecommendation } from './types/audioFeatures';
export type { DetectedMusicEntity } from './services/musicEntityDetectionService';
export type { WikipediaExtractionContext, ExtractedMusicInfo } from './services/wikipediaExtractionService';
export type { MusicInfoServiceStatus, ServiceStatus, ServiceHealth } from './services/serviceStatus';
export type { Playlist } from './components/playlists';
export type { UserMusicPreferences } from './components/preferences';
export type { DJAnalytics } from './components/analytics';
export type { LibrarySong } from './components/musicLibrary';
export type { YouTubeSearchResult } from './services/youtubeSearch';

// Export services
export { MusicInfoService } from './services/musicInfoService';
export { MusicEntityDetectionService } from './services/musicEntityDetectionService';
export { WikipediaExtractionService } from './services/wikipediaExtractionService';
export { WikipediaService } from './services/wikipediaClient';
export { SpotifyClient } from './services/spotifyClient';
export { YouTubeSearchService } from './services/youtubeSearch';
export { MusicStorageService, type StoredTrack } from './services/musicStorage';
export { MusicLibraryService } from './services/musicLibraryService';

// Export components
export * from './components/musicLibrary';
export * from './components/playlists';
export * from './components/preferences';
export * from './components/analytics';
export { repetitionControl } from './components/repetitionControl';
export { trackListenerSnapshot } from './components/analytics';
export * from './components/djIntroOptions';
export { getDJIntroOptions, setDJIntroOptions, resetDJIntroOptions, buildIntroPrompt, DEFAULT_DJ_INTRO_OPTIONS } from './components/djIntroOptions';
export * from './components/djGuildSettings';
export { getDJGuildSettings, setDJGuildSettings, resetDJGuildSettings, toggleDJ, setAutonomyLevel, DEFAULT_GUILD_SETTINGS } from './components/djGuildSettings';
export * from './components/songMemory';
export { getSongMemory, recordSongPlay, recordSongRequest, recordSongDedication, getTopSongs, getMostRequestedSongs } from './components/songMemory';
export * from './components/djTips';
export { trackDJTip, getDJTipStats, getRecentTips, getTopTippers } from './components/djTips';

const musicLibraryPlugin: Plugin = {
  name: 'music-library',
  description: 'Plugin for music data storage, preferences, analytics, external APIs, smart music downloading, and YouTube functionality',
  services: [
    WikipediaService,
    MusicInfoService,
    MusicEntityDetectionService,
    WikipediaExtractionService,
    YouTubeSearchService,
    MusicLibraryService,
  ],
  providers: [musicInfoInstructionsProvider, musicInfoProvider, wikipediaProvider, musicLibraryProvider],
  actions: [
    savePlaylist,
    loadPlaylist,
    listPlaylists,
    deletePlaylist,
    searchYouTube,
    playMusicQuery,
    downloadMusic,    // New: Smart download action
    addToPlaylist,    // New: Smart add to playlist action
  ],
  init: async (_config: Record<string, string>, _runtime: IAgentRuntime) => {
    logger.debug('Music Library plugin initialized with metadata APIs, playlists, analytics, and YouTube search');
  },
};

export default musicLibraryPlugin;
