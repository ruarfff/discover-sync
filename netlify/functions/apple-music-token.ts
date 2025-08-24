import type { Context } from '@netlify/functions';
import { getAppleMusicAuth } from '../../app/lib/auth/apple-music';

export default async (req: Request, context: Context) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Generate Apple Music developer token
    const appleMusicAuth = getAppleMusicAuth();
    const developerToken = appleMusicAuth.getDeveloperToken();

    return new Response(JSON.stringify({
      developerToken,
      success: true
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('Apple Music token generation error:', error);
    
    return new Response(JSON.stringify({
      error: 'Failed to generate Apple Music token',
      success: false
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};