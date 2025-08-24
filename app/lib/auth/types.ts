export interface SpotifyTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
  images: Array<{
    url: string;
    height: number;
    width: number;
  }>;
}

export interface AppleMusicTokens {
  developerToken: string;
  userToken?: string;
  userTokenExpiresAt?: Date;
}

export interface AuthState {
  user: {
    id: string;
    spotifyConnected: boolean;
    appleMusicConnected: boolean;
    spotifyUser?: SpotifyUser;
  } | null;
  tokens: {
    spotify?: SpotifyTokens;
    appleMusic?: AppleMusicTokens;
  };
}

export interface PKCETokens {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}