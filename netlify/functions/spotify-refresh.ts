import type { Context } from '@netlify/functions';
import { Database } from '../../app/lib/database';

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    const { userId, refreshToken } = body;

    if (!userId || !refreshToken) {
      return new Response(JSON.stringify({
        error: 'Missing required parameters',
        success: false
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Refresh Spotify tokens
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.VITE_SPOTIFY_CLIENT_ID!
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token refresh failed: ${error.error_description || error.error}`);
    }

    const tokens = await response.json();
    
    // Update tokens in database
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
    
    await Database.updateUser(userId, {
      spotify_access_token: tokens.access_token,
      spotify_refresh_token: tokens.refresh_token || refreshToken,
      spotify_expires_at: expiresAt
    });

    return new Response(JSON.stringify({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
      expires_at: expiresAt.toISOString(),
      success: true
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Spotify token refresh error:', error);
    
    return new Response(JSON.stringify({
      error: 'Failed to refresh Spotify tokens',
      success: false
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};