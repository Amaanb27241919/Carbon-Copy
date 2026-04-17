'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ServiceHealth } from '@/lib/api';

// Services to health-check.
// Carbon Core (/api/v2) works standalone. Docker services need full stack.
const SERVICES: Array<{ name: string; endpoint: string; noAuth?: boolean; direct?: string; dockerOnly?: boolean }> = [
  { name: 'Carbon Core',  endpoint: '/api/v2/ping',        noAuth: true, direct: 'http://localhost:3001/api/v2/ping' },
  { name: 'Gateway',      endpoint: '/health',             noAuth: true, dockerOnly: true },
  { name: 'Auth',         endpoint: '/auth/health',        noAuth: true, dockerOnly: true },
  { name: 'Model Router', endpoint: '/api/models',         noAuth: true, dockerOnly: true },
  { name: 'ARIA',         endpoint: '/api/aria/health',    noAuth: true, dockerOnly: true },
  { name: 'VM Manager',   endpoint: '/api/vm/health',      dockerOnly: true },
  { name: 'Data Server',  endpoint: '/api/data/health',    dockerOnly: true },
  { name: 'Sandbox',      endpoint: '/api/sandbox/health', dockerOnly: true },
];

async function checkService(
  name: string,
  endpoint: string,
  noAuth?: boolean,
  direct?: string,
  dockerOnly?: boolean
): Promise<ServiceHealth> {
  const start = Date.now();
  const token = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('carbon-auth') || '{}')?.state?.token || ''
    : '';
  // Try direct URL first (for standalone mode), fall back to gateway
  const url = direct || `http://localhost${endpoint}`;
  try {
    await axios.get(url, {
      timeout: 5000,
      validateStatus: () => true, // any HTTP response = service is reachable
      headers: noAuth ? {} : { Authorization: `Bearer ${token}` },
    });
    return {
      name,
      url: endpoint,
      status: 'up',
      lastChecked: new Date(),
      responseTime: Date.now() - start,
      dockerOnly,
    };
  } catch {
    // Docker-only services that fail are expected when Docker is not running
    return {
      name,
      url: endpoint,
      status: dockerOnly ? 'offline' : 'down',
      lastChecked: new Date(),
      responseTime: Date.now() - start,
      dockerOnly,
    };
  }
}

export function useServices() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api';

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery<ServiceHealth[]>({
    queryKey: ['services-health'],
    queryFn: async () => {
      const results = await Promise.allSettled(
        SERVICES.map((svc) => checkService(svc.name, svc.endpoint, svc.noAuth, svc.direct, svc.dockerOnly))
      );
      return results.map((result, i) => {
        if (result.status === 'fulfilled') return result.value;
        return {
          name: SERVICES[i].name,
          url: SERVICES[i].endpoint,
          status: 'unknown' as const,
          lastChecked: new Date(),
          dockerOnly: SERVICES[i].dockerOnly,
        };
      });
    },
    refetchInterval: 30_000, // Auto-refetch every 30s
    staleTime: 15_000,
    retry: 1,
  });

  const upCount = data?.filter((s) => s.status === 'up').length ?? 0;
  // Only count non-dockerOnly failures as truly "down"
  const downCount = data?.filter((s) => s.status === 'down').length ?? 0;
  // Docker-only services that are offline (expected without Docker)
  const dockerOfflineCount = data?.filter((s) => s.status === 'offline').length ?? 0;

  return {
    services: data ?? [],
    isLoading,
    error,
    refetch,
    upCount,
    downCount,
    dockerOfflineCount,
    lastUpdated: dataUpdatedAt ? new Date(dataUpdatedAt) : null,
  };
}
