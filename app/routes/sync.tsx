import type { LoaderFunctionArgs } from 'react-router';
import { useLoaderData, useFetcher } from 'react-router';
import { useState, useEffect } from 'react';
import { Database, type User } from '~/lib/database';

interface LoaderData {
  user: User | null;
  spotifyConnected: boolean;
  appleMusicConnected: boolean;
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  trackCount: number;
  images: Array<{ url: string; width: number; height: number }>;
  isOwner: boolean;
  isDiscoverWeekly: boolean;
}

interface SyncProgress {
  phase: string;
  message: string;
  percentage: number;
  currentTrack?: number;
  totalTracks?: number;
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Get user ID from cookie
  const cookies = request.headers.get('Cookie') || '';
  const userIdMatch = cookies.match(/user_id=([^;]+)/);
  
  if (!userIdMatch) {
    return {
      user: null,
      spotifyConnected: false,
      appleMusicConnected: false
    };
  }

  const userId = userIdMatch[1];
  
  try {
    await Database.initialize();
    const user = await Database.getUserById(userId);
    
    if (!user) {
      return {
        user: null,
        spotifyConnected: false,
        appleMusicConnected: false
      };
    }

    const spotifyConnected = !!(
      user.spotify_access_token && 
      user.spotify_expires_at && 
      user.spotify_expires_at > new Date()
    );

    const appleMusicConnected = !!(
      user.apple_music_user_token && 
      user.apple_music_expires_at && 
      user.apple_music_expires_at > new Date()
    );

    return {
      user,
      spotifyConnected,
      appleMusicConnected
    };

  } catch (error) {
    console.error('Sync page loader error:', error);
    return {
      user: null,
      spotifyConnected: false,
      appleMusicConnected: false
    };
  }
}

