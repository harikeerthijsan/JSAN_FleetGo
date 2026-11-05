import { useCallback, useEffect, useState } from 'react';
import { healthService } from '@/services/healthService';
import type { HealthCheck } from '@/types/api';

interface UseHealthState {
  data: HealthCheck | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches backend health (and DB connectivity) on mount, with a manual
 * refetch. Used by the Dashboard to visibly prove the frontend ↔ backend ↔
 * database wiring works end to end.
 */
export function useHealth(): UseHealthState {
  const [data, setData] = useState<HealthCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await healthService.getHealth();
      setData(result);
    } catch (err) {
      const message =
        (err as { message?: string })?.message ??
        'Unable to reach the FleetGo API.';
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: load };
}
