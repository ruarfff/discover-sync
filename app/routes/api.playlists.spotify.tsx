import type { LoaderFunctionArgs } from 'react-router';
import { createSpotifyService } from '~/lib/services/spotify-service';

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Get user ID from cookie
    const cookies = request.headers.get('Cookie') || '';
    const userIdMatch = cookies.match(/user_id=([^;]+)/);
    
    if (!userIdMatch) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = userIdMatch[1];
    
    // Get user's Spotify playlists
    const spotifyService = await createSpotifyService(userId);
    const playlists = await spotifyService.getAllUserPlaylists();

    // Transform playlists for the frontend
    const playlistsData = playlists.map(playlist => ({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description || '',
      trackCount: playlist.tracks.total,
      images: playlist.images || [],
      isOwner: playlist.owner.id === 'spotifydiscover' ? false : true, // Simplified owner check
      isDiscoverWeekly: playlist.name === 'Discover Weekly' && playlist.owner.id === 'spotifydiscover'
    }));

    return Response.json({
      success: true,
      playlists: playlistsData
    });

  } catch (error) {
    console.error('Get Spotify playlists error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get playlists';
    
    return Response.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}