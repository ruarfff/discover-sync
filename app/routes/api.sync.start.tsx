import type { ActionFunctionArgs } from 'react-router';
import { SyncOrchestrator, type SyncOptions } from '~/lib/services/sync-orchestrator';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Get user ID from cookie
    const cookies = request.headers.get('Cookie') || '';
    const userIdMatch = cookies.match(/user_id=([^;]+)/);
    
    if (!userIdMatch) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = userIdMatch[1];
    const body = await request.json();
    
    const { 
      playlistId, 
      playlistName, 
      targetPlaylistName,
      addToLibrary = false,
      syncDiscoverWeekly = false
    } = body;

    // Create orchestrator
    const orchestrator = new SyncOrchestrator(userId);

    let result;

    if (syncDiscoverWeekly) {
      // Sync Discover Weekly specifically
      result = await orchestrator.findAndSyncDiscoverWeekly({
        targetPlaylistName,
        addToLibrary
      });
    } else {
      // Sync specified playlist
      if (!playlistId) {
        return Response.json({ 
          error: 'Playlist ID required for manual sync',
          success: false 
        }, { status: 400 });
      }

      const syncOptions: SyncOptions = {
        spotifyPlaylistId: playlistId,
        targetPlaylistName: targetPlaylistName || playlistName,
        addToLibrary
      };

      result = await orchestrator.syncPlaylist(syncOptions);
    }

    if (result.success) {
      return Response.json({
        success: true,
        syncId: result.syncId,
        playlistId: result.playlistId,
        playlistName: result.playlistName,
        stats: result.stats,
        message: `Successfully synced ${result.stats.isrcMatches + result.stats.metadataMatches} tracks`
      });
    } else {
      return Response.json({
        success: false,
        error: result.error || 'Sync failed',
        stats: result.stats
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Sync API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return Response.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}