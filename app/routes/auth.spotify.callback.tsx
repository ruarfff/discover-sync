import type { LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { SpotifyAuth, createSpotifyAuth } from '~/lib/auth/spotify';
import { PKCEStorage } from '~/lib/auth/pkce-storage';
import { Database } from '~/lib/database';
import { nanoid } from 'nanoid';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Handle authorization errors
  if (error) {
    const errorDescription = url.searchParams.get('error_description') || 'Authorization failed';
    return redirect(`/?error=${encodeURIComponent(errorDescription)}`);
  }

  if (!code || !state) {
    return redirect('/?error=Missing authorization code');
  }

  try {
    // Initialize database tables if needed
    await Database.initialize();

    // Retrieve PKCE tokens from server-side storage
    const pkceData = await PKCEStorage.retrieve(state);
    if (!pkceData) {
      throw new Error('PKCE tokens not found - authorization may have expired');
    }

    // Clean up stored PKCE data
    await PKCEStorage.remove(state);

    // Exchange code for tokens
    const clientId = process.env.VITE_SPOTIFY_CLIENT_ID!;
    const baseUrl = process.env.VITE_APP_BASE_URL || 'http://localhost:5173';
    const redirectUri = `${baseUrl}/auth/spotify/callback`;
    
    const tokens = await SpotifyAuth.exchangeCodeForTokens(code, state, pkceData.codeVerifier, clientId, redirectUri);
    
    // Get user profile
    const spotifyAuth = createSpotifyAuth();
    const spotifyUser = await spotifyAuth.getCurrentUser(tokens.access_token);
    
    // Calculate token expiration
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
    
    // Find or create user
    let user = await Database.getUserBySpotifyId(spotifyUser.id);
    
    if (!user) {
      // Create new user
      const userId = nanoid();
      user = await Database.createUser(userId);
    }
    
    // Update user with Spotify tokens
    await Database.updateUser(user.id, {
      spotify_user_id: spotifyUser.id,
      spotify_access_token: tokens.access_token,
      spotify_refresh_token: tokens.refresh_token,
      spotify_expires_at: expiresAt
    });

    // Set session cookie and redirect to dashboard
    const response = redirect('/dashboard');
    
    // Set secure HTTP-only cookie with user ID
    const isProduction = process.env.NODE_ENV === 'production';
    response.headers.append('Set-Cookie', 
      `user_id=${user.id}; Path=/; HttpOnly${isProduction ? '; Secure' : ''}; SameSite=Lax; Max-Age=86400`
    );
    
    return response;
    
  } catch (error) {
    console.error('Spotify callback error:', error);
    const message = error instanceof Error ? error.message : 'Authentication failed';
    return redirect(`/?error=${encodeURIComponent(message)}`);
  }
}

export default function SpotifyCallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 mx-auto"></div>
        <p className="mt-4 text-lg text-gray-600">Connecting to Spotify...</p>
      </div>
    </div>
  );
}