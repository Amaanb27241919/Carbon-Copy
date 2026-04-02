'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ServiceHealth } from '@/lib/api';

// Services to health-check (proxied through the gateway)
const SERVICES: Array<{ name: string; endpoint: string }> = [
  { name: 'Gateway', endpoint: '/health' },
  { name: 'Auth', endpoint: '/auth/health' },
  { name: 'Data Server', endpoint: '/data/health' },
  { name: 'VM Manager', endpoint: '/vm/health' },
  { name: 'OpenClaw', endpoint: '/openclaw/health' },
  { name: 'NemoClaw', endpoint: '/nemoclaw/health' },
  { name: 'Model Router', endpoint: '/model-router/health' },
  { name: 'Sandbox', endpoint: '/sandbox/health' },
];

async function checkService(
  name: string,
  endpoint: string,
  baseUrl: string
): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await axios.get(`${baseUrl}${endpoint}`, {
      timeout: 5000,
      headers: {
        Authorization: `Bearer ${
          typeof window !== 'undefined'
            ? JSON.parse(localStorage.getItem('carbon-auth') || '{}')?.state?.token || ''
            : ''
        }`,
      },
    });
    return {
      name,
      url: endpoint,
      status: 'up',
      lastChecked: new Date(),
      responseTime: Date.now() - start,
    };
  } catch {
    return {
      name,
      url: endpoint,
      status: 'down',
      lastChecked: new Date(),
      responseTime: Date.now() - start,
    };
  }
}

export function useServices() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api';

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery<ServiceHealth[]>({
    queryKey: ['services-health'],
    queryFn: async () => {
      const results = await Promise.allSettled(
        SERVICES.map((svc) => checkService(svc.name, svc.endpoint, baseUrl))
      );
      return results.map((result, i) => {
        if (result.status === 'fulfilled') return result.value;
        return {
          name: SERVICES[i].name,
          url: SERVICES[i].endpoint,
          status: 'unknown' as const,
          lastChecked: new Date(),
        };
      });
    },
    refetchInterval: 30_000, // Auto-refetch every 30s
    staleTime: 15_000,
    retry: 1,
  });

  const upCount = data?.filter((s) => s.status === 'up').length ?? 0;
  const downCount = data?.filter((s) => s.status === 'down').length ?? 0;

  return {
    services: data ?? [],
    isLoading,
    error,
    refetch,
    upCount,
    downCount,
    lastUpdated: dataUpdatedAt ? new Date(dataUpdatedAt) : null,
  };
}
