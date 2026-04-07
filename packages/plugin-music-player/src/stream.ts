import { type Readable, PassThrough } from 'node:stream';
import { logger } from '@elizaos/core';
import { createAudioStream } from './utils/streamFallback';

/**
 * Continuous audio stream with cross-fading support
 * This stream can be multiplexed to multiple destinations (Discord, web, etc.)
 */
export class ContinuousAudioStream extends PassThrough {
  private currentTrackStream: Readable | null = null;
  private nextTrackStream: Readable | null = null;
  private currentTrackTitle: string = '';
  private nextTrackTitle: string = '';
  private isCrossFading: boolean = false;
  private _crossFadeDuration: number = 3000; // 3 seconds - reserved for future volume-based cross-fade
  private _crossFadeStartTime: number = 0; // reserved for future volume-based cross-fade
  private _streamConsumers: Set<PassThrough> = new Set(); // reserved for future multi-destination support

  constructor() {
    super({ objectMode: false });
  }

  /**
   * Start playing a track
   */
  async playTrack(url: string, title: string): Promise<void> {
    // If we're already playing, prepare next track for cross-fade
    if (this.currentTrackStream) {
      await this.prepareNextTrack(url, title);
      this.startCrossFade();
    } else {
      // Start playing immediately
      await this.startTrack(url, title);
    }
  }

  /**
   * Start playing a track immediately
   */
  private async startTrack(url: string, title: string): Promise<void> {
    try {
      this.currentTrackTitle = title;

      // Use unified fallback chain: play-dl → yt-dlp → ytdl-core
      const streamResult = await createAudioStream(url);
      this.currentTrackStream = streamResult.stream;

      logger.debug(`Stream created using ${streamResult.source} for: ${title}`);

      this.currentTrackStream.on('error', (error) => {
        logger.error(`Audio stream error: ${error}`);
        this.emit('error', error);
      });

      this.currentTrackStream.on('end', () => {
        this.currentTrackStream = null;
        this.emit('trackEnd');
      });

      // Pipe current track to our stream
      this.currentTrackStream.pipe(this as unknown as NodeJS.WritableStream, { end: false });
    } catch (error) {
      logger.error(`Error starting track: ${error}`);
      this.emit('error', error);
    }
  }

  /**
   * Prepare the next track for cross-fading
   */
  private async prepareNextTrack(url: string, title: string): Promise<void> {
    try {
      this.nextTrackTitle = title;

      // Use unified fallback chain: play-dl → yt-dlp → ytdl-core
      const streamResult = await createAudioStream(url);
      this.nextTrackStream = streamResult.stream;

      logger.debug(`Next track stream created using ${streamResult.source} for: ${title}`);

      this.nextTrackStream.on('error', (error) => {
        logger.error(`Next track stream error: ${error}`);
      });
    } catch (error) {
      logger.error(`Error preparing next track: ${error}`);
    }
  }

  /**
   * Start cross-fading from current track to next track
   */
  private startCrossFade(): void {
    if (!this.nextTrackStream || !this.currentTrackStream) {
      return;
    }

    this.isCrossFading = true;
    this._crossFadeStartTime = Date.now();

    // For now, simple cross-fade: stop current, start next
    // TODO: Implement proper volume-based cross-fade when volume control is available
    this.currentTrackStream.once('end', () => {
      if (this.nextTrackStream) {
        // Switch to next track
        this.currentTrackStream = this.nextTrackStream;
        this.currentTrackTitle = this.nextTrackTitle;
        this.nextTrackStream = null;
        this.nextTrackTitle = '';
        this.isCrossFading = false;

        // Pipe new track to our stream
        this.currentTrackStream.pipe(this as unknown as NodeJS.WritableStream, { end: false });

        this.currentTrackStream.on('end', () => {
          this.currentTrackStream = null;
          this.emit('trackEnd');
        });
      }
    });

    // Unpipe current track and let it end naturally
    this.currentTrackStream.unpipe(this as unknown as NodeJS.WritableStream);
  }

  /**
   * Stop the stream
   */
  stop(): void {
    if (this.currentTrackStream) {
      this.currentTrackStream.destroy();
      this.currentTrackStream = null;
    }
    if (this.nextTrackStream) {
      this.nextTrackStream.destroy();
      this.nextTrackStream = null;
    }
    this.isCrossFading = false;
    this.end();
  }

  /**
   * Get current track title
   */
  getCurrentTrackTitle(): string {
    return this.currentTrackTitle;
  }

  /**
   * Check if cross-fading
   */
  isCurrentlyCrossFading(): boolean {
    return this.isCrossFading;
  }
}

