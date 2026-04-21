import { logger } from '@elizaos/core';
import { Readable } from 'node:stream';

/**
 * Create a stream using ytdl-core as a final fallback
 * This is useful when yt-dlp is not available or fails
 * 
 * Note: ytdl-core is a pure Node.js library (no CLI dependency)
 * but may be less reliable with YouTube API changes
 */
export async function createYtdlCoreStream(url: string): Promise<Readable> {
    logger.debug(`[ytdl-core] Attempting to create stream for: ${url}`);

    try {
        // Lazy-load ytdl-core to avoid initialization issues during plugin load
        const ytdlModule = await import('@distube/ytdl-core');
        const ytdl = ytdlModule.default || ytdlModule;
        
        // Extract utility functions if they exist as separate exports
        const validateURL = (ytdlModule.validateURL || (ytdl as any).validateURL) as ((url: string) => boolean) | undefined;
        const getInfo = (ytdlModule.getInfo || (ytdl as any).getInfo) as ((url: string) => Promise<any>) | undefined;

        // Validate URL first if validateURL is available
        if (validateURL && !validateURL(url)) {
            throw new Error('Invalid YouTube URL');
        }

        // Get video info to ensure it's accessible (if getInfo is available)
        if (getInfo) {
            try {
                await getInfo(url);
            } catch (infoError: any) {
                const errorMsg = infoError?.message || String(infoError);
                const errorLower = errorMsg.toLowerCase();

                // Check for common restriction errors
                if (
                    errorLower.includes('sign in to confirm') ||
                    errorLower.includes('age verification') ||
                    errorLower.includes('private') ||
                    errorLower.includes('unavailable') ||
                    errorLower.includes('restricted')
                ) {
                    throw new Error(`Video is restricted or requires authentication: ${errorMsg}`);
                }

                throw new Error(`Failed to get video info: ${errorMsg}`);
            }
        }

        // Create audio stream with opus format (Discord-compatible)
        // Options:
        // - quality: 'highestaudio' - best audio quality
        // - filter: 'audioonly' - audio only, no video
        // - highWaterMark: 1024 * 1024 * 32 - 32MB buffer for smoother playback
        const stream = ytdl(url, {
            quality: 'highestaudio',
            filter: 'audioonly',
            highWaterMark: 1024 * 1024 * 32,
        });

        // Handle stream errors
        stream.on('error', (error) => {
            logger.error(`[ytdl-core] Stream error: ${error.message}`);
        });

        // Log stream info
        stream.on('info', (info: any) => {
            logger.debug(`[ytdl-core] Stream created for: ${info.videoDetails?.title || 'Unknown'}`);
        });

        logger.info(`[ytdl-core] Successfully created stream`);
        return stream;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorLower = errorMessage.toLowerCase();

        if (errorLower.includes('this.compose') || errorLower.includes('compose is not a function')) {
            logger.debug(`[ytdl-core] Unavailable (incompatible version): ${errorMessage}`);
            throw new Error(
                'ytdl-core: Unavailable in this environment (incompatible dependency). Use yt-dlp for playback.'
            );
        }

        logger.error(`[ytdl-core] Failed to create stream: ${errorMessage}`);

        if (
            errorLower.includes('sign in') ||
            errorLower.includes('age verification') ||
            errorLower.includes('restricted') ||
            errorLower.includes('private')
        ) {
            throw new Error(
                `ytdl-core: Video requires authentication or is restricted. ` +
                `Use yt-dlp with cookies for these cases.`
            );
        }

        if (errorLower.includes('invalid url') || errorLower.includes('not a valid')) {
            throw new Error(`ytdl-core: Invalid YouTube URL`);
        }

        throw new Error(`ytdl-core failed: ${errorMessage}`);
    }
}
