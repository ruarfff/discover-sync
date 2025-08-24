import { nanoid } from 'nanoid';

export class AuthCrypto {
  // Generate cryptographically secure random string for PKCE
  static generateCodeVerifier(): string {
    return nanoid(128);
  }

  // Generate SHA256 hash and base64url encode for PKCE challenge
  static async generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // Generate random state parameter
  static generateState(): string {
    return nanoid(32);
  }

  // Base64url encode for JWT tokens
  static base64urlEncode(str: string): string {
    return btoa(str)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // Secure token storage helpers for browser
  static storeSecurely(key: string, value: string): void {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(key, value);
    }
  }

  static getSecurely(key: string): string | null {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(key);
    }
    return null;
  }

  static removeSecurely(key: string): void {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(key);
    }
  }
}