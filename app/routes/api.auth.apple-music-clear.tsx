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

    // Clear Apple Music token from database
    await Database.updateUser(userId, {
      apple_music_user_token: undefined,
      apple_music_expires_at: undefined
    });

    return Response.json({ success: true });

  } catch (error) {
    console.error('Failed to clear Apple Music token:', error);
    return Response.json({ 
      error: 'Failed to clear Apple Music connection',
      success: false 
    }, { status: 500 });
  }
}