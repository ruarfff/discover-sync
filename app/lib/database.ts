import { neon } from '@netlify/neon';

const sql = neon(); // automatically uses NETLIFY_DATABASE_URL

export interface User {
  id: string;
  created_at: Date;
  updated_at: Date;
  spotify_user_id?: string;
  spotify_access_token?: string;
  spotify_refresh_token?: string;
  spotify_expires_at?: Date;
  apple_music_user_token?: string;
  apple_music_expires_at?: Date;
}

export interface SyncHistory {
  id: string;
  user_id: string;
  created_at: Date;
  playlist_name: string;
  source_platform: 'spotify';
  target_platform: 'apple_music';
  tracks_total: number;
  tracks_matched: number;
  tracks_added: number;
  status: 'completed' | 'failed' | 'partial';
  error_message?: string;
}

export interface TrackMatch {
  id: string;
  sync_id: string;
  spotify_track_id: string;
  spotify_track_name: string;
  spotify_artists: string;
  apple_track_id?: string;
  matched_via: 'isrc' | 'metadata' | 'failed';
  match_confidence?: number;
  error_message?: string;
}

export class Database {
  // Initialize database tables
  static async initialize() {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        spotify_user_id VARCHAR(255) UNIQUE,
        spotify_access_token TEXT,
        spotify_refresh_token TEXT,
        spotify_expires_at TIMESTAMP WITH TIME ZONE,
        apple_music_user_token TEXT,
        apple_music_expires_at TIMESTAMP WITH TIME ZONE
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS sync_history (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        playlist_name VARCHAR(500) NOT NULL,
        source_platform VARCHAR(50) NOT NULL,
        target_platform VARCHAR(50) NOT NULL,
        tracks_total INTEGER NOT NULL,
        tracks_matched INTEGER NOT NULL,
        tracks_added INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL,
        error_message TEXT
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS track_matches (
        id VARCHAR(255) PRIMARY KEY,
        sync_id VARCHAR(255) NOT NULL REFERENCES sync_history(id) ON DELETE CASCADE,
        spotify_track_id VARCHAR(255) NOT NULL,
        spotify_track_name VARCHAR(500) NOT NULL,
        spotify_artists VARCHAR(1000) NOT NULL,
        apple_track_id VARCHAR(255),
        matched_via VARCHAR(50) NOT NULL,
        match_confidence DECIMAL(3,2),
        error_message TEXT
      )
    `;

    // Create indexes for better performance
    await sql`CREATE INDEX IF NOT EXISTS idx_users_spotify_id ON users(spotify_user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sync_history_user_id ON sync_history(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_track_matches_sync_id ON track_matches(sync_id)`;
  }

  // User management
  static async createUser(id: string): Promise<User> {
    const [user] = await sql`
      INSERT INTO users (id) 
      VALUES (${id}) 
      RETURNING *
    `;
    return user as User;
  }

  static async getUserById(id: string): Promise<User | null> {
    const [user] = await sql`SELECT * FROM users WHERE id = ${id}`;
    return user ? (user as User) : null;
  }

  static async updateUser(id: string, updates: Partial<User>): Promise<User> {
    // For simplicity with neon, handle specific common update cases
    if (updates.spotify_user_id !== undefined || updates.spotify_access_token !== undefined) {
      return this.updateSpotifyTokens(id, updates);
    }
    
    if (updates.apple_music_user_token !== undefined) {
      return this.updateAppleMusicTokens(id, updates);
    }

    // For other cases, just return the current user (shouldn't happen in our app)
    return this.getUserById(id) as Promise<User>;
  }

  static async updateSpotifyTokens(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await sql`
      UPDATE users 
      SET 
        spotify_user_id = ${updates.spotify_user_id || null},
        spotify_access_token = ${updates.spotify_access_token || null},
        spotify_refresh_token = ${updates.spotify_refresh_token || null},
        spotify_expires_at = ${updates.spotify_expires_at || null},
        updated_at = NOW()
      WHERE id = ${id} 
      RETURNING *
    `;
    return user as User;
  }

  static async updateAppleMusicTokens(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await sql`
      UPDATE users 
      SET 
        apple_music_user_token = ${updates.apple_music_user_token || null},
        apple_music_expires_at = ${updates.apple_music_expires_at || null},
        updated_at = NOW()
      WHERE id = ${id} 
      RETURNING *
    `;
    return user as User;
  }

  static async getUserBySpotifyId(spotifyId: string): Promise<User | null> {
    const [user] = await sql`
      SELECT * FROM users WHERE spotify_user_id = ${spotifyId}
    `;
    return user ? (user as User) : null;
  }

  // Sync history management
  static async createSyncRecord(data: Omit<SyncHistory, 'id' | 'created_at'>): Promise<SyncHistory> {
    const id = nanoid();
    const [record] = await sql`
      INSERT INTO sync_history (
        id, user_id, playlist_name, source_platform, target_platform,
        tracks_total, tracks_matched, tracks_added, status, error_message
      ) VALUES (
        ${id}, ${data.user_id}, ${data.playlist_name}, ${data.source_platform},
        ${data.target_platform}, ${data.tracks_total}, ${data.tracks_matched},
        ${data.tracks_added}, ${data.status}, ${data.error_message}
      ) RETURNING *
    `;
    return record as SyncHistory;
  }

  static async getSyncHistoryByUser(userId: string, limit = 10): Promise<SyncHistory[]> {
    const records = await sql`
      SELECT * FROM sync_history 
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return records as SyncHistory[];
  }

  static async updateSyncRecord(id: string, updates: Partial<SyncHistory>): Promise<SyncHistory> {
    // Since this is only used for updating sync status, we can be specific
    const [record] = await sql`
      UPDATE sync_history 
      SET 
        tracks_total = ${updates.tracks_total || 0},
        tracks_matched = ${updates.tracks_matched || 0},
        tracks_added = ${updates.tracks_added || 0},
        status = ${updates.status || 'pending'},
        error_message = ${updates.error_message || null}
      WHERE id = ${id}
      RETURNING *
    `;
    return record as SyncHistory;
  }

  // Track match management
  static async createTrackMatch(data: Omit<TrackMatch, 'id'>): Promise<TrackMatch> {
    const id = nanoid();
    const [match] = await sql`
      INSERT INTO track_matches (
        id, sync_id, spotify_track_id, spotify_track_name, spotify_artists,
        apple_track_id, matched_via, match_confidence, error_message
      ) VALUES (
        ${id}, ${data.sync_id}, ${data.spotify_track_id}, ${data.spotify_track_name},
        ${data.spotify_artists}, ${data.apple_track_id}, ${data.matched_via},
        ${data.match_confidence}, ${data.error_message}
      ) RETURNING *
    `;
    return match as TrackMatch;
  }

  static async getTrackMatchesBySyncId(syncId: string): Promise<TrackMatch[]> {
    const matches = await sql`
      SELECT * FROM track_matches 
      WHERE sync_id = ${syncId}
      ORDER BY spotify_track_name
    `;
    return matches as TrackMatch[];
  }
}

// Import nanoid for ID generation
import { nanoid } from 'nanoid';