import { AuthCrypto } from './crypto';
import type { SpotifyTokens, SpotifyUser, PKCETokens } from './types';

export class SpotifyAuth {
  private clientId: string;
  private redirectUri: string;
  private scopes: string[];

  constructor(clientId: string, redirectUri: string) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
    this.scopes = [
      'playlist-read-private',
      'playlist-read-collaborative',
      'user-read-private',
      'user-read-email'
    ];
  }

  // Generate PKCE tokens and initiate authorization
  async initiateAuth(): Promise<string> {
    const codeVerifier = AuthCrypto.generateCodeVerifier();
    const codeChallenge = await AuthCrypto.generateCodeChallenge(codeVerifier);
    const state = AuthCrypto.generateState();

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: this.scopes.join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: state,
      show_dialog: 'true' // Force auth dialog for better UX
    });

    // Return both the URL and the state/verifier for server-side storage
    return JSON.stringify({
      authUrl: `https://accounts.spotify.com/authorize?${params.toString()}`,
      state,
      codeVerifier,
      codeChallenge
    });
  }

  // Exchange authorization code for access token (server-side)
  static async exchangeCodeForTokens(code: string, state: string, codeVerifier: string, clientId: string, redirectUri: string): Promise<SpotifyTokens> {
    // Exchange code for tokens
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
    }

    const tokens: SpotifyTokens = await response.json();
    return tokens;
  }

  // Refresh access token using refresh token
  async refreshTokens(refreshToken: string): Promise<SpotifyTokens> {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token refresh failed: ${error.error_description || error.error}`);
    }

    const tokens: SpotifyTokens = await response.json();
    
    // Preserve refresh token if not provided in response
    if (!tokens.refresh_token) {
      tokens.refresh_token = refreshToken;
    }

    return tokens;
  }

  // Get current user profile
  async getCurrentUser(accessToken: string): Promise<SpotifyUser> {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get user profile: ${response.statusText}`);
    }

    return await response.json();
  }

  // Check if access token is expired
  static isTokenExpired(expiresAt: Date): boolean {
    return new Date() >= expiresAt;
  }

  // Calculate expiration date from expires_in seconds
  static calculateExpirationDate(expiresIn: number): Date {
    return new Date(Date.now() + (expiresIn * 1000));
  }
}

// Create configured instance
export function createSpotifyAuth(): SpotifyAuth {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  const baseUrl = import.meta.env.VITE_APP_BASE_URL || 'http://localhost:5173';
  const redirectUri = `${baseUrl}/auth/spotify/callback`;
  
  if (!clientId) {
    throw new Error('Spotify client ID not configured');
  }

  return new SpotifyAuth(clientId, redirectUri);
}