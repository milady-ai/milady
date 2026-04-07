import { Service, type IAgentRuntime, logger, ModelType } from '@elizaos/core';

const MUSIC_ENTITY_DETECTION_SERVICE_NAME = 'musicEntityDetection';

export interface DetectedMusicEntity {
  type: 'artist' | 'album' | 'song';
  name: string;
  confidence: number; // 0-1
  context?: string; // Surrounding text
}

/**
 * Service for detecting music entity names (artists, albums, songs) from text
 * Uses LLM for intelligent extraction with caching
 */
export class MusicEntityDetectionService extends Service {
  static serviceType: string = MUSIC_ENTITY_DETECTION_SERVICE_NAME;
  capabilityDescription = 'Detects music entity names (artists, albums, songs) from text using LLM';

  private cache: Map<string, { entities: DetectedMusicEntity[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 3600000; // 1 hour in milliseconds

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
  }

  static async start(runtime: IAgentRuntime): Promise<MusicEntityDetectionService> {
    logger.debug(`Starting MusicEntityDetectionService for agent ${runtime.character.name}`);
    return new MusicEntityDetectionService(runtime);
  }

  async stop(): Promise<void> {
    this.clearCache();
  }

  /**
   * Detect music entities from text using LLM
   */
  async detectEntities(text: string): Promise<DetectedMusicEntity[]> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Check cache
    const cacheKey = `detect:${text.substring(0, 200)}`; // Use first 200 chars as key
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.entities;
    }

    if (!this.runtime) {
      return [];
    }

    try {
      const prompt = `Extract music-related entities from the following text. Identify artists, albums, and songs.

Text: "${text}"

Return a JSON array of detected entities. Each entity should have:
- type: "artist", "album", or "song"
- name: the entity name (exact as mentioned)
- confidence: a number between 0 and 1 indicating confidence
- context: a brief snippet of surrounding text (optional)

IMPORTANT RULES:
- Do NOT include URLs (like YouTube links, Spotify links, etc.) as entities
- Only extract actual artist names, album titles, or song titles
- URLs should be completely ignored

Example format:
[
  {"type": "artist", "name": "The Beatles", "confidence": 0.9, "context": "mentioned in conversation"},
  {"type": "song", "name": "Bohemian Rhapsody", "confidence": 0.8}
]

If no music entities are found, return an empty array: [].

IMPORTANT: Only return valid JSON. Do not include any explanation or text outside the JSON array.`;

      const response = await this.runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
        maxTokens: 500,
      });

      // Parse JSON response
      let entities: DetectedMusicEntity[] = [];
      try {
        const cleaned = (response as string).trim();
        // Try to extract JSON array from response
        const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          entities = JSON.parse(jsonMatch[0]);
        } else {
          // Try parsing the whole response
          entities = JSON.parse(cleaned);
        }

        // Validate and filter entities
        const urlPattern = /^https?:\/\//i;
        entities = entities
          .filter((e: any) => {
            // Basic validation
            if (!e || typeof e !== 'object') return false;
            if (!['artist', 'album', 'song'].includes(e.type)) return false;
            if (typeof e.name !== 'string' || e.name.trim().length === 0) return false;
            if (typeof e.confidence !== 'number' || e.confidence < 0 || e.confidence > 1) return false;

            // Filter out URLs
            if (urlPattern.test(e.name)) {
              return false;
            }

            return true;
          })
          .map((e: any) => ({
            type: e.type,
            name: e.name.trim(),
            confidence: e.confidence,
            context: e.context?.trim(),
          }))
          .filter((e: DetectedMusicEntity) => e.confidence > 0.3); // Filter low confidence
      } catch (parseError) {
        logger.warn(`Failed to parse entity detection response: ${parseError}`);
        // Fallback: try simple pattern matching
        entities = this.fallbackDetection(text);
      }

      // Cache results
      this.cache.set(cacheKey, {
        entities,
        timestamp: Date.now(),
      });

      return entities;
    } catch (error) {
      logger.error(`Error detecting music entities: ${error}`);
      // Fallback to simple pattern matching
      return this.fallbackDetection(text);
    }
  }

  /**
   * Fallback detection using simple patterns when LLM fails
   */
  private fallbackDetection(text: string): DetectedMusicEntity[] {
    const entities: DetectedMusicEntity[] = [];

    // Look for quoted strings (often song/album names)
    const quotedMatches = text.matchAll(/"([^"]+)"/g);
    for (const match of quotedMatches) {
      const name = match[1].trim();
      if (name.length > 2 && name.length < 100) {
        entities.push({
          type: 'song', // Assume song if quoted
          name,
          confidence: 0.5,
          context: match[0],
        });
      }
    }

    // Look for "by Artist" patterns
    const byPattern = /"([^"]+)"\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi;
    const byMatches = text.matchAll(byPattern);
    for (const match of byMatches) {
      if (match[1]) {
        entities.push({
          type: 'song',
          name: match[1].trim(),
          confidence: 0.7,
          context: match[0],
        });
      }
      if (match[2]) {
        entities.push({
          type: 'artist',
          name: match[2].trim(),
          confidence: 0.7,
          context: match[0],
        });
      }
    }

    return entities;
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
}

