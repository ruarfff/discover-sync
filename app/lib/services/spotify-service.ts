import { Database } from '../database';
import { withRetry, logError, AuthenticationError, RateLimitError } from '../utils/error-handler';
import { spotifyRequestQueue } from '../utils/rate-limiter';

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ name: string; id: string }>;
  album: {
    name: string;
    release_date: string;
    images: Array<{ url: string; width: number; height: number }>;
  };
  external_ids: {
    isrc?: string;
    ean?: string;
    upc?: string;
  };
  duration_ms: number;
  popularity: number;
  preview_url?: string;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  images: Array<{ url: string; width: number; height: number }>;
  tracks: {
    total: number;
    items: Array<{
      track: SpotifyTrack;
      added_at: string;
    }>;
  };
  owner: {
    id: string;
    display_name: string;
  };
  public: boolean;
  collaborative: boolean;
}

export interface SpotifyApiError {
  error: {
    status: number;
    message: string;
  };
}

export class SpotifyService {
  private accessToken: string;
  private userId: string;

  constructor(accessToken: string, userId: string) {
    this.accessToken = accessToken;
    this.userId = userId;
  }

  private async makeRequest(url: string, options: RequestInit = {}): Promise<Response> {
    return spotifyRequestQueue.enqueue(async () => {
      return withRetry(async () => {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            ...options.headers
          }
        });

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : undefined;
          throw new RateLimitError('Spotify API rate limit exceeded', retryAfterMs);
        }

        // Handle token expiration
        if (response.status === 401) {
          logError(new Error('Spotify token expired'), 'SpotifyService.makeRequest');
          await this.refreshAccessToken();
          // Create new request with refreshed token
          return fetch(url, {
            ...options,
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
              ...options.headers
            }
          });
        }

        if (!response.ok) {
          throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
        }

        return response;
      }, 3, (attempt, error) => {
        logError(error, `SpotifyService.makeRequest - Retry attempt ${attempt}`);
      });
    });
  }

  private async refreshAccessToken(): Promise<void> {
    try {
      const user = await Database.getUserById(this.userId);
      if (!user || !user.spotify_refresh_token) {
        throw new Error('No refresh token available');
      }

      const response = await fetch('/.netlify/functions/spotify-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          refreshToken: user.spotify_refresh_token
        })
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      this.accessToken = data.access_token;

    } catch (error) {
      logError(error, 'SpotifyService.refreshAccessToken');
      throw new AuthenticationError('Failed to refresh Spotify access token');
    }
  }

  // Get user's playlists
  async getUserPlaylists(limit = 50, offset = 0): Promise<SpotifyPlaylist[]> {
    const url = `https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`;
    const response = await this.makeRequest(url);

    if (!response.ok) {
      throw new Error(`Failed to get playlists: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items;
  }

  // Get all user's playlists (paginated)
  async getAllUserPlaylists(): Promise<SpotifyPlaylist[]> {
    const allPlaylists: SpotifyPlaylist[] = [];
    let offset = 0;
    const limit = 50;

    while (true) {
      const playlists = await this.getUserPlaylists(limit, offset);
      allPlaylists.push(...playlists);

      if (playlists.length < limit) {
        break; // No more playlists
      }

      offset += limit;
    }

    return allPlaylists;
  }

  // Try to find Discover Weekly playlist
  async findDiscoverWeekly(): Promise<SpotifyPlaylist | null> {
    try {
      const playlists = await this.getAllUserPlaylists();
      
      // Look for Discover Weekly by name and owner
      const discoverWeekly = playlists.find(playlist => 
        playlist.name === 'Discover Weekly' && 
        playlist.owner.id === 'spotifydiscover'
      );

      if (discoverWeekly) {
        // Get full playlist details with tracks
        return await this.getPlaylistDetails(discoverWeekly.id);
      }

      return null;
    } catch (error) {
      console.error('Error finding Discover Weekly:', error);
      return null;
    }
  }

  // Get detailed playlist information including tracks
  async getPlaylistDetails(playlistId: string): Promise<SpotifyPlaylist> {
    const url = `https://api.spotify.com/v1/playlists/${playlistId}`;
    const response = await this.makeRequest(url);

    if (!response.ok) {
      throw new Error(`Failed to get playlist details: ${response.statusText}`);
    }

    const playlist = await response.json();

    // If playlist has many tracks, we need to fetch them separately
    if (playlist.tracks.items.length < playlist.tracks.total) {
      playlist.tracks.items = await this.getAllPlaylistTracks(playlistId);
    }

    return playlist;
  }

  // Get all tracks from a playlist (handles pagination)
  async getAllPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    const allTracks: SpotifyTrack[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`;
      const response = await this.makeRequest(url);

      if (!response.ok) {
        throw new Error(`Failed to get playlist tracks: ${response.statusText}`);
      }

      const data = await response.json();
      const tracks = data.items.filter((item: any) => item.track && item.track.id); // Filter out null tracks
      
      allTracks.push(...tracks);

      if (tracks.length < limit) {
        break; // No more tracks
      }

      offset += limit;
    }

    return allTracks;
  }

  // Get track details by ID
  async getTrack(trackId: string): Promise<SpotifyTrack> {
    const url = `https://api.spotify.com/v1/tracks/${trackId}`;
    const response = await this.makeRequest(url);

    if (!response.ok) {
      throw new Error(`Failed to get track: ${response.statusText}`);
    }

    return await response.json();
  }

  // Get multiple tracks by IDs (batch request)
  async getTracks(trackIds: string[]): Promise<SpotifyTrack[]> {
    // Spotify allows up to 50 tracks per request
    const batches: SpotifyTrack[] = [];
    
    for (let i = 0; i < trackIds.length; i += 50) {
      const batch = trackIds.slice(i, i + 50);
      const url = `https://api.spotify.com/v1/tracks?ids=${batch.join(',')}`;
      const response = await this.makeRequest(url);

      if (!response.ok) {
        throw new Error(`Failed to get tracks: ${response.statusText}`);
      }

      const data = await response.json();
      batches.push(...data.tracks);
    }

    return batches;
  }

  // Search for tracks by ISRC
  async searchTracksByISRC(isrc: string): Promise<SpotifyTrack[]> {
    const url = `https://api.spotify.com/v1/search?type=track&q=isrc:${isrc}`;
    const response = await this.makeRequest(url);

    if (!response.ok) {
      throw new Error(`Failed to search tracks by ISRC: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tracks.items;
  }

  // Search for tracks by query
  async searchTracks(query: string, limit = 10): Promise<SpotifyTrack[]> {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.spotify.com/v1/search?type=track&q=${encodedQuery}&limit=${limit}`;
    const response = await this.makeRequest(url);

    if (!response.ok) {
      throw new Error(`Failed to search tracks: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tracks.items;
  }
}

// Factory function to create authenticated Spotify service
export async function createSpotifyService(userId: string): Promise<SpotifyService> {
  const user = await Database.getUserById(userId);
  
  if (!user || !user.spotify_access_token) {
    throw new Error('User not found or Spotify not connected');
  }

  // Check if token is expired
  if (user.spotify_expires_at && user.spotify_expires_at <= new Date()) {
    throw new Error('Spotify token expired - re-authentication required');
  }

  return new SpotifyService(user.spotify_access_token, userId);
}