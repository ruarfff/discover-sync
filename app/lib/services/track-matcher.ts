import type { SpotifyTrack } from './spotify-service';
import { getAppleMusicClient } from '../auth/apple-music-client';

export interface TrackMatch {
  spotifyTrack: SpotifyTrack;
  appleMusicTrack?: any;
  matchMethod: 'isrc' | 'metadata' | 'failed';
  matchConfidence: number; // 0-1 scale
  errorMessage?: string;
}

export interface MatchingStats {
  totalTracks: number;
  isrcMatches: number;
  metadataMatches: number;
  failedMatches: number;
  averageConfidence: number;
}

export class TrackMatcher {
  private appleMusicClient: any;

  constructor() {
    this.appleMusicClient = getAppleMusicClient();
  }

  // Main matching function for a list of tracks
  async matchTracks(spotifyTracks: SpotifyTrack[]): Promise<TrackMatch[]> {
    const matches: TrackMatch[] = [];

    // Ensure Apple Music client is initialized
    await this.appleMusicClient.initialize();

    for (const track of spotifyTracks) {
      try {
        const match = await this.matchSingleTrack(track);
        matches.push(match);

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to match track ${track.name}:`, error);
        matches.push({
          spotifyTrack: track,
          matchMethod: 'failed',
          matchConfidence: 0,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return matches;
  }

  // Match a single track using multiple strategies
  async matchSingleTrack(spotifyTrack: SpotifyTrack): Promise<TrackMatch> {
    // Strategy 1: ISRC matching (most accurate)
    if (spotifyTrack.external_ids?.isrc) {
      try {
        const isrcMatch = await this.matchByISRC(spotifyTrack);
        if (isrcMatch) {
          return {
            spotifyTrack,
            appleMusicTrack: isrcMatch,
            matchMethod: 'isrc',
            matchConfidence: 1.0
          };
        }
      } catch (error) {
        console.warn(`ISRC match failed for ${spotifyTrack.name}:`, error);
      }
    }

    // Strategy 2: Metadata matching (fuzzy matching)
    try {
      const metadataMatch = await this.matchByMetadata(spotifyTrack);
      if (metadataMatch.track) {
        return {
          spotifyTrack,
          appleMusicTrack: metadataMatch.track,
          matchMethod: 'metadata',
          matchConfidence: metadataMatch.confidence
        };
      }
    } catch (error) {
      console.warn(`Metadata match failed for ${spotifyTrack.name}:`, error);
    }

    // No match found
    return {
      spotifyTrack,
      matchMethod: 'failed',
      matchConfidence: 0,
      errorMessage: 'No suitable match found in Apple Music'
    };
  }

  // Match track by ISRC code
  private async matchByISRC(spotifyTrack: SpotifyTrack): Promise<any | null> {
    if (!spotifyTrack.external_ids?.isrc) {
      return null;
    }

    const track = await this.appleMusicClient.findTrackByISRC(spotifyTrack.external_ids.isrc);
    return track;
  }

  // Match track by metadata (title, artist, album)
  private async matchByMetadata(spotifyTrack: SpotifyTrack): Promise<{ track: any | null; confidence: number }> {
    const artistNames = spotifyTrack.artists.map(artist => artist.name);
    const primaryArtist = artistNames[0];

    // Build search queries of different specificity
    const queries = [
      // Most specific: track + primary artist + album
      `${spotifyTrack.name} ${primaryArtist} ${spotifyTrack.album.name}`,
      // Medium specific: track + primary artist
      `${spotifyTrack.name} ${primaryArtist}`,
      // Least specific: track name only (for covers, remixes)
      spotifyTrack.name
    ];

    for (let i = 0; i < queries.length; i++) {
      try {
        const results = await this.appleMusicClient.searchTracks(queries[i], 10);
        
        if (results?.data?.length > 0) {
          // Find best match using similarity scoring
          const bestMatch = this.findBestMatch(spotifyTrack, results.data);
          
          if (bestMatch.score > 0.6) { // Minimum confidence threshold
            return {
              track: bestMatch.track,
              confidence: Math.max(0.9 - (i * 0.2), 0.5) * bestMatch.score
            };
          }
        }
      } catch (error) {
        console.warn(`Search failed for query "${queries[i]}":`, error);
      }
    }

    return { track: null, confidence: 0 };
  }

  // Find the best matching track from search results
  private findBestMatch(spotifyTrack: SpotifyTrack, appleMusicTracks: any[]): { track: any; score: number } {
    let bestMatch = { track: null, score: 0 };

    for (const appleTrack of appleMusicTracks) {
      const score = this.calculateSimilarityScore(spotifyTrack, appleTrack);
      
      if (score > bestMatch.score) {
        bestMatch = { track: appleTrack, score };
      }
    }

    return bestMatch;
  }

  // Calculate similarity score between Spotify and Apple Music tracks
  private calculateSimilarityScore(spotifyTrack: SpotifyTrack, appleTrack: any): number {
    let score = 0;
    let factors = 0;

    // Track name similarity (most important)
    const titleSimilarity = this.stringSimilarity(
      this.normalizeString(spotifyTrack.name),
      this.normalizeString(appleTrack.attributes.name)
    );
    score += titleSimilarity * 0.5;
    factors += 0.5;

    // Artist similarity
    const spotifyArtists = spotifyTrack.artists.map(a => this.normalizeString(a.name));
    const appleArtist = this.normalizeString(appleTrack.attributes.artistName);
    
    const artistMatch = spotifyArtists.some(artist => 
      this.stringSimilarity(artist, appleArtist) > 0.8
    );
    score += (artistMatch ? 1 : 0) * 0.3;
    factors += 0.3;

    // Album similarity (less important, as versions may differ)
    const albumSimilarity = this.stringSimilarity(
      this.normalizeString(spotifyTrack.album.name),
      this.normalizeString(appleTrack.attributes.albumName || '')
    );
    score += albumSimilarity * 0.15;
    factors += 0.15;

    // Duration similarity (within 5 seconds tolerance)
    const durationDiff = Math.abs(spotifyTrack.duration_ms - (appleTrack.attributes.durationInMillis || 0));
    const durationScore = durationDiff < 5000 ? 1 : Math.max(0, 1 - (durationDiff / 30000));
    score += durationScore * 0.05;
    factors += 0.05;

    return factors > 0 ? score / factors : 0;
  }

  // Normalize string for comparison
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .replace(/\b(feat|ft|featuring|vs|versus|remix|remaster|deluxe|edition)\b.*$/i, '') // Remove common suffixes
      .trim();
  }

  // Calculate Levenshtein distance-based similarity
  private stringSimilarity(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    
    if (maxLength === 0) return 1;
    return 1 - (distance / maxLength);
  }

  // Levenshtein distance algorithm
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  // Generate matching statistics
  generateStats(matches: TrackMatch[]): MatchingStats {
    const isrcMatches = matches.filter(m => m.matchMethod === 'isrc').length;
    const metadataMatches = matches.filter(m => m.matchMethod === 'metadata').length;
    const failedMatches = matches.filter(m => m.matchMethod === 'failed').length;

    const totalConfidence = matches.reduce((sum, match) => sum + match.matchConfidence, 0);
    const averageConfidence = matches.length > 0 ? totalConfidence / matches.length : 0;

    return {
      totalTracks: matches.length,
      isrcMatches,
      metadataMatches,
      failedMatches,
      averageConfidence
    };
  }
}