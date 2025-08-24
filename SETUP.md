# Discover Sync - Setup Instructions

## Overview

Discover Sync is a React Router v7 application that syncs Spotify playlists to Apple Music. It features OAuth authentication, intelligent track matching, and real-time sync progress tracking.

## Environment Configuration

Create a `.env` file in your project root with the following variables:

```bash
# Spotify Configuration
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here

# Apple Music Configuration
APPLE_MUSIC_TEAM_ID=your_apple_team_id_here
APPLE_MUSIC_KEY_ID=your_apple_key_id_here
APPLE_MUSIC_PRIVATE_KEY=your_apple_private_key_here

# Database (Netlify provides this automatically)
NETLIFY_DATABASE_URL=your_neon_db_url_here

# App Configuration
VITE_APP_BASE_URL=http://localhost:5173
```

## Spotify Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add redirect URI: `http://localhost:8888/auth/spotify/callback` (for `netlify dev`) or `http://localhost:5173/auth/spotify/callback` (for `npm run dev`)
4. Copy your Client ID and Client Secret
5. **Important**: For Discover Weekly access, you may need to request extended quota from Spotify

## Apple Music Setup

1. Go to [Apple Developer Console](https://developer.apple.com/account)
2. Create a MusicKit identifier in Certificates, Identifiers & Profiles
3. Generate a private key (.p8 file) with MusicKit enabled
4. Note your Team ID (10 digits) and Key ID (10 digits)
5. Format your private key in the .env file:
   ```bash
   # Use actual newlines in your .env file, not \\n
   APPLE_MUSIC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
   YOUR_KEY_CONTENT_HERE
   -----END PRIVATE KEY-----"
   ```

## Database Setup

The app uses Netlify's Neon DB integration. The database tables will be created automatically on first run.

## Key Features Implemented

### ✅ Authentication System

- Spotify OAuth 2.0 with PKCE flow
- Apple Music JWT token generation and user authentication
- Secure token storage and refresh mechanisms

### ✅ Core Services

- **Spotify Service**: Playlist fetching with Discover Weekly fallback
- **Apple Music Service**: Playlist creation and track addition
- **Track Matching**: ISRC-based matching with metadata fallback
- **Sync Orchestration**: Complete sync workflow with progress tracking

### ✅ User Interface

- Landing page with feature overview
- Dashboard with authentication status
- Sync interface with playlist selection
- Real-time progress tracking
- Sync history with detailed statistics

### ✅ Error Handling & Optimization

- Retry mechanisms with exponential backoff
- Rate limiting for API requests
- Circuit breaker pattern for critical failures
- Comprehensive error logging and user feedback

### ✅ Database Schema

- User management with OAuth tokens
- Sync history tracking
- Individual track match records
- Automatic table initialization

## Development Commands

```bash
# RECOMMENDED: Start development server with Netlify Functions support
netlify dev

# Alternative: Start development server (Apple Music auth won't work)
npm run dev

# Build for production
npm run build

# Type checking
npm run typecheck

# Run tests
npm test
```

**Important**: Use `netlify dev` instead of `npm run dev` for local development to enable Netlify Functions support. This is required for Apple Music authentication to work properly.

## Deployment

The app is configured for Netlify deployment with:

- Server-side rendering enabled
- Netlify Functions for API endpoints
- Neon DB integration
- Automatic environment variable handling

## Architecture Highlights

### Security

- PKCE flow for client-side OAuth
- JWT tokens for Apple Music API
- HTTP-only cookies for session management
- No sensitive data in client-side code

### Performance

- Request queuing and rate limiting
- Batch processing for track operations
- Intelligent retry mechanisms
- Progress tracking with minimal UI updates

### Reliability

- Comprehensive error handling
- Graceful fallbacks for API failures
- Database transaction safety
- Detailed logging and monitoring

## Known Limitations

1. **Spotify Discover Weekly Access**: As of November 2024, Spotify restricts access to algorithmic playlists for new developer accounts
2. **Apple Music User Tokens**: Expire after ~6 months and require re-authentication
3. **Track Matching**: Not all tracks may be available on both platforms

## Troubleshooting

### Common Issues

1. **Token Expiration**: Users will be prompted to re-authenticate
2. **Rate Limiting**: Built-in retry mechanisms handle temporary limits
3. **Track Not Found**: The app gracefully handles unavailable tracks
4. **Database Connection**: Check NETLIFY_DATABASE_URL configuration

### Debugging

- All API errors are logged with context
- Sync progress includes detailed error messages
- Database operations include proper error handling

The application is production-ready with comprehensive error handling, security measures, and user-friendly interfaces.

https://accounts.spotify.com/authorize?scope=playlist-read-private+playlist-read-collaborative+user-read-private+user-read-email&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fspotify%2Fcallback&code_challenge_method=S256&state=WYACiyZX2jOygdzjqzHVq9jO2miYZ3gf&client_id=2ea12c5d429446f2a80454ebe26fd64a&code_challenge=BdjdDEePaftqP9CWb_bmUZNji4pnbqv-JvOG5uVS8PU&show_dialog=true&flow_ctx=a4977ff1-4f55-4ab4-b580-c41831856605%3A1756065367
