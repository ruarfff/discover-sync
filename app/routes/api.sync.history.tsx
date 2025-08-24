import type { LoaderFunctionArgs } from 'react-router';
import { SyncOrchestrator } from '~/lib/services/sync-orchestrator';

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Get user ID from cookie
    const cookies = request.headers.get('Cookie') || '';
    const userIdMatch = cookies.match(/user_id=([^;]+)/);
    
    if (!userIdMatch) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = userIdMatch[1];
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10');

    // Get sync history
    const orchestrator = new SyncOrchestrator(userId);
    const history = await orchestrator.getSyncHistory(limit);

    return Response.json({
      success: true,
      history
    });

  } catch (error) {
    console.error('Get sync history error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get sync history';
    
    return Response.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}