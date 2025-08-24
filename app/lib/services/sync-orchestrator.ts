import { nanoid } from 'nanoid';
import { createSpotifyService, type SpotifyPlaylist, type SpotifyTrack } from './spotify-service';
import { createAppleMusicService, type AppleMusicService, type PlaylistCreationOptions } from './apple-music-service';
import { TrackMatcher, type TrackMatch, type MatchingStats } from './track-matcher';
import { Database, type SyncHistory, type TrackMatch as DbTrackMatch } from '../database';

export interface SyncOptions {
  spotifyPlaylistId: string;
  targetPlaylistName?: string; // If not provided, use source playlist name
  targetPlaylistDescription?: string;
  addToLibrary?: boolean; // Also add tracks to Apple Music library
  overwriteExisting?: boolean; // If playlist exists, overwrite it
}

export interface SyncProgress {
  phase: 'fetching' | 'matching' | 'creating' | 'adding' | 'completed' | 'failed';
  message: string;
  currentTrack?: number;
  totalTracks?: number;
  percentage: number;
  matches?: TrackMatch[];
  stats?: MatchingStats;
  error?: string;
}

export interface SyncResult {
  success: boolean;
  syncId: string;
  playlistId?: string;
  playlistName: string;
  stats: MatchingStats;
  matches: TrackMatch[];
  error?: string;
}

export type ProgressCallback = (progress: SyncProgress) => void;

export class SyncOrchestrator {
  private userId: string;
  private progressCallback?: ProgressCallback;
  private currentSyncId?: string;

  constructor(userId: string, progressCallback?: ProgressCallback) {
    this.userId = userId;
    this.progressCallback = progressCallback;
  }

