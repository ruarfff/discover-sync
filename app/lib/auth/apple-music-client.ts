// Client-side Apple Music authentication utilities
export class AppleMusicClient {
  private musicKit: any = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Wait for MusicKit to be available
    if (typeof window === 'undefined' || !window.MusicKit) {
      throw new Error('MusicKit not available - ensure the script is loaded');
    }

    try {
      // Get developer token from server
      const response = await fetch('/.netlify/functions/apple-music-token', {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to get Apple Music developer token');
      }

      const data = await response.json();
      if (!data.success || !data.developerToken) {
        throw new Error('Invalid developer token response');
      }

      // Configure MusicKit
      await window.MusicKit.configure({
        developerToken: data.developerToken,
        app: {
          name: 'Discover Sync',
          build: '1.0.0'
        }
      });

      this.musicKit = window.MusicKit.getInstance();
      this.isInitialized = true;

    } catch (error) {
      console.error('Apple Music initialization error:', error);
      throw error;
    }
  }

  async authorize(): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const userToken = await this.musicKit.authorize();
      
      // Save token to server
      await this.saveUserToken(userToken);
      
      return userToken;
    } catch (error) {
      console.error('Apple Music authorization error:', error);
      throw error;
    }
  }

  async unauthorize(): Promise<void> {
    if (!this.isInitialized) return;

    try {
      await this.musicKit.unauthorize();
      
      // Clear token from server
      await fetch('/api/auth/apple-music-clear', {
        method: 'POST'
      });
    } catch (error) {
      console.error('Apple Music unauthorized error:', error);
    }
  }

  isAuthorized(): boolean {
    return this.isInitialized && this.musicKit?.isAuthorized;
  }

  private async saveUserToken(userToken: string): Promise<void> {
    const response = await fetch('/api/auth/apple-music-save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userToken })
    });

    if (!response.ok) {
      throw new Error('Failed to save Apple Music user token');
    }
  }

  // Music API methods
  async searchTracks(query: string, limit = 25): Promise<any> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await this.musicKit.api.search(query, {
      types: ['songs'],
      limit
    });
  }

  async findTrackByISRC(isrc: string): Promise<any> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const results = await this.musicKit.api.songs({
      filter: { isrc }
    });

    return results.length > 0 ? results[0] : null;
  }

  async createPlaylist(name: string, description?: string): Promise<any> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await this.musicKit.api.library.playlists.create({
      attributes: { name, description }
    });
  }

  async addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const trackData = trackIds.map(id => ({
      id,
      type: 'songs'
    }));

    const response = await fetch(`https://api.music.apple.com/v1/me/library/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.musicKit.developerToken}`,
        'Music-User-Token': this.musicKit.musicUserToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tracks: { data: trackData } })
    });

    if (!response.ok) {
      throw new Error(`Failed to add tracks to playlist: ${response.statusText}`);
    }
  }
}

// Singleton instance
let appleMusicClient: AppleMusicClient | null = null;

export function getAppleMusicClient(): AppleMusicClient {
  if (!appleMusicClient) {
    appleMusicClient = new AppleMusicClient();
  }
  return appleMusicClient;
}