import { useQuery } from '@tanstack/react-query';
import { type HealthResponse, healthResponseSchema } from '@waypoint/shared';
import { queryKeys } from '../../lib/query-keys.ts';

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health', { headers: { accept: 'application/json' } });
  // 200 and 503 share one body shape, so both are parsed rather than treated as errors.
  return healthResponseSchema.parse(await response.json());
}

export function useHealth() {
  return useQuery({ queryKey: queryKeys.health, queryFn: fetchHealth, retry: false });
}
