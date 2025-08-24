import { getAppleMusicClient } from '../auth/apple-music-client';
import { Database } from '../database';
import { withRetry, logError, AuthenticationError, RateLimitError } from '../utils/error-handler';
import { appleMusicRequestQueue, batchRequests } from '../utils/rate-limiter';

export interface AppleMusicTrack {
  id: string;
  type: string;
  attributes: {
    name: string;
    artistName: string;
    albumName: string;
    durationInMillis: number;
    playParams?: {
      id: string;
      kind: string;
    };
    artwork?: {
      width: number;
      height: number;
      url: string;
    };
  };
}

export interface AppleMusicPlaylist {
  id: string;
  type: string;
  attributes: {
    name: string;
    description?: string;
    isPublic: boolean;
    canEdit: boolean;
    dateAdded: string;
  };
  relationships?: {
    tracks: {
      data: AppleMusicTrack[];
    };
  };
}

export interface PlaylistCreationOptions {
  name: string;
  description?: string;
  isPublic?: boolean;
}

export class AppleMusicService {
  private client: any;
  private userId: string;
  private userToken: string = '';
  private developerToken: string = '';

  constructor(userId: string) {
    this.userId = userId;
    this.client = getAppleMusicClient();
  }

  // Initialize the service and validate tokens
  async initialize(): Promise<void> {
    // Get user from database to check token validity
    const user = await Database.getUserById(this.userId);
    
    if (!user || !user.apple_music_user_token) {
      throw new Error('Apple Music not connected for this user');
    }

    if (user.apple_music_expires_at && user.apple_music_expires_at <= new Date()) {
      throw new Error('Apple Music token expired - re-authentication required');
    }

    this.userToken = user.apple_music_user_token;

    // Initialize client and get developer token
    await this.client.initialize();
    
    // Get fresh developer token
    const response = await fetch('/.netlify/functions/apple-music-token', {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error('Failed to get Apple Music developer token');
    }

    const data = await response.json();
    this.developerToken = data.developerToken;
  }

  // Create a new playlist
  async createPlaylist(options: PlaylistCreationOptions): Promise<AppleMusicPlaylist> {
    await this.initialize();

    try {
      const playlistData = {
        attributes: {
          name: options.name,
          description: options.description || '',
        }
      };

      const response = await fetch('https://api.music.apple.com/v1/me/library/playlists', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.developerToken}`,
          'Music-User-Token': this.userToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: [{
            type: 'library-playlists',
            attributes: playlistData.attributes
          }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create playlist: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return result.data[0];

    } catch (error) {
      console.error('Apple Music playlist creation error:', error);
      throw error;
    }
  }

  // Add tracks to a playlist
  async addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<void> {
    await this.initialize();

    if (trackIds.length === 0) {
      return; // Nothing to add
    }

    try {
      // Apple Music API allows up to 25 tracks per request
      const batches: string[][] = [];
      for (let i = 0; i < trackIds.length; i += 25) {
        batches.push(trackIds.slice(i, i + 25));
      }

      // Process batches with proper rate limiting and error handling
      await batchRequests(
        batches,
        (batch) => this.addTrackBatch(playlistId, batch),
        1, // Process one batch at a time
        500 // 500ms delay between batches
      );

    } catch (error) {
      logError(error, 'AppleMusicService.addTracksToPlaylist');
      throw error;
    }
  }

  // Add a batch of tracks to playlist
  private async addTrackBatch(playlistId: string, trackIds: string[]): Promise<void> {
    return appleMusicRequestQueue.enqueue(async () => {
      return withRetry(async () => {
        const trackData = trackIds.map(id => ({
          id,
          type: 'songs'
        }));

        const response = await fetch(`https://api.music.apple.com/v1/me/library/playlists/${playlistId}/tracks`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.developerToken}`,
            'Music-User-Token': this.userToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            data: trackData
          })
        });

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : undefined;
          throw new RateLimitError('Apple Music API rate limit exceeded', retryAfterMs);
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to add tracks to playlist: ${response.statusText} - ${errorText}`);
        }

        return;
      }, 3, (attempt, error) => {
        logError(error, `AppleMusicService.addTrackBatch - Retry attempt ${attempt}`);
      });
    });
  }

  // Search for tracks
  async searchTracks(query: string, limit = 25): Promise<AppleMusicTrack[]> {
    await this.initialize();

    try {
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(
        `https://api.music.apple.com/v1/catalog/us/search?term=${encodedQuery}&types=songs&limit=${limit}`,
        {
          headers: {
            'Authorization': `Bearer ${this.developerToken}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.results?.songs?.data || [];

    } catch (error) {
      console.error('Apple Music search error:', error);
      throw error;
    }
  }

  // Find track by ISRC
  async findTrackByISRC(isrc: string): Promise<AppleMusicTrack | null> {
    await this.initialize();

    try {
      const response = await fetch(
        `https://api.music.apple.com/v1/catalog/us/songs?filter[isrc]=${isrc}`,
        {
          headers: {
            'Authorization': `Bearer ${this.developerToken}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`ISRC search failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data && data.data.length > 0 ? data.data[0] : null;

    } catch (error) {
      console.error('Apple Music ISRC search error:', error);
      return null;
    }
  }

  // Get user's library playlists
  async getLibraryPlaylists(limit = 25, offset = 0): Promise<AppleMusicPlaylist[]> {
    await this.initialize();

    try {
      const response = await fetch(
        `https://api.music.apple.com/v1/me/library/playlists?limit=${limit}&offset=${offset}`,
        {
          headers: {
            'Authorization': `Bearer ${this.developerToken}`,
            'Music-User-Token': this.userToken
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get playlists: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data || [];

    } catch (error) {
      console.error('Apple Music get playlists error:', error);
      throw error;
    }
  }

  // Get playlist details
  async getPlaylistDetails(playlistId: string): Promise<AppleMusicPlaylist> {
    await this.initialize();

    try {
      const response = await fetch(
        `https://api.music.apple.com/v1/me/library/playlists/${playlistId}?include=tracks`,
        {
          headers: {
            'Authorization': `Bearer ${this.developerToken}`,
            'Music-User-Token': this.userToken
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get playlist details: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data[0];

    } catch (error) {
      console.error('Apple Music get playlist details error:', error);
      throw error;
    }
  }

  // Add songs to user's library
  async addToLibrary(trackIds: string[]): Promise<void> {
    await this.initialize();

    if (trackIds.length === 0) {
      return;
    }

    try {
      // Apple Music allows up to 100 songs per request for library addition
      const batchSize = 100;
      
      for (let i = 0; i < trackIds.length; i += batchSize) {
        const batch = trackIds.slice(i, i + batchSize);
        
        const response = await fetch('https://api.music.apple.com/v1/me/library', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.developerToken}`,
            'Music-User-Token': this.userToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ids: batch
          })
        });

        if (!response.ok) {
          console.warn(`Failed to add batch to library: ${response.statusText}`);
        }

        // Small delay between batches
        if (i + batchSize < trackIds.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

    } catch (error) {
      console.error('Apple Music add to library error:', error);
      throw error;
    }
  }

  // Get track details by IDs
  async getTracks(trackIds: string[]): Promise<AppleMusicTrack[]> {
    await this.initialize();

    if (trackIds.length === 0) {
      return [];
    }

    try {
      const idsParam = trackIds.join(',');
      const response = await fetch(
        `https://api.music.apple.com/v1/catalog/us/songs/${idsParam}`,
        {
          headers: {
            'Authorization': `Bearer ${this.developerToken}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get tracks: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data || [];

    } catch (error) {
      console.error('Apple Music get tracks error:', error);
      throw error;
    }
  }
}

// Factory function to create authenticated Apple Music service
export async function createAppleMusicService(userId: string): Promise<AppleMusicService> {
  const service = new AppleMusicService(userId);
  await service.initialize();
  return service;
}