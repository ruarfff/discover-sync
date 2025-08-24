import jwt from 'jsonwebtoken';

export interface AppleMusicConfig {
  teamId: string;
  keyId: string;
  privateKey: string;
}

export class AppleMusicAuth {
  private config: AppleMusicConfig;
  private developerToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(config: AppleMusicConfig) {
    this.config = config;
  }

  // Generate JWT developer token (server-side only)
  generateDeveloperToken(): string {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (180 * 24 * 60 * 60); // 180 days (max allowed)

    const payload = {
      iss: this.config.teamId,
      iat: now,
      exp: exp
    };

    const token = jwt.sign(payload, this.config.privateKey, {
      algorithm: 'ES256',
      header: {
        alg: 'ES256',
        kid: this.config.keyId
      }
    });

    this.developerToken = token;
    this.tokenExpiresAt = new Date(exp * 1000);
    
    return token;
  }

  // Get current developer token, generating if needed
  getDeveloperToken(): string {
    if (!this.developerToken || !this.tokenExpiresAt || this.tokenExpiresAt < new Date()) {
      return this.generateDeveloperToken();
    }
    return this.developerToken;
  }

  // Check if developer token is valid
  isTokenValid(): boolean {
    return !!(this.developerToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date());
  }
}

// Singleton instance for server-side use
let appleMusicAuthInstance: AppleMusicAuth | null = null;

export function getAppleMusicAuth(): AppleMusicAuth {
  if (!appleMusicAuthInstance) {
    const config: AppleMusicConfig = {
      teamId: process.env.APPLE_MUSIC_TEAM_ID!,
      keyId: process.env.APPLE_MUSIC_KEY_ID!,
      privateKey: process.env.APPLE_MUSIC_PRIVATE_KEY!.replace(/\\n/g, '\n')
    };

    appleMusicAuthInstance = new AppleMusicAuth(config);
  }

  return appleMusicAuthInstance;
}

// Client-side MusicKit initialization script
export const MUSICKIT_SCRIPT = `
  document.addEventListener('DOMContentLoaded', function() {
    MusicKit.configure({
      developerToken: window.__APPLE_DEVELOPER_TOKEN__,
      app: {
        name: 'Discover Sync',
        build: '1.0.0'
      }
    });
  });
`;