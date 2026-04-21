import type { IAgentRuntime, Memory, Provider, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { MusicInfoService } from '../services/musicInfoService';
import { MusicEntityDetectionService } from '../services/musicEntityDetectionService';

/**
 * Provider that injects music information context into the agent's state
 * This is particularly useful for DJ introductions and music-related conversations
 * Uses entity detection to find music references in casual conversation
 */
export const musicInfoProvider: Provider = {
    name: 'MUSIC_INFO',
    description: 'Provides information about tracks, artists, and albums',
    position: 10, // Position after basic providers but before complex ones

    get: async (runtime: IAgentRuntime, message: Memory, _state: State) => {
        logger.debug('[MUSIC_INFO Provider] Starting provider execution');

        const musicInfoService = runtime.getService('musicInfo') as MusicInfoService;
        if (!musicInfoService) {
            logger.debug('[MUSIC_INFO Provider] MusicInfoService not available');
            return { text: '', data: {}, values: {} };
        }

        // Extract potential music references from the message
        const messageText = message.content?.text || '';
        if (!messageText || messageText.trim().length === 0) {
            logger.debug('[MUSIC_INFO Provider] Empty message text');
            return { text: '', data: {}, values: {} };
        }

        logger.debug(`[MUSIC_INFO Provider] Processing message: "${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}"`);

        const musicInfo: Array<{ type: 'track' | 'artist' | 'album'; info: any }> = [];

        // First, try to detect music entities using LLM-based detection
        const entityDetectionService = runtime.getService('musicEntityDetection') as MusicEntityDetectionService;
        if (entityDetectionService) {
            logger.debug('[MUSIC_INFO Provider] Attempting entity detection');
            try {
                const detectedEntities = await entityDetectionService.detectEntities(messageText);
                logger.debug(`[MUSIC_INFO Provider] Detected ${detectedEntities.length} entities: ${detectedEntities.map(e => `${e.type}:${e.name}`).join(', ')}`);

                for (const entity of detectedEntities.slice(0, 3)) {
                    // Limit to 3 entities to avoid too many API calls
                    logger.debug(`[MUSIC_INFO Provider] Fetching info for ${entity.type}: ${entity.name}`);
                    try {
                        let info: any = null;
                        if (entity.type === 'song') {
                            const trackInfo = await musicInfoService.getTrackInfo(entity.name);
                            if (trackInfo?.track) {
                                info = trackInfo.track;
                                musicInfo.push({ type: 'track', info });
                                logger.debug(`[MUSIC_INFO Provider] Successfully fetched track info for: ${entity.name}`);
                            } else {
                                logger.debug(`[MUSIC_INFO Provider] No track info found for: ${entity.name}`);
                            }
                        } else if (entity.type === 'artist') {
                            const artistInfo = await musicInfoService.getArtistInfo(entity.name);
                            if (artistInfo) {
                                info = artistInfo;
                                musicInfo.push({ type: 'artist', info });
                                logger.debug(`[MUSIC_INFO Provider] Successfully fetched artist info for: ${entity.name}`);
                            } else {
                                logger.debug(`[MUSIC_INFO Provider] No artist info found for: ${entity.name}`);
                            }
                        } else if (entity.type === 'album') {
                            const albumInfo = await musicInfoService.getAlbumInfo(entity.name);
                            if (albumInfo) {
                                info = albumInfo;
                                musicInfo.push({ type: 'album', info });
                                logger.debug(`[MUSIC_INFO Provider] Successfully fetched album info for: ${entity.name}`);
                            } else {
                                logger.debug(`[MUSIC_INFO Provider] No album info found for: ${entity.name}`);
                            }
                        }
                    } catch (error) {
                        logger.warn(`[MUSIC_INFO Provider] Error fetching info for ${entity.type} "${entity.name}": ${error}`);
                    }
                }
            } catch (error) {
                logger.warn(`[MUSIC_INFO Provider] Entity detection failed: ${error}`);
                // If entity detection fails, fall back to pattern matching
            }
        } else {
            logger.debug('[MUSIC_INFO Provider] EntityDetectionService not available, skipping entity detection');
        }

        // Fallback: Look for YouTube URLs
        if (musicInfo.length === 0) {
            logger.debug('[MUSIC_INFO Provider] No entities found, trying YouTube URL detection');
            const youtubeUrlRegex =
                /(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/(watch\?v=|embed\/|v\/)?([a-zA-Z0-9_-]{11})/g;
            const youtubeMatches = messageText.match(youtubeUrlRegex);
            if (youtubeMatches) {
                logger.debug(`[MUSIC_INFO Provider] Found ${youtubeMatches.length} YouTube URL(s)`);
                for (const url of youtubeMatches.slice(0, 2)) {
                    // Limit to 2 URLs
                    try {
                        logger.debug(`[MUSIC_INFO Provider] Fetching track info for YouTube URL: ${url}`);
                        const trackInfo = await musicInfoService.getTrackInfo(url);
                        if (trackInfo?.track) {
                            musicInfo.push({ type: 'track', info: trackInfo.track });
                            logger.debug(`[MUSIC_INFO Provider] Successfully fetched track info from YouTube URL`);
                        } else {
                            logger.debug(`[MUSIC_INFO Provider] No track info found for YouTube URL`);
                        }
                    } catch (error) {
                        logger.warn(`[MUSIC_INFO Provider] Error fetching YouTube track info: ${error}`);
                    }
                }
            }
        }

        // Fallback: Look for common patterns like "Artist - Title"
        if (musicInfo.length === 0) {
            logger.debug('[MUSIC_INFO Provider] No YouTube URLs found, trying pattern matching');
            const trackPatterns = [
                /"([^"]+)"\s+by\s+([^,\.!?]+)/i,
                /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+-\s+([A-Z][a-z]+(?:\s+[a-z]+)*)/, // "Artist - Title" with capital letters
                /song\s+["']([^"']+)["']/i,
                /track\s+["']([^"']+)["']/i,
            ];

            for (const pattern of trackPatterns) {
                const match = messageText.match(pattern);
                if (match) {
                    logger.debug(`[MUSIC_INFO Provider] Pattern match found: ${match[0]}`);
                    try {
                        const query = match[0];
                        const trackInfo = await musicInfoService.getTrackInfo(query);
                        if (trackInfo?.track) {
                            musicInfo.push({ type: 'track', info: trackInfo.track });
                            logger.debug(`[MUSIC_INFO Provider] Successfully fetched track info from pattern`);
                            break; // Found one, stop looking
                        } else {
                            logger.debug(`[MUSIC_INFO Provider] No track info found for pattern match`);
                        }
                    } catch (error) {
                        logger.warn(`[MUSIC_INFO Provider] Error fetching track info from pattern: ${error}`);
                    }
                }
            }
        }

        if (musicInfo.length === 0) {
            logger.debug('[MUSIC_INFO Provider] No music info found, returning empty result');
            return { text: '', data: {}, values: {} };
        }

        logger.debug(`[MUSIC_INFO Provider] Found ${musicInfo.length} music info item(s)`);

        // Format the information as text
        const infoTexts: string[] = [];
        for (const item of musicInfo) {
            if (item.type === 'track' && item.info) {
                const track = item.info;
                const parts: string[] = [];
                parts.push(`Track: "${track.title}"`);
                if (track.artist) {
                    parts.push(`Artist: ${track.artist}`);
                }
                if (track.album) {
                    parts.push(`Album: ${track.album}`);
                }
                if (track.genre && track.genre.length > 0) {
                    parts.push(`Genre: ${track.genre.join(', ')}`);
                }
                if (track.year) {
                    parts.push(`Year: ${track.year}`);
                }
                if (track.duration) {
                    const minutes = Math.floor(track.duration / 60);
                    const seconds = track.duration % 60;
                    parts.push(`Duration: ${minutes}:${seconds.toString().padStart(2, '0')}`);
                }
                if (track.description) {
                    parts.push(`Description: ${track.description.substring(0, 200)}${track.description.length > 200 ? '...' : ''}`);
                }
                if (track.lyricsUrl) {
                    parts.push(`Lyrics: ${track.lyricsUrl}`);
                }
                infoTexts.push(parts.join('\n'));
            } else if (item.type === 'artist' && item.info) {
                const artist = item.info;
                const parts: string[] = [];
                parts.push(`Artist: ${artist.name}`);
                if (artist.bio) {
                    parts.push(`Bio: ${artist.bio.substring(0, 300)}${artist.bio.length > 300 ? '...' : ''}`);
                }
                if (artist.genres && artist.genres.length > 0) {
                    parts.push(`Genres: ${artist.genres.join(', ')}`);
                }
                if (artist.similarArtists && artist.similarArtists.length > 0) {
                    parts.push(`Similar artists: ${artist.similarArtists.slice(0, 5).join(', ')}`);
                }
                if (artist.topTracks && artist.topTracks.length > 0) {
                    parts.push(`Top tracks: ${artist.topTracks.slice(0, 5).join(', ')}`);
                }
                infoTexts.push(parts.join('\n'));
            } else if (item.type === 'album' && item.info) {
                const album = item.info;
                const parts: string[] = [];
                parts.push(`Album: "${album.title}"`);
                if (album.artist) {
                    parts.push(`Artist: ${album.artist}`);
                }
                if (album.year) {
                    parts.push(`Year: ${album.year}`);
                }
                if (album.genre && album.genre.length > 0) {
                    parts.push(`Genre: ${album.genre.join(', ')}`);
                }
                if (album.tracks && album.tracks.length > 0) {
                    parts.push(`Tracks: ${album.tracks.slice(0, 10).join(', ')}${album.tracks.length > 10 ? '...' : ''}`);
                }
                if (album.description) {
                    parts.push(`Description: ${album.description.substring(0, 200)}${album.description.length > 200 ? '...' : ''}`);
                }
                infoTexts.push(parts.join('\n'));
            }
        }

        const text = infoTexts.length > 0
            ? `[MUSIC INFORMATION]\n${infoTexts.join('\n\n')}\n[/MUSIC INFORMATION]`
            : '';

        logger.debug(`[MUSIC_INFO Provider] Returning ${text.length} characters of music info text`);

        return {
            text,
            data: {
                musicInfo,
            },
            values: {
                musicInfoText: text,
            },
        };
    },
};