export default function Sync() {
  const { user, spotifyConnected, appleMusicConnected } = useLoaderData<typeof loader>();
  const playlistsFetcher = useFetcher<{ success: boolean; playlists: SpotifyPlaylist[]; error?: string }>();
  const syncFetcher = useFetcher<{ success: boolean; error?: string; stats?: any }>();
  
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null);
  const [targetPlaylistName, setTargetPlaylistName] = useState('');
  const [addToLibrary, setAddToLibrary] = useState(true);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);

  // Load playlists when both services are connected
  useEffect(() => {
    if (spotifyConnected && appleMusicConnected) {
      playlistsFetcher.load('/api/playlists/spotify');
    }
  }, [spotifyConnected, appleMusicConnected]);

  // Handle sync completion
  useEffect(() => {
    if (syncFetcher.data) {
      setSyncInProgress(false);
      setSyncProgress(null);
      
      if (syncFetcher.data.success) {
        alert('Sync completed successfully!');
        setSelectedPlaylist(null);
        setTargetPlaylistName('');
      } else {
        alert(`Sync failed: ${syncFetcher.data.error}`);
      }
    }
  }, [syncFetcher.data]);

  const handleSyncPlaylist = (playlist: SpotifyPlaylist) => {
    if (!targetPlaylistName.trim()) {
      alert('Please enter a name for the Apple Music playlist');
      return;
    }

    setSyncInProgress(true);
    setSyncProgress({
      phase: 'starting',
      message: 'Starting sync...',
      percentage: 0
    });

    syncFetcher.submit({
      playlistId: playlist.id,
      playlistName: playlist.name,
      targetPlaylistName: targetPlaylistName,
      addToLibrary: addToLibrary.toString()
    }, {
      method: 'POST',
      action: '/api/sync/start',
      encType: 'application/json'
    });
  };

  const handleSyncDiscoverWeekly = () => {
    const playlistName = `Discover Weekly - ${new Date().toLocaleDateString()}`;
    
    setSyncInProgress(true);
    setSyncProgress({
      phase: 'starting',
      message: 'Looking for Discover Weekly...',
      percentage: 0
    });

    syncFetcher.submit({
      syncDiscoverWeekly: 'true',
      targetPlaylistName: playlistName,
      addToLibrary: 'true'
    }, {
      method: 'POST',
      action: '/api/sync/start',
      encType: 'application/json'
    });
  };

  // Redirect if not authenticated or missing connections
  if (!user || !spotifyConnected || !appleMusicConnected) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Sync Playlists</h1>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-yellow-800 mb-2">
              Setup Required
            </h2>
            <p className="text-yellow-700 mb-4">
              Please connect both Spotify and Apple Music before syncing playlists.
            </p>
            <a
              href="/dashboard"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">Sync Playlists</h1>
            <p className="mt-1 text-sm text-gray-600">
              Choose a Spotify playlist to sync to Apple Music
            </p>
          </div>

          {syncInProgress && syncProgress && (
            <div className="px-6 py-4 border-b border-gray-200 bg-blue-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900">
                  {syncProgress.message}
                </span>
                <span className="text-sm text-blue-700">
                  {syncProgress.percentage.toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${syncProgress.percentage}%` }}
                ></div>
              </div>
              {syncProgress.currentTrack && syncProgress.totalTracks && (
                <p className="text-xs text-blue-700 mt-1">
                  Processing track {syncProgress.currentTrack} of {syncProgress.totalTracks}
                </p>
              )}
            </div>
          )}

          <div className="p-6">
            {/* Quick Sync: Discover Weekly */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Sync</h2>
              <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">Discover Weekly</h3>
                    <p className="text-sm text-gray-600">
                      Sync your current Discover Weekly playlist
                    </p>
                  </div>
                  <button
                    onClick={handleSyncDiscoverWeekly}
                    disabled={syncInProgress}
                    className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {syncInProgress ? 'Syncing...' : 'Sync Now'}
                  </button>
                </div>
              </div>
            </div>

            {/* Manual Playlist Selection */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Choose Playlist</h2>
              
              {playlistsFetcher.state === 'loading' && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Loading playlists...</p>
                </div>
              )}

              {playlistsFetcher.data?.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-red-800">
                    Failed to load playlists: {playlistsFetcher.data.error}
                  </p>
                </div>
              )}

              {playlistsFetcher.data?.playlists && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {playlistsFetcher.data.playlists.map((playlist) => (
                      <div
                        key={playlist.id}
                        className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                          selectedPlaylist?.id === playlist.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setSelectedPlaylist(playlist)}
                      >
                        <div className="flex items-center space-x-3">
                          {playlist.images[0] && (
                            <img
                              src={playlist.images[0].url}
                              alt={playlist.name}
                              className="w-12 h-12 rounded"
                            />
                          )}
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900 truncate">
                              {playlist.name}
                            </h3>
                            <p className="text-sm text-gray-600">
                              {playlist.trackCount} tracks
                            </p>
                            {playlist.isDiscoverWeekly && (
                              <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                                Discover Weekly
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedPlaylist && (
                    <div className="mt-6 border-t pt-6">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">
                        Sync Settings
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label htmlFor="targetName" className="block text-sm font-medium text-gray-700 mb-1">
                            Apple Music Playlist Name
                          </label>
                          <input
                            type="text"
                            id="targetName"
                            value={targetPlaylistName}
                            onChange={(e) => setTargetPlaylistName(e.target.value)}
                            placeholder={selectedPlaylist.name}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="addToLibrary"
                            checked={addToLibrary}
                            onChange={(e) => setAddToLibrary(e.target.checked)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label htmlFor="addToLibrary" className="ml-2 text-sm text-gray-700">
                            Also add tracks to my Apple Music library
                          </label>
                        </div>

                        <button
                          onClick={() => handleSyncPlaylist(selectedPlaylist)}
                          disabled={syncInProgress || !targetPlaylistName.trim()}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {syncInProgress ? 'Syncing...' : `Sync "${selectedPlaylist.name}"`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}