  // Main sync function
  async syncPlaylist(options: SyncOptions): Promise<SyncResult> {
    this.currentSyncId = nanoid();
    
    try {
      // Initialize database
      await Database.initialize();

      // Phase 1: Fetch Spotify playlist
      this.updateProgress({
        phase: 'fetching',
        message: 'Fetching Spotify playlist...',
        percentage: 0
      });

      const spotifyService = await createSpotifyService(this.userId);
      const spotifyPlaylist = await spotifyService.getPlaylistDetails(options.spotifyPlaylistId);
      
      if (!spotifyPlaylist.tracks?.items?.length) {
        throw new Error('Playlist is empty or could not be fetched');
      }

      const tracks = spotifyPlaylist.tracks.items
        .map(item => item.track)
        .filter(track => track && track.id); // Remove null/invalid tracks

      this.updateProgress({
        phase: 'fetching',
        message: `Found ${tracks.length} tracks in playlist`,
        percentage: 10,
        totalTracks: tracks.length
      });

      // Phase 2: Match tracks
      this.updateProgress({
        phase: 'matching',
        message: 'Matching tracks with Apple Music...',
        percentage: 20,
        currentTrack: 0,
        totalTracks: tracks.length
      });

      const matcher = new TrackMatcher();
      const matches = await this.matchTracksWithProgress(matcher, tracks);
      const stats = matcher.generateStats(matches);

      this.updateProgress({
        phase: 'matching',
        message: `Matched ${stats.isrcMatches + stats.metadataMatches} of ${stats.totalTracks} tracks`,
        percentage: 60,
        matches,
        stats
      });

      // Phase 3: Create Apple Music playlist
      this.updateProgress({
        phase: 'creating',
        message: 'Creating Apple Music playlist...',
        percentage: 70
      });

      const appleMusicService = await createAppleMusicService(this.userId);
      const playlistName = options.targetPlaylistName || spotifyPlaylist.name;
      
      const createdPlaylist = await appleMusicService.createPlaylist({
        name: playlistName,
        description: options.targetPlaylistDescription || 
          `Synced from Spotify playlist "${spotifyPlaylist.name}" • ${stats.isrcMatches + stats.metadataMatches} tracks matched`
      });

      // Phase 4: Add tracks to playlist
      const successfulMatches = matches.filter(m => m.appleMusicTrack && m.matchMethod !== 'failed');
      const trackIds = successfulMatches.map(m => m.appleMusicTrack.id);

      this.updateProgress({
        phase: 'adding',
        message: `Adding ${trackIds.length} tracks to playlist...`,
        percentage: 80
      });

      if (trackIds.length > 0) {
        await appleMusicService.addTracksToPlaylist(createdPlaylist.id, trackIds);

        // Optionally add to library
        if (options.addToLibrary) {
          try {
            await appleMusicService.addToLibrary(trackIds);
          } catch (error) {
            console.warn('Failed to add tracks to library:', error);
            // Don't fail the entire sync for library addition failure
          }
        }
      }

      // Phase 5: Save sync history
      const syncRecord = await Database.createSyncRecord({
        user_id: this.userId,
        playlist_name: playlistName,
        source_platform: 'spotify',
        target_platform: 'apple_music',
        tracks_total: stats.totalTracks,
        tracks_matched: stats.isrcMatches + stats.metadataMatches,
        tracks_added: trackIds.length,
        status: 'completed'
      });

      // Save individual track matches
      for (const match of matches) {
        await Database.createTrackMatch({
          sync_id: syncRecord.id,
          spotify_track_id: match.spotifyTrack.id,
          spotify_track_name: match.spotifyTrack.name,
          spotify_artists: match.spotifyTrack.artists.map(a => a.name).join(', '),
          apple_track_id: match.appleMusicTrack?.id,
          matched_via: match.matchMethod,
          match_confidence: match.matchConfidence,
          error_message: match.errorMessage
        });
      }

      // Complete
      this.updateProgress({
        phase: 'completed',
        message: `Sync completed! ${trackIds.length} tracks added to "${playlistName}"`,
        percentage: 100,
        matches,
        stats
      });

      return {
        success: true,
        syncId: syncRecord.id,
        playlistId: createdPlaylist.id,
        playlistName,
        stats,
        matches
      };

    } catch (error) {
      console.error('Sync orchestration error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      // Save failed sync record if we got far enough
      if (this.currentSyncId) {
        try {
          await Database.createSyncRecord({
            user_id: this.userId,
            playlist_name: options.targetPlaylistName || 'Unknown',
            source_platform: 'spotify',
            target_platform: 'apple_music',
            tracks_total: 0,
            tracks_matched: 0,
            tracks_added: 0,
            status: 'failed',
            error_message: errorMessage
          });
        } catch (dbError) {
          console.error('Failed to save error sync record:', dbError);
        }
      }

      this.updateProgress({
        phase: 'failed',
        message: `Sync failed: ${errorMessage}`,
        percentage: 0,
        error: errorMessage
      });

      return {
        success: false,
        syncId: this.currentSyncId || nanoid(),
        playlistName: options.targetPlaylistName || 'Unknown',
        stats: { totalTracks: 0, isrcMatches: 0, metadataMatches: 0, failedMatches: 0, averageConfidence: 0 },
        matches: [],
        error: errorMessage
      };
    }
  }

  // Helper function to find Discover Weekly
  async findAndSyncDiscoverWeekly(options?: Omit<SyncOptions, 'spotifyPlaylistId'>): Promise<SyncResult> {
    try {
      this.updateProgress({
        phase: 'fetching',
        message: 'Looking for Discover Weekly playlist...',
        percentage: 0
      });

      const spotifyService = await createSpotifyService(this.userId);
      const discoverWeekly = await spotifyService.findDiscoverWeekly();

      if (!discoverWeekly) {
        throw new Error('Discover Weekly playlist not found. This may be due to Spotify API restrictions for new developer accounts.');
      }

      // Use Discover Weekly specific naming
      const syncOptions: SyncOptions = {
        spotifyPlaylistId: discoverWeekly.id,
        targetPlaylistName: options?.targetPlaylistName || `Discover Weekly - ${new Date().toISOString().split('T')[0]}`,
        targetPlaylistDescription: options?.targetPlaylistDescription || 
          `Your Discover Weekly playlist from ${new Date().toLocaleDateString()}`,
        addToLibrary: options?.addToLibrary ?? true, // Default to true for Discover Weekly
        overwriteExisting: options?.overwriteExisting
      };

      return await this.syncPlaylist(syncOptions);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to find Discover Weekly';
      
      this.updateProgress({
        phase: 'failed',
        message: errorMessage,
        percentage: 0,
        error: errorMessage
      });

      return {
        success: false,
        syncId: nanoid(),
        playlistName: 'Discover Weekly',
        stats: { totalTracks: 0, isrcMatches: 0, metadataMatches: 0, failedMatches: 0, averageConfidence: 0 },
        matches: [],
        error: errorMessage
      };
    }
  }

  // Match tracks with progress updates
  private async matchTracksWithProgress(matcher: TrackMatcher, tracks: SpotifyTrack[]): Promise<TrackMatch[]> {
    const matches: TrackMatch[] = [];

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      
      try {
        const match = await matcher.matchSingleTrack(track);
        matches.push(match);

        // Update progress every few tracks
        if (i % 5 === 0 || i === tracks.length - 1) {
          const percentage = 20 + (40 * (i + 1) / tracks.length); // 20-60% range
          this.updateProgress({
            phase: 'matching',
            message: `Matching tracks: ${i + 1}/${tracks.length}`,
            percentage,
            currentTrack: i + 1,
            totalTracks: tracks.length
          });
        }

        // Small delay to avoid overwhelming the APIs
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

  // Update progress and notify callback
  private updateProgress(progress: SyncProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  // Get user's sync history
  async getSyncHistory(limit = 10): Promise<SyncHistory[]> {
    await Database.initialize();
    return await Database.getSyncHistoryByUser(this.userId, limit);
  }

  // Get detailed sync results
  async getSyncDetails(syncId: string): Promise<{ sync: SyncHistory; matches: DbTrackMatch[] }> {
    await Database.initialize();
    
    const [syncHistory] = await Database.getSyncHistoryByUser(this.userId, 100);
    const sync = syncHistory; // This would need to be filtered by syncId in a real implementation
    const matches = await Database.getTrackMatchesBySyncId(syncId);

    return { sync, matches };
  }
}