import type { ActionFunctionArgs } from 'react-router';
import { Database } from '~/lib/database';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Get user ID from cookie
    const cookies = request.headers.get('Cookie') || '';
    const userIdMatch = cookies.match(/user_id=([^;]+)/);
    
    if (!userIdMatch) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = userIdMatch[1];
    const body = await request.json();
    const { userToken } = body;

    if (!userToken) {
      return Response.json({ error: 'User token required' }, { status: 400 });
    }

    // Apple Music user tokens typically expire in ~6 months
    const expiresAt = new Date(Date.now() + (180 * 24 * 60 * 60 * 1000));

    // Update user with Apple Music token
    await Database.updateUser(userId, {
      apple_music_user_token: userToken,
      apple_music_expires_at: expiresAt
    });

    return Response.json({ success: true });

  } catch (error) {
    console.error('Failed to save Apple Music token:', error);
    return Response.json({ 
      error: 'Failed to save Apple Music connection',
      success: false 
    }, { status: 500 });
  }
}