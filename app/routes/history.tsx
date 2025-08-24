import type { LoaderFunctionArgs } from 'react-router';
import { useLoaderData, Link } from 'react-router';
import { Database, type User, type SyncHistory } from '~/lib/database';

interface LoaderData {
  user: User | null;
  spotifyConnected: boolean;
  appleMusicConnected: boolean;
  syncHistory: SyncHistory[];
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Get user ID from cookie
  const cookies = request.headers.get('Cookie') || '';
  const userIdMatch = cookies.match(/user_id=([^;]+)/);
  
  if (!userIdMatch) {
    return {
      user: null,
      spotifyConnected: false,
      appleMusicConnected: false,
      syncHistory: []
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
        appleMusicConnected: false,
        syncHistory: []
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

    // Get sync history
    const syncHistory = await Database.getSyncHistoryByUser(userId, 20);

    return {
      user,
      spotifyConnected,
      appleMusicConnected,
      syncHistory
    };

  } catch (error) {
    console.error('History page loader error:', error);
    return {
      user: null,
      spotifyConnected: false,
      appleMusicConnected: false,
      syncHistory: []
    };
  }
}

export default function History() {
  const { user, syncHistory } = useLoaderData<typeof loader>();

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Sync History</h1>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <p className="text-yellow-700 mb-4">
              Please log in to view your sync history.
            </p>
            <Link
              to="/dashboard"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getMatchRate = (sync: SyncHistory) => {
    if (sync.tracks_total === 0) return 0;
    return Math.round((sync.tracks_matched / sync.tracks_total) * 100);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Sync History</h1>
                <p className="mt-1 text-sm text-gray-600">
                  View your past playlist synchronizations
                </p>
              </div>
              <Link
                to="/sync"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                New Sync
              </Link>
            </div>
          </div>

          <div className="p-6">
            {syncHistory.length === 0 ? (
              <div className="text-center py-12">
                <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No sync history yet</h3>
                <p className="text-gray-600 mb-6">
                  Start syncing playlists to see your history here
                </p>
                <Link
                  to="/sync"
                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg"
                >
                  Start Your First Sync
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                {syncHistory.map((sync) => (
                  <div
                    key={sync.id}
                    className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                          {sync.playlist_name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {formatDate(sync.created_at.toString())}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(sync.status)}`}>
                        {sync.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">{sync.tracks_total}</div>
                        <div className="text-sm text-gray-600">Total Tracks</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">{sync.tracks_matched}</div>
                        <div className="text-sm text-gray-600">Matched</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{sync.tracks_added}</div>
                        <div className="text-sm text-gray-600">Added</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">{getMatchRate(sync)}%</div>
                        <div className="text-sm text-gray-600">Success Rate</div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-4">
                      <div className="flex justify-between text-sm text-gray-600 mb-1">
                        <span>Match Progress</span>
                        <span>{sync.tracks_matched} of {sync.tracks_total}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${getMatchRate(sync)}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Platform info */}
                    <div className="flex items-center text-sm text-gray-600">
                      <span className="capitalize">{sync.source_platform}</span>
                      <svg className="w-4 h-4 mx-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                      <span className="capitalize">{sync.target_platform.replace('_', ' ')}</span>
                    </div>

                    {/* Error message if failed */}
                    {sync.status === 'failed' && sync.error_message && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-800">
                          <strong>Error:</strong> {sync.error_message}
                        </p>
                      </div>
                    )}
                  </div>
                ))}

                {/* Load more button if needed */}
                {syncHistory.length >= 20 && (
                  <div className="text-center pt-6">
                    <button className="text-blue-600 hover:text-blue-800 font-medium">
                      Load More History
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick stats */}
        {syncHistory.length > 0 && (
          <div className="mt-8 bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary Statistics</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {syncHistory.length}
                </div>
                <div className="text-sm text-gray-600">Total Syncs</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  {syncHistory.filter(s => s.status === 'completed').length}
                </div>
                <div className="text-sm text-gray-600">Successful</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">
                  {syncHistory.reduce((sum, s) => sum + s.tracks_total, 0)}
                </div>
                <div className="text-sm text-gray-600">Tracks Processed</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-orange-600">
                  {syncHistory.reduce((sum, s) => sum + s.tracks_added, 0)}
                </div>
                <div className="text-sm text-gray-600">Tracks Added</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}