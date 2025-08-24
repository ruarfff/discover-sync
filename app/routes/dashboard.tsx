import type { LoaderFunctionArgs } from 'react-router';
import { useLoaderData } from 'react-router';
import { Database, type User } from '~/lib/database';

interface LoaderData {
  user: User | null;
  spotifyConnected: boolean;
  appleMusicConnected: boolean;
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

    // Check if tokens are still valid
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
    console.error('Dashboard loader error:', error);
    return {
      user: null,
      spotifyConnected: false,
      appleMusicConnected: false
    };
  }
}

export default function Dashboard() {
  const { user, spotifyConnected, appleMusicConnected } = useLoaderData<typeof loader>();

  const handleSpotifyConnect = async () => {
    try {
      const response = await fetch('/api/auth/spotify-url');
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Failed to get Spotify auth URL:', error);
    }
  };

  const handleAppleMusicConnect = async () => {
    try {
      const { getAppleMusicClient } = await import('~/lib/auth/apple-music-client');
      const client = getAppleMusicClient();
      
      await client.authorize();
      window.location.reload();
    } catch (error) {
      console.error('Failed to connect Apple Music:', error);
      alert('Failed to connect to Apple Music. Please try again.');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Welcome to Discover Sync</h1>
          <p className="mb-8">Connect your Spotify account to get started</p>
          <button
            onClick={handleSpotifyConnect}
            className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold"
          >
            Connect Spotify
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>
          
          {/* Connection Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Spotify</h3>
                  <p className="text-sm text-gray-600">
                    {spotifyConnected ? 'Connected' : 'Not connected'}
                  </p>
                </div>
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full ${
                    spotifyConnected ? 'bg-green-500' : 'bg-red-500'
                  }`}></div>
                  {!spotifyConnected && (
                    <button
                      onClick={handleSpotifyConnect}
                      className="ml-4 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded text-sm"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Apple Music</h3>
                  <p className="text-sm text-gray-600">
                    {appleMusicConnected ? 'Connected' : 'Not connected'}
                  </p>
                </div>
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full ${
                    appleMusicConnected ? 'bg-green-500' : 'bg-red-500'
                  }`}></div>
                  {!appleMusicConnected && (
                    <button
                      onClick={handleAppleMusicConnect}
                      className="ml-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded text-sm"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sync Section */}
          {spotifyConnected && appleMusicConnected && (
            <div className="border rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Sync Playlists</h2>
              <p className="text-gray-600 mb-4">
                Sync your Spotify playlists to Apple Music
              </p>
              <div className="space-y-3">
                <div className="flex space-x-3">
                  <a 
                    href="/sync"
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold"
                  >
                    Start Sync
                  </a>
                  <a 
                    href="/history"
                    className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold"
                  >
                    View History
                  </a>
                </div>
                <p className="text-sm text-gray-500">
                  Sync individual playlists or view your sync history
                </p>
              </div>
            </div>
          )}

          {(!spotifyConnected || !appleMusicConnected) && (
            <div className="border rounded-lg p-6 bg-yellow-50">
              <h2 className="text-xl font-semibold mb-2 text-yellow-800">
                Complete Setup Required
              </h2>
              <p className="text-yellow-700">
                Connect both Spotify and Apple Music to start syncing playlists.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}