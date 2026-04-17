'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ServiceHealth } from '@/lib/api';

// Services to health-check.
// Carbon Core (/api/v2) works standalone. Docker services need full stack.
const SERVICES: Array<{ name: string; endpoint: string; noAuth?: boolean; direct?: string; dockerOnly?: boolean }> = [
  { name: 'Carbon Core',  endpoint: '/core-api/ping',      noAuth: true },
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
  // All calls go through Next.js proxy — works in both standalone and Docker mode
  const url = `http://localhost:3006/app${endpoint}`;
  try {
    const response = await axios.get(url, {
      timeout: 5000,
      validateStatus: () => true, // capture all HTTP responses for inspection
      headers: noAuth ? {} : { Authorization: `Bearer ${token}` },
    });

    const contentType = (response.headers['content-type'] as string) || '';
    const isHtml = contentType.includes('text/html');
    const isJson = contentType.includes('application/json');

    // Next.js is intercepting the request (serving its own 404 HTML page)
    // — the real service is not running behind the proxy
    if (isHtml) {
      return {
        name,
        url: endpoint,
        status: dockerOnly ? 'offline' : 'down',
        lastChecked: new Date(),
        responseTime: Date.now() - start,
        dockerOnly,
      };
    }

    // Carbon Core (/core-api/*): confirm the service replies with {"ok":true}
    if (!dockerOnly) {
      const body = response.data as Record<string, unknown>;
      const isUp = isJson && response.status >= 200 && response.status < 300 && body?.ok === true;
      return {
        name,
        url: endpoint,
        status: isUp ? 'up' : 'down',
        lastChecked: new Date(),
        responseTime: Date.now() - start,
        dockerOnly,
      };
    }

    // Docker-only services: JSON 2xx = up, anything else = offline
    const isUp = isJson && response.status >= 200 && response.status < 300;
    return {
      name,
      url: endpoint,
      status: isUp ? 'up' : 'offline',
      lastChecked: new Date(),
      responseTime: Date.now() - start,
      dockerOnly,
    };
  } catch {
    // Network-level failure (timeout, ECONNREFUSED, etc.)
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
