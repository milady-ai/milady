import { logger } from '@elizaos/core';
import { Readable } from 'node:stream';
import { createYtdlpStream } from './ytdlpFallback';
import { createYtdlCoreStream } from './ytdlCoreFallback';

export interface StreamCreationResult {
    stream: Readable;
    source: 'play-dl' | 'yt-dlp' | 'ytdl-core';
}

/**
 * Unified stream creation with multi-tool fallback chain
 * 
 * Tries tools in order:
 * 1. play-dl (primary - fastest, most reliable for most cases)
 * 2. yt-dlp (fallback 1 - handles restrictions, age-gated content)
 * 3. ytdl-core (fallback 2 - pure Node.js, no CLI dependency)
 * 
 * @param url - YouTube URL to stream
 * @returns Stream creation result with the stream and which tool succeeded
 * @throws Error if all tools fail
 */
export async function createAudioStream(url: string): Promise<StreamCreationResult> {
    const errors: Array<{ tool: string; error: string }> = [];

    // Attempt 1: play-dl (primary tool)
    try {
        logger.debug(`[stream-fallback] Attempting play-dl for: ${url}`);
        const play = await import('@vookav2/play-dl').then(m => m.default || m);
        
        const streamData = await play.stream(url, { quality: 2 }); // quality 2 = high
        
        if (streamData && streamData.stream) {
            logger.info(`[stream-fallback] ✅ Success with play-dl`);
            return {
                stream: streamData.stream,
                source: 'play-dl',
            };
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ tool: 'play-dl', error: errorMessage });
        logger.debug(`[stream-fallback] play-dl failed: ${errorMessage}`);
    }

    // Attempt 2: yt-dlp (handles restricted/age-gated content)
    try {
        logger.debug(`[stream-fallback] Attempting yt-dlp fallback for: ${url}`);
        const stream = await createYtdlpStream(url);
        
        if (stream) {
            logger.info(`[stream-fallback] ✅ Success with yt-dlp`);
            return {
                stream,
                source: 'yt-dlp',
            };
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ tool: 'yt-dlp', error: errorMessage });
        logger.debug(`[stream-fallback] yt-dlp failed: ${errorMessage}`);
    }

    // Attempt 3: ytdl-core (pure Node.js fallback, no CLI required)
    try {
        logger.debug(`[stream-fallback] Attempting ytdl-core fallback for: ${url}`);
        const stream = await createYtdlCoreStream(url);
        
        if (stream) {
            logger.info(`[stream-fallback] ✅ Success with ytdl-core`);
            return {
                stream,
                source: 'ytdl-core',
            };
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ tool: 'ytdl-core', error: errorMessage });
        logger.debug(`[stream-fallback] ytdl-core failed: ${errorMessage}`);
    }

    // All tools failed - provide comprehensive error message
    const errorSummary = errors
        .map((e) => `  - ${e.tool}: ${e.error}`)
        .join('\n');

    const errorMessage =
        `Failed to create audio stream from ${url}\n` +
        `All fallback methods failed:\n${errorSummary}\n\n` +
        `Suggestions:\n` +
        `1. Ensure yt-dlp is installed (handles most restrictions)\n` +
        `2. For age-restricted videos, export YOUTUBE_COOKIES=/path/to/cookies.txt\n` +
        `3. Check if the video is available and not private/deleted`;

    logger.error(`[stream-fallback] ❌ All tools failed:\n${errorSummary}`);
    throw new Error(errorMessage);
}

/**
 * Check if a URL is a YouTube URL
 */
export function isYouTubeUrl(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return (
            (urlObj.hostname === 'youtube.com' ||
                urlObj.hostname === 'www.youtube.com' ||
                urlObj.hostname === 'youtu.be' ||
                urlObj.hostname === 'm.youtube.com') &&
            (urlObj.pathname.includes('/watch') ||
                urlObj.pathname.includes('/v/') ||
                urlObj.pathname.startsWith('/') ||
                urlObj.searchParams.has('v'))
        );
    } catch {
        return false;
    }
}








