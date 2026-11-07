import type { ApiError, Session } from '../../app/contracts.js';
import { api } from '../../app/api.js';
import { messageOf } from '../../app/helpers.js';
import posthog from '../../posthog.js';
import { useCallback, useEffect, useState } from 'react';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { setSession(await api<Session>('/api/auth/session')); }
    catch (cause) {
      if ((cause as ApiError).status === 401) posthog.reset();
      setSession(null);
      if ((cause as ApiError).status !== 401) setError(messageOf(cause, 'Could not verify your session.'));
    }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { session, setSession, loading, error, refresh };
}

