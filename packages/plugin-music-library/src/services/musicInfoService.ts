import { Service, type IAgentRuntime, logger } from '@elizaos/core';
import type { TrackInfo, ArtistInfo, AlbumInfo, MusicInfoResult } from '../types';
import { MusicBrainzClient } from './musicBrainzClient';
import { LastFmClient } from './lastFmClient';
import { WikipediaService } from './wikipediaClient';
import { GeniusClient } from './geniusClient';
import { TheAudioDbClient } from './theAudioDbClient';
import type { MusicInfoServiceStatus, ServiceStatus } from './serviceStatus';

const MUSIC_INFO_SERVICE_NAME = 'musicInfo';

/**
 * Service for fetching music information from various sources
 * Uses a fallback chain: YouTube -> MusicBrainz -> Last.fm -> Wikipedia -> Manual parsing
 */
export class MusicInfoService extends Service {
    static serviceType: string = MUSIC_INFO_SERVICE_NAME;
    capabilityDescription = 'Fetches music metadata (tracks, artists, albums) from various sources';

    private cache: Map<string, { data: MusicInfoResult; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 3600000; // 1 hour in milliseconds
    private musicBrainzClient: MusicBrainzClient | null = null;
    private lastFmClient: LastFmClient | null = null;
    private geniusClient: GeniusClient | null = null;
    private theAudioDbClient: TheAudioDbClient | null = null;
    private serviceStatus: MusicInfoServiceStatus = {
        musicBrainz: { status: 'not_configured' as ServiceStatus, lastChecked: 0 },
        lastFm: { status: 'not_configured' as ServiceStatus, lastChecked: 0 },
        genius: { status: 'not_configured' as ServiceStatus, lastChecked: 0 },
        theAudioDb: { status: 'not_configured' as ServiceStatus, lastChecked: 0 },
        wikipedia: { status: 'not_configured' as ServiceStatus, lastChecked: 0 },
    };

    constructor(runtime?: IAgentRuntime) {
        super(runtime);

        // Initialize MusicBrainz (free, no API key needed)
        const userAgent = runtime?.getSetting('MUSICBRAINZ_USER_AGENT') as string ||
            'ElizaOS-MusicInfo/1.0.0 (https://github.com/elizaos/eliza)';
        this.musicBrainzClient = new MusicBrainzClient(userAgent);
        this.serviceStatus.musicBrainz = { status: 'active' as ServiceStatus, lastChecked: Date.now() };

        // Initialize Last.fm if API key is provided
        const lastFmApiKey = runtime?.getSetting('LASTFM_API_KEY') as string;
        if (lastFmApiKey) {
            try {
                this.lastFmClient = new LastFmClient(lastFmApiKey);
                this.serviceStatus.lastFm = { status: 'active' as ServiceStatus, lastChecked: Date.now() };
            } catch (error) {
                logger.warn(`Last.fm client not initialized: ${error}`);
                this.serviceStatus.lastFm = {
                    status: 'unavailable' as ServiceStatus,
                    lastChecked: Date.now(),
                    lastError: String(error)
                };
            }
        }

        // Initialize Genius if API key is provided
        const geniusApiKey = runtime?.getSetting('GENIUS_API_KEY') as string;
        if (geniusApiKey) {
            try {
                this.geniusClient = new GeniusClient(geniusApiKey);
                this.serviceStatus.genius = { status: 'active' as ServiceStatus, lastChecked: Date.now() };
            } catch (error) {
                logger.warn(`Genius client not initialized: ${error}`);
                this.serviceStatus.genius = {
                    status: 'unavailable' as ServiceStatus,
                    lastChecked: Date.now(),
                    lastError: String(error)
                };
            }
        }

        // Initialize TheAudioDB if API key is provided
        const theAudioDbApiKey = runtime?.getSetting('THEAUDIODB_API_KEY') as string;
        if (theAudioDbApiKey) {
            try {
                this.theAudioDbClient = new TheAudioDbClient(theAudioDbApiKey);
                this.serviceStatus.theAudioDb = { status: 'active' as ServiceStatus, lastChecked: Date.now() };
            } catch (error) {
                logger.warn(`TheAudioDB client not initialized: ${error}`);
                this.serviceStatus.theAudioDb = {
                    status: 'unavailable' as ServiceStatus,
                    lastChecked: Date.now(),
                    lastError: String(error)
                };
            }
        }

        // Check Wikipedia service availability
        const wikipediaService = runtime?.getService('wikipedia') as WikipediaService | null;
        if (wikipediaService) {
            this.serviceStatus.wikipedia = { status: 'active' as ServiceStatus, lastChecked: Date.now() };
        }

        // Validate API keys asynchronously (don't block initialization)
        this.validateApiKeys().catch((error) => {
            logger.debug(`API key validation completed with some issues: ${error}`);
        });
    }

    static async start(runtime: IAgentRuntime): Promise<MusicInfoService> {
        logger.debug(`Starting MusicInfoService for agent ${runtime.character.name}`);
        return new MusicInfoService(runtime);
    }

    async stop(): Promise<void> {
        this.clearCache();
    }

    /**
     * Get service status for all integrated APIs
     */
    getServiceStatus(): MusicInfoServiceStatus {
        return { ...this.serviceStatus };
    }

    /**
     * Validate API keys for all configured services
     * Updates service status based on validation results
     */
    private async validateApiKeys(): Promise<void> {
        // Validate Last.fm
        if (this.lastFmClient) {
            try {
                const startTime = Date.now();
                // Test with a well-known artist
                const testResult = await this.lastFmClient.getArtistInfo('The Beatles');
                const responseTime = Date.now() - startTime;
                if (testResult) {
                    this.serviceStatus.lastFm = {
                        status: 'active' as ServiceStatus,
                        lastChecked: Date.now(),
                        responseTime,
                    };
                } else {
                    this.serviceStatus.lastFm = {
                        status: 'degraded' as ServiceStatus,
                        lastChecked: Date.now(),
                        responseTime,
                        lastError: 'API returned no results',
                    };
                }
            } catch (error) {
                this.serviceStatus.lastFm = {
                    status: 'unavailable' as ServiceStatus,
                    lastChecked: Date.now(),
                    lastError: String(error),
                };
                logger.warn(`Last.fm API validation failed: ${error}`);
            }
        }

        // Validate Genius
        if (this.geniusClient) {
            try {
                const startTime = Date.now();
                const isValid = await this.geniusClient.validateApiKey();
                const responseTime = Date.now() - startTime;
                this.serviceStatus.genius = {
                    status: isValid ? ('active' as ServiceStatus) : ('unavailable' as ServiceStatus),
                    lastChecked: Date.now(),
                    responseTime,
                    lastError: isValid ? undefined : 'Invalid API key',
                };
                if (!isValid) {
                    logger.warn('Genius API key validation failed');
                }
            } catch (error) {
                this.serviceStatus.genius = {
                    status: 'unavailable' as ServiceStatus,
                    lastChecked: Date.now(),
                    lastError: String(error),
                };
                logger.warn(`Genius API validation failed: ${error}`);
            }
        }

        // Validate TheAudioDB
        if (this.theAudioDbClient) {
            try {
                const startTime = Date.now();
                const isValid = await this.theAudioDbClient.validateApiKey();
                const responseTime = Date.now() - startTime;
                this.serviceStatus.theAudioDb = {
                    status: isValid ? ('active' as ServiceStatus) : ('unavailable' as ServiceStatus),
                    lastChecked: Date.now(),
                    responseTime,
                    lastError: isValid ? undefined : 'Invalid API key',
                };
                if (!isValid) {
                    logger.warn('TheAudioDB API key validation failed');
                }
            } catch (error) {
                this.serviceStatus.theAudioDb = {
                    status: 'unavailable' as ServiceStatus,
                    lastChecked: Date.now(),
                    lastError: String(error),
                };
                logger.warn(`TheAudioDB API validation failed: ${error}`);
            }
        }

        // Validate MusicBrainz (always available, but test connectivity)
        if (this.musicBrainzClient) {
            try {
                const startTime = Date.now();
                await this.musicBrainzClient.searchRecording('Test', 'Test');
                const responseTime = Date.now() - startTime;
                this.serviceStatus.musicBrainz = {
                    status: 'active' as ServiceStatus,
                    lastChecked: Date.now(),
                    responseTime,
                };
            } catch (error) {
                this.serviceStatus.musicBrainz = {
                    status: 'degraded' as ServiceStatus,
                    lastChecked: Date.now(),
                    lastError: String(error),
                };
                logger.warn(`MusicBrainz connectivity check failed: ${error}`);
            }
        }

        // Validate Wikipedia
        const wikipediaService = this.runtime?.getService('wikipedia') as WikipediaService | null;
        if (wikipediaService) {
            try {
                const startTime = Date.now();
                const testResult = await wikipediaService.getArtistInfo('The Beatles');
                const responseTime = Date.now() - startTime;
                this.serviceStatus.wikipedia = {
                    status: testResult ? ('active' as ServiceStatus) : ('degraded' as ServiceStatus),
                    lastChecked: Date.now(),
                    responseTime,
                };
            } catch (error) {
                this.serviceStatus.wikipedia = {
                    status: 'degraded' as ServiceStatus,
                    lastChecked: Date.now(),
                    lastError: String(error),
                };
                logger.warn(`Wikipedia service check failed: ${error}`);
            }
        }
    }

    /**
     * Extract track information from a YouTube URL or title
     * Uses fallback chain: YouTube -> MusicBrainz -> Last.fm -> Wikipedia -> Manual parsing
     */
    async getTrackInfo(urlOrTitle: string): Promise<MusicInfoResult | null> {
        const cacheKey = `track:${urlOrTitle}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.data;
        }

        try {
            // Step 1: Try YouTube URL first (if it's a URL)
            if (this.isYouTubeUrl(urlOrTitle)) {
                const info = await this.getInfoFromYouTube(urlOrTitle);
                if (info?.track) {
                    // Enrich with MusicBrainz/Last.fm if available
                    const enriched = await this.enrichTrackInfo(info.track);
                    const result: MusicInfoResult = {
                        track: enriched,
                        source: info.source,
                    };
                    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
                    return result;
                }
            }

            // Step 2: Parse title to extract artist and track name
            const parsed = this.parseTitle(urlOrTitle);
            const trackName = parsed.title;
            const artistName = parsed.artist;

            // Step 3: Try MusicBrainz (free, no API key)
            if (this.musicBrainzClient && trackName) {
                const mbTrack = await this.musicBrainzClient.searchRecording(trackName, artistName);
                if (mbTrack) {
                    const result: MusicInfoResult = {
                        track: mbTrack,
                        source: 'musicbrainz',
                    };
                    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
                    return result;
                }
            }

            // Step 4: Try Last.fm (requires API key)
            if (this.lastFmClient && trackName && artistName) {
                const lastFmTrack = await this.lastFmClient.getTrackInfo(trackName, artistName);
                if (lastFmTrack) {
                    const result: MusicInfoResult = {
                        track: lastFmTrack,
                        source: 'lastfm',
                    };
                    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
                    return result;
                }
            }

            // Step 5: Try Wikipedia (free, no API key)
            if (trackName) {
                const wikipediaService = this.runtime?.getService('wikipedia') as WikipediaService | null;
                if (wikipediaService) {
                    const wikiTrack = await wikipediaService.getTrackInfo(trackName, artistName);
                    if (wikiTrack) {
                        const result: MusicInfoResult = {
                            track: wikiTrack,
                            source: 'wikipedia',
                        };
                        this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
                        return result;
                    }
                }
            }

            // Step 6: Fallback to manual parsing
            const info = await this.getInfoFromTitle(urlOrTitle);
            if (info) {
                this.cache.set(cacheKey, { data: info, timestamp: Date.now() });
                return info;
            }

            return null;
        } catch (error) {
            logger.error(`Error fetching track info for ${urlOrTitle}: ${error}`);
            return null;
        }
    }

    /**
     * Enrich track info with additional metadata from MusicBrainz/Last.fm
     */
    private async enrichTrackInfo(track: TrackInfo): Promise<TrackInfo> {
        const enriched = { ...track };

        // Try to get additional info from MusicBrainz
        if (this.musicBrainzClient && track.title && track.artist) {
            try {
                const mbTrack = await this.musicBrainzClient.searchRecording(track.title, track.artist);
                if (mbTrack) {
                    // Merge metadata (prefer existing, fill in missing)
                    if (!enriched.album && mbTrack.album) enriched.album = mbTrack.album;
                    if (!enriched.duration && mbTrack.duration) enriched.duration = mbTrack.duration;
                    if (!enriched.genre && mbTrack.genre) enriched.genre = mbTrack.genre;
                    if (!enriched.year && mbTrack.year) enriched.year = mbTrack.year;
                    if (!enriched.tags && mbTrack.tags) enriched.tags = mbTrack.tags;
                }
            } catch (error) {
                // Silently continue if enrichment fails
            }
        }

        // Try to get additional info from Last.fm
        if (this.lastFmClient && track.title && track.artist) {
            try {
                const lastFmTrack = await this.lastFmClient.getTrackInfo(track.title, track.artist);
                if (lastFmTrack) {
                    // Merge metadata
                    if (!enriched.album && lastFmTrack.album) enriched.album = lastFmTrack.album;
                    if (!enriched.duration && lastFmTrack.duration) enriched.duration = lastFmTrack.duration;
                    if (!enriched.genre && lastFmTrack.genre) enriched.genre = lastFmTrack.genre;
                    if (!enriched.description && lastFmTrack.description) enriched.description = lastFmTrack.description;
                    if (!enriched.tags && lastFmTrack.tags) enriched.tags = lastFmTrack.tags;
                }
            } catch (error) {
                // Silently continue
            }
        }

        // Try to get additional info from Wikipedia
        if (track.title && track.artist) {
            const wikipediaService = this.runtime?.getService('wikipedia') as WikipediaService | null;
            if (wikipediaService) {
                try {
                    const wikiTrack = await wikipediaService.getTrackInfo(track.title, track.artist);
                    if (wikiTrack) {
                        // Merge metadata (Wikipedia often has good descriptions)
                        if (!enriched.description && wikiTrack.description) enriched.description = wikiTrack.description;
                        if (!enriched.year && wikiTrack.year) enriched.year = wikiTrack.year;
                        if (!enriched.url && wikiTrack.url) enriched.url = wikiTrack.url;
                    }
                } catch (error) {
                    // Silently continue
                }
            }
        }

        // Try to get lyrics from Genius
        if (this.geniusClient && track.title && track.artist) {
            try {
                const lyricsUrl = await this.geniusClient.getLyrics(track.title, track.artist);
                if (lyricsUrl && !enriched.lyricsUrl) {
                    enriched.lyricsUrl = lyricsUrl;
                }
            } catch (error) {
                // Update service status if lyrics fetch fails repeatedly
                if (this.serviceStatus.genius.status === 'active') {
                    this.serviceStatus.genius = {
                        ...this.serviceStatus.genius,
                        status: 'degraded' as ServiceStatus,
                        lastError: String(error),
                    };
                }
                // Silently continue if lyrics fetch fails
            }
        }

        return enriched;
    }

    /**
     * Parse title string to extract artist and track name
     */
    private parseTitle(title: string): { title: string; artist?: string } {
        const patterns = [
            /^(.+?)\s*-\s*(.+)$/, // "Artist - Title"
            /^(.+?)\s+by\s+(.+)$/i, // "Title by Artist"
        ];

        for (const pattern of patterns) {
            const match = title.match(pattern);
            if (match) {
                const [, part1, part2] = match;
                // Determine which is artist and which is title based on pattern
                if (pattern.source.includes('by')) {
                    return { title: part1.trim(), artist: part2.trim() };
                } else {
                    return { title: part2.trim(), artist: part1.trim() };
                }
            }
        }

        return { title: title.trim() };
    }

    /**
     * Get artist information
     * Uses fallback chain: MusicBrainz -> Last.fm -> Wikipedia -> Manual
     */
    async getArtistInfo(artistName: string): Promise<ArtistInfo | null> {
        const cacheKey = `artist:${artistName}`;
        const cached = this.cache.get(cacheKey);
        if (cached && cached.data.artist) {
            if (Date.now() - cached.timestamp < this.CACHE_TTL) {
                return cached.data.artist;
            }
        }

        try {
            // Try MusicBrainz first (free)
            if (this.musicBrainzClient) {
                const mbArtist = await this.musicBrainzClient.getArtist(artistName);
                if (mbArtist) {
                    this.cache.set(cacheKey, {
                        data: { artist: mbArtist, source: 'musicbrainz' },
                        timestamp: Date.now(),
                    });
                    return mbArtist;
                }
            }

            // Try Last.fm (requires API key)
            if (this.lastFmClient) {
                const lastFmArtist = await this.lastFmClient.getArtistInfo(artistName);
                if (lastFmArtist) {
                    this.cache.set(cacheKey, {
                        data: { artist: lastFmArtist, source: 'lastfm' },
                        timestamp: Date.now(),
                    });
                    return lastFmArtist;
                }
            }

            // Try Wikipedia (free, no API key) - great for related artists and influences
            const wikipediaService = this.runtime?.getService('wikipedia') as WikipediaService | null;
            let artistInfo: ArtistInfo | null = null;
            if (wikipediaService) {
                const wikiArtist = await wikipediaService.getArtistInfo(artistName);
                if (wikiArtist) {
                    artistInfo = wikiArtist;
                }
            }

            // Fallback to basic info if nothing found
            if (!artistInfo) {
                artistInfo = {
                    name: artistName,
                };
            }

            // Enrich with high-quality artwork from TheAudioDB
            if (this.theAudioDbClient) {
                try {
                    const audioDbArtist = await this.theAudioDbClient.getArtistInfo(artistName);
                    if (audioDbArtist) {
                        // Merge artwork (prefer TheAudioDB for high-quality images)
                        if (audioDbArtist.strArtistThumb) artistInfo.imageThumb = audioDbArtist.strArtistThumb;
                        if (audioDbArtist.strArtistLogo) artistInfo.imageLogo = audioDbArtist.strArtistLogo;
                        if (audioDbArtist.strArtistFanart) artistInfo.imageFanart = audioDbArtist.strArtistFanart;
                        if (audioDbArtist.strArtistBanner) artistInfo.imageBanner = audioDbArtist.strArtistBanner;
                        // Use thumbnail as main image if no image set
                        if (!artistInfo.image && audioDbArtist.strArtistThumb) {
                            artistInfo.image = audioDbArtist.strArtistThumb;
                        }
                        // Merge other metadata
                        if (!artistInfo.bio && audioDbArtist.strBiographyEN) {
                            artistInfo.bio = audioDbArtist.strBiographyEN;
                        }
                        if (!artistInfo.genres && audioDbArtist.strGenre) {
                            artistInfo.genres = [audioDbArtist.strGenre];
                        }
                    }
                } catch (error) {
                    // Update service status if artwork fetch fails repeatedly
                    if (this.serviceStatus.theAudioDb.status === 'active') {
                        this.serviceStatus.theAudioDb = {
                            ...this.serviceStatus.theAudioDb,
                            status: 'degraded' as ServiceStatus,
                            lastError: String(error),
                        };
                    }
                    // Silently continue if artwork fetch fails
                }
            }

            const source = artistInfo.name === artistName && Object.keys(artistInfo).length === 1 ? 'manual' : 'wikipedia';
            this.cache.set(cacheKey, {
                data: { artist: artistInfo, source },
                timestamp: Date.now(),
            });

            return artistInfo;
        } catch (error) {
            logger.error(`Error fetching artist info for ${artistName}: ${error}`);
            return null;
        }
    }

    /**
     * Get album information
     * Uses fallback chain: MusicBrainz -> Last.fm -> Wikipedia -> Manual
     */
    async getAlbumInfo(albumTitle: string, artistName?: string): Promise<AlbumInfo | null> {
        const cacheKey = `album:${albumTitle}:${artistName || ''}`;
        const cached = this.cache.get(cacheKey);
        if (cached && cached.data.album) {
            if (Date.now() - cached.timestamp < this.CACHE_TTL) {
                return cached.data.album;
            }
        }

        try {
            // Try MusicBrainz first (free)
            if (this.musicBrainzClient && artistName) {
                const mbAlbum = await this.musicBrainzClient.getRelease(albumTitle, artistName);
                if (mbAlbum) {
                    this.cache.set(cacheKey, {
                        data: { album: mbAlbum, source: 'musicbrainz' },
                        timestamp: Date.now(),
                    });
                    return mbAlbum;
                }
            }

            // Try Last.fm (requires API key)
            if (this.lastFmClient && artistName) {
                const lastFmAlbum = await this.lastFmClient.getAlbumInfo(albumTitle, artistName);
                if (lastFmAlbum) {
                    this.cache.set(cacheKey, {
                        data: { album: lastFmAlbum, source: 'lastfm' },
                        timestamp: Date.now(),
                    });
                    return lastFmAlbum;
                }
            }

            // Try Wikipedia (free, no API key)
            let albumInfo: AlbumInfo | null = null;
            if (artistName) {
                const wikipediaService = this.runtime?.getService('wikipedia') as WikipediaService | null;
                if (wikipediaService) {
                    const wikiAlbum = await wikipediaService.getAlbumInfo(albumTitle, artistName);
                    if (wikiAlbum) {
                        albumInfo = wikiAlbum;
                    }
                }
            }

            // Fallback to basic info if nothing found
            if (!albumInfo) {
                albumInfo = {
                    title: albumTitle,
                    artist: artistName || 'Unknown Artist',
                };
            }

            // Enrich with high-quality artwork from TheAudioDB
            if (this.theAudioDbClient) {
                try {
                    const audioDbAlbum = await this.theAudioDbClient.getAlbumInfo(albumTitle, artistName);
                    if (audioDbAlbum) {
                        // Merge artwork (prefer TheAudioDB for high-quality images)
                        if (audioDbAlbum.strAlbumThumb) albumInfo.coverArtThumb = audioDbAlbum.strAlbumThumb;
                        if (audioDbAlbum.strAlbumCDart) albumInfo.coverArtCD = audioDbAlbum.strAlbumCDart;
                        // Use thumbnail as main cover art if no cover art set
                        if (!albumInfo.coverArt && audioDbAlbum.strAlbumThumb) {
                            albumInfo.coverArt = audioDbAlbum.strAlbumThumb;
                        }
                        // Merge other metadata
                        if (!albumInfo.year && audioDbAlbum.intYearReleased) {
                            albumInfo.year = parseInt(audioDbAlbum.intYearReleased, 10);
                        }
                        if (!albumInfo.genre && audioDbAlbum.strGenre) {
                            albumInfo.genre = [audioDbAlbum.strGenre];
                        }
                        if (!albumInfo.description && audioDbAlbum.strDescriptionEN) {
                            albumInfo.description = audioDbAlbum.strDescriptionEN;
                        }
                    }
                } catch (error) {
                    // Update service status if artwork fetch fails repeatedly
                    if (this.serviceStatus.theAudioDb.status === 'active') {
                        this.serviceStatus.theAudioDb = {
                            ...this.serviceStatus.theAudioDb,
                            status: 'degraded' as ServiceStatus,
                            lastError: String(error),
                        };
                    }
                    // Silently continue if artwork fetch fails
                }
            }

            const source = albumInfo.title === albumTitle && Object.keys(albumInfo).length <= 2 ? 'manual' : 'wikipedia';
            this.cache.set(cacheKey, {
                data: { album: albumInfo, source },
                timestamp: Date.now(),
            });

            return albumInfo;
        } catch (error) {
            logger.error(`Error fetching album info for ${albumTitle}: ${error}`);
            return null;
        }
    }

    /**
     * Check if a string is a YouTube URL
     */
    private isYouTubeUrl(str: string): boolean {
        const youtubeRegex =
            /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/(watch\?v=|embed\/|v\/)?([a-zA-Z0-9_-]{11})/;
        return youtubeRegex.test(str);
    }

    /**
     * Extract information from YouTube URL using play-dl
     */
    private async getInfoFromYouTube(url: string): Promise<MusicInfoResult | null> {
        try {
            // Dynamic import to avoid bundling issues
            const play = await import('@vookav2/play-dl').then(m => m.default || m);
            const videoInfo = await play.video_info(url);

            const trackInfo: TrackInfo = {
                title: videoInfo.video_details.title || 'Unknown Title',
                artist: videoInfo.video_details.channel?.name || 'Unknown Artist',
                duration: videoInfo.video_details.durationInSec || undefined,
                url: url,
                thumbnail: videoInfo.video_details.thumbnails?.[0]?.url || undefined,
                description: videoInfo.video_details.description || undefined,
            };

            return {
                track: trackInfo,
                source: 'youtube',
            };
        } catch (error) {
            logger.error(`Error extracting YouTube info: ${error}`);
            return null;
        }
    }

    /**
     * Extract information from title/query string (fallback only)
     */
    private async getInfoFromTitle(title: string): Promise<MusicInfoResult | null> {
        const parsed = this.parseTitle(title);
        return {
            track: {
                title: parsed.title,
                artist: parsed.artist || 'Unknown Artist',
            },
            source: 'manual',
        };
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Clear expired cache entries
     */
    clearExpiredCache(): void {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp >= this.CACHE_TTL) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Pre-warm cache for a track (non-blocking)
     * This is called by plugin-dj to prepare caches before tracks are played
     * @param urlOrTitle - YouTube URL or track title
     */
    async prewarmTrackInfo(urlOrTitle: string): Promise<void> {
        // Check if already cached
        const cacheKey = `track:${urlOrTitle}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            // Already cached and fresh, no need to pre-warm
            return;
        }

        // Pre-warm asynchronously (fire and forget)
        this.getTrackInfo(urlOrTitle).catch((error) => {
            // Silently log errors - pre-warming is best effort
            logger.debug(`Failed to pre-warm track info for ${urlOrTitle}: ${error}`);
        });
    }

    /**
     * Pre-warm cache for multiple tracks (non-blocking)
     * @param tracks - Array of YouTube URLs or track titles
     */
    async prewarmTracks(tracks: string[]): Promise<void> {
        // Pre-warm all tracks in parallel (non-blocking)
        const promises = tracks.map((track) => this.prewarmTrackInfo(track));
        await Promise.allSettled(promises);
    }
}


