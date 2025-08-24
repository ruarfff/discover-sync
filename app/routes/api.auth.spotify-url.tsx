import type { ActionFunctionArgs } from 'react-router';
import { createSpotifyAuth } from '~/lib/auth/spotify';
import { PKCEStorage } from '~/lib/auth/pkce-storage';

export async function action({ request }: ActionFunctionArgs) {
  try {
    const spotifyAuth = createSpotifyAuth();
    const authDataString = await spotifyAuth.initiateAuth();
    const authData = JSON.parse(authDataString);
    
    // Store PKCE data server-side
    await PKCEStorage.store(authData.state, authData.codeVerifier, authData.codeChallenge);
    
    return Response.json({ authUrl: authData.authUrl, success: true });
  } catch (error) {
    console.error('Failed to generate Spotify auth URL:', error);
    return Response.json({ 
      error: 'Failed to generate authorization URL',
      success: false 
    }, { status: 500 });
  }
}

export async function loader() {
  // Handle GET requests the same way
  try {
    const spotifyAuth = createSpotifyAuth();
    const authDataString = await spotifyAuth.initiateAuth();
    const authData = JSON.parse(authDataString);
    
    // Store PKCE data server-side
    await PKCEStorage.store(authData.state, authData.codeVerifier, authData.codeChallenge);
    
    return Response.json({ authUrl: authData.authUrl, success: true });
  } catch (error) {
    console.error('Failed to generate Spotify auth URL:', error);
    return Response.json({ 
      error: 'Failed to generate authorization URL',
      success: false 
    }, { status: 500 });
  }
}