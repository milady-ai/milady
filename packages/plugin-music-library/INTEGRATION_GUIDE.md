# Music API Integration Guide

This document outlines third-party music metadata services that can be integrated into `@elizaos/plugin-music-info`, prioritized by cost and accessibility.

## Priority 1: Free APIs (No Sign-Up Required)

### 1. MusicBrainz API ⭐ **RECOMMENDED FIRST**
- **URL**: https://musicbrainz.org/doc/MusicBrainz_API
- **Cost**: Completely free, no authentication required
- **Rate Limits**: 1 request per second (can be increased with proper User-Agent)
- **Data Provided**:
  - Artists (biography, aliases, relationships)
  - Albums/Releases (release dates, labels, formats)
  - Tracks/Recordings (ISRCs, lengths, relationships)
  - Genres and tags
  - Cover art (via Cover Art Archive)
- **Pros**: 
  - Most comprehensive free database
  - Open-source and community-maintained
  - Excellent for metadata enrichment
  - No API key needed
- **Cons**: 
  - Rate limits are strict (1 req/sec)
  - Requires proper User-Agent header
  - Some data may be incomplete for newer releases
- **Implementation Priority**: **HIGH** - Start here for comprehensive metadata

### 2. TheAudioDB API
- **URL**: https://www.theaudiodb.com/
- **Cost**: Free tier available (test key)
- **Rate Limits**: Generous for free tier
- **Data Provided**:
  - High-quality artist images and album artwork
  - Artist biographies
  - Album descriptions
  - Track listings
- **Pros**: 
  - Excellent artwork quality
  - Good for visual metadata
  - Community-driven
- **Cons**: 
  - Less comprehensive than MusicBrainz
  - Requires API key (but free)
- **Implementation Priority**: **MEDIUM** - Good for artwork enrichment

### 3. Open Opus API
- **URL**: https://openopus.org/
- **Cost**: Free, no signup
- **Data Provided**: Classical music metadata (composers, works)
- **Pros**: Specialized for classical music
- **Cons**: Limited to classical genre only
- **Implementation Priority**: **LOW** - Only if classical music is a focus

## Priority 2: Free APIs (Sign-Up Required)

### 1. Last.fm API ⭐ **RECOMMENDED SECOND**
- **URL**: https://www.last.fm/api
- **Cost**: Free tier with API key
- **Rate Limits**: 5 requests per second
- **Data Provided**:
  - Track metadata (artist, album, duration)
  - Artist information (biography, similar artists, top tracks)
  - Album information (tracks, release date)
  - Tags and genres
  - User listening statistics (if user data available)
  - Track similarity and recommendations
- **Pros**: 
  - Very popular and well-maintained
  - Good for recommendations
  - Rich metadata
  - Good rate limits
- **Cons**: 
  - Requires API key (free signup)
  - Some data may be user-generated
- **Implementation Priority**: **HIGH** - Excellent for recommendations and similar artists

### 2. Spotify Web API
- **URL**: https://developer.spotify.com/documentation/web-api
- **Cost**: Free tier (requires OAuth app registration)
- **Rate Limits**: 10,000 requests per hour per user
- **Data Provided**:
  - Comprehensive track, album, artist metadata
  - Audio features (danceability, energy, tempo, etc.)
  - Genres and subgenres
  - Playlist information
  - Recommendations engine
  - Preview audio (30-second clips)
- **Pros**: 
  - Most comprehensive commercial database
  - Audio features for music analysis
  - Excellent for recommendations
  - High-quality metadata
- **Cons**: 
  - Requires OAuth setup (more complex)
  - Commercial use may require agreement
  - Rate limits per user (not global)
- **Implementation Priority**: **HIGH** - Best for audio features and recommendations

### 3. Genius API
- **URL**: https://docs.genius.com/
- **Cost**: Free tier with API key
- **Rate Limits**: Reasonable for free tier
- **Data Provided**:
  - Song lyrics
  - Artist information
  - Album information
  - Annotations and explanations
- **Pros**: 
  - Best source for lyrics
  - Rich annotations
  - Good for understanding song meaning
- **Cons**: 
  - Focused on lyrics primarily
  - Less comprehensive metadata
- **Implementation Priority**: **MEDIUM** - Good for lyrics integration

### 4. MusiXmatch API
- **URL**: https://developer.musixmatch.com/
- **Cost**: Free tier (2,000 requests/day)
- **Rate Limits**: 2,000 requests per day (free tier)
- **Data Provided**:
  - Lyrics (largest database)
  - Track metadata
  - Artist information
  - Translations
- **Pros**: 
  - Largest lyrics database
  - Good for international content
  - Translations available
- **Cons**: 
  - Limited free tier (2k/day)
  - Paid for higher limits
- **Implementation Priority**: **MEDIUM** - Alternative to Genius for lyrics

### 5. Deezer API
- **URL**: https://developers.deezer.com/api
- **Cost**: Free tier with API key
- **Rate Limits**: 50 requests per 5 seconds
- **Data Provided**:
  - Track, album, artist metadata
  - Playlist information
  - Radio stations
  - User data (if authenticated)
- **Pros**: 
  - Good metadata coverage
  - Playlist support
- **Cons**: 
  - Less popular than Spotify
  - Smaller catalog
- **Implementation Priority**: **LOW** - Spotify is better if implementing streaming APIs

## Priority 3: Paid Services

### 1. Spotify Web API (Commercial)
- **Cost**: Free for development, commercial use may require agreement
- **Pros**: Same as free tier but with commercial licensing
- **Implementation Priority**: **MEDIUM** - If commercial use is needed

### 2. MusiXmatch API (Paid Tiers)
- **Cost**: Paid plans for higher limits
- **Rate Limits**: Up to 200,000 requests/day (paid)
- **Implementation Priority**: **LOW** - Only if lyrics are critical and free tier insufficient

### 3. MusicAPI.com
- **URL**: https://musicapi.com/
- **Cost**: Enterprise pricing
- **Data Provided**: Universal API connecting to multiple streaming services
- **Pros**: Single API for multiple services
- **Cons**: Enterprise pricing
- **Implementation Priority**: **LOW** - Enterprise use only

### 4. Soundcharts Music Metadata API
- **URL**: https://soundcharts.com/en/music-metadata-api
- **Cost**: Enterprise pricing
- **Data Provided**: 60M+ songs, 12M+ artists, 24M+ albums
- **Pros**: Very comprehensive, standardized data
- **Cons**: Enterprise pricing
- **Implementation Priority**: **LOW** - Enterprise use only

## Recommended Implementation Order

1. **MusicBrainz** - Start here for comprehensive free metadata
2. **Last.fm** - Add for recommendations and similar artists
3. **Spotify Web API** - Add for audio features and better recommendations
4. **TheAudioDB** - Add for high-quality artwork
5. **Genius/MusiXmatch** - Add if lyrics are needed

## Implementation Strategy

### Phase 1: Free APIs (No Signup)
- ✅ MusicBrainz API
- ✅ TheAudioDB API (optional)

### Phase 2: Free APIs (Signup Required)
- ✅ Last.fm API
- ✅ Spotify Web API (basic metadata)
- ✅ Genius API (if lyrics needed)

### Phase 3: Enhanced Features
- Audio features from Spotify
- Recommendations from Last.fm/Spotify
- Lyrics from Genius/MusiXmatch

## Rate Limit Considerations

When implementing multiple APIs, consider:
- **Fallback chains**: Try MusicBrainz first, fallback to Last.fm, then Spotify
- **Caching**: Aggressively cache results (already implemented)
- **Request batching**: Combine multiple lookups when possible
- **User-Agent headers**: Required for MusicBrainz (must identify your app)

## Example Integration Flow

```
1. User requests track info for "Bohemian Rhapsody"
2. Check cache first
3. Try MusicBrainz (free, no auth)
4. If not found, try Last.fm (free with key)
5. If still not found, try Spotify (free with OAuth)
6. Combine results from all sources
7. Cache for 1 hour
8. Return enriched metadata
```

## Configuration

Each API will need configuration in `.env`:

```bash
# MusicBrainz (no key needed, but User-Agent required)
MUSICBRAINZ_USER_AGENT=YourAppName/1.0.0 (https://yourapp.com)

# Last.fm (free API key)
LASTFM_API_KEY=your_lastfm_api_key

# Spotify (OAuth app)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# TheAudioDB (free API key)
THEAUDIODB_API_KEY=your_theaudiodb_api_key

# Genius (free API key)
GENIUS_API_KEY=your_genius_api_key
```

