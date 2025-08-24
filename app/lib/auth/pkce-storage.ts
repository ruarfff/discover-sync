// Server-side PKCE token storage using database for persistence across server restarts
import { neon } from '@netlify/neon';

const sql = neon(); // automatically uses NETLIFY_DATABASE_URL

interface PKCEData {
  codeVerifier: string;
  codeChallenge: string;
  expiresAt: number;
}

export class PKCEStorage {
  // Initialize PKCE storage table
  static async initialize(): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS pkce_storage (
        state VARCHAR(255) PRIMARY KEY,
        code_verifier VARCHAR(512) NOT NULL,
        code_challenge VARCHAR(512) NOT NULL,
        expires_at BIGINT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Create index for cleanup
    await sql`
      CREATE INDEX IF NOT EXISTS idx_pkce_expires_at ON pkce_storage(expires_at)
    `;
  }

  static async store(state: string, codeVerifier: string, codeChallenge: string): Promise<void> {
    await this.initialize();
    
    const expiresAt = Date.now() + (15 * 60 * 1000); // 15 minutes
    
    await sql`
      INSERT INTO pkce_storage (state, code_verifier, code_challenge, expires_at)
      VALUES (${state}, ${codeVerifier}, ${codeChallenge}, ${expiresAt})
      ON CONFLICT (state) DO UPDATE SET
        code_verifier = ${codeVerifier},
        code_challenge = ${codeChallenge},
        expires_at = ${expiresAt}
    `;
    
  }

  static async retrieve(state: string): Promise<{ codeVerifier: string; codeChallenge: string } | null> {
    await this.initialize();
    
    
    // Clean up expired tokens first
    await sql`DELETE FROM pkce_storage WHERE expires_at < ${Date.now()}`;
    
    const [data] = await sql`
      SELECT code_verifier, code_challenge, expires_at 
      FROM pkce_storage 
      WHERE state = ${state}
    `;
    
    if (!data) {
      return null;
    }

    // Double-check expiration
    if (data.expires_at < Date.now()) {
      await this.remove(state);
      return null;
    }
    return {
      codeVerifier: data.code_verifier,
      codeChallenge: data.code_challenge
    };
  }

  static async remove(state: string): Promise<void> {
    await sql`DELETE FROM pkce_storage WHERE state = ${state}`;
    console.log(`🗑️ PKCE data removed for state: ${state}`);
  }
}