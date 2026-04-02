'use client';

import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Database, Cpu, HardDrive, Activity } from 'lucide-react';
import { useServices } from '@/hooks/useServices';
import { ServiceCard, ServiceCardSkeleton } from '@/components/ServiceCard';
import { PageHeader } from '@/components/PageHeader';
import { api, StorageStats } from '@/lib/api';
import { cn, formatBytes, timeAgo } from '@/lib/utils';

interface SystemStats {
  totalOutputs: number;
  storageUsed: number;
  storageTotal: number;
  activeContainers: number;
}

interface RecentOutput {
  id: string;
  model: string;
  prompt: string;
  createdAt: string;
  provider: string;
}

function useSystemStats() {
  return useQuery<SystemStats>({
    queryKey: ['system-stats'],
    queryFn: async () => {
      try {
        const [statsRes, containersRes] = await Promise.allSettled([
          api.get<StorageStats>('/data/stats'),
          api.get<unknown[]>('/vm/containers'),
        ]);

        const stats = statsRes.status === 'fulfilled' ? statsRes.value.data : null;
        const containers =
          containersRes.status === 'fulfilled' ? containersRes.value.data : [];

        return {
          totalOutputs: (stats as { objects?: number })?.objects ?? 0,
          storageUsed: (stats as { used?: number })?.used ?? 0,
          storageTotal: (stats as { total?: number })?.total ?? 0,
          activeContainers: Array.isArray(containers)
            ? containers.filter((c: unknown) => {
                const container = c as { state?: string };
                return container.state === 'running';
              }).length
            : 0,
        };
      } catch {
        return {
          totalOutputs: 0,
          storageUsed: 0,
          storageTotal: 0,
          activeContainers: 0,
        };
      }
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

function useRecentOutputs() {
  return useQuery<RecentOutput[]>({
    queryKey: ['recent-outputs'],
    queryFn: async () => {
      try {
        const { data } = await api.get<RecentOutput[]>('/data/outputs', {
          params: { limit: 5 },
        });
        return data;
      } catch {
        return [];
      }
    },
    refetchInterval: 60_000,
  });
}

export default function DashboardPage() {
  const { services, isLoading: servicesLoading, refetch, upCount, downCount } = useServices();
  const { data: stats, isLoading: statsLoading } = useSystemStats();
  const { data: recentOutputs = [], isLoading: outputsLoading } = useRecentOutputs();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef<number>(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 600);
  }, [refetch]);

  // Pull-to-refresh handlers
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const scrollTop = contentRef.current?.scrollTop ?? 0;
    if (scrollTop > 0) return;
    const dist = Math.max(0, e.touches[0].clientY - touchStartY.current);
    setPullDistance(Math.min(dist * 0.4, 60));
  };

  const onTouchEnd = () => {
    if (pullDistance >= 50) {
      handleRefresh();
    }
    setPullDistance(0);
  };

  const totalServices = services.length;

  return (
    <div
      ref={contentRef}
      className="min-h-screen pb-nav overflow-y-auto"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {pullDistance > 0 && (
        <div
          className="flex items-center justify-center text-slate-500 text-xs gap-2 transition-all overflow-hidden"
          style={{ height: `${pullDistance}px` }}
        >
          <RefreshCw
            className={cn('w-4 h-4', pullDistance >= 50 && 'text-indigo-400')}
            style={{ transform: `rotate(${pullDistance * 6}deg)` }}
          />
          <span>{pullDistance >= 50 ? 'Release to refresh' : 'Pull to refresh'}</span>
        </div>
      )}

      <PageHeader
        title="Carbon Cloud"
        subtitle={
          servicesLoading
            ? 'Checking services...'
            : `${upCount}/${totalServices} services operational`
        }
        actions={
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn-secondary p-2.5 min-touch"
            aria-label="Refresh dashboard"
          >
            <RefreshCw
              className={cn('w-4 h-4', isRefreshing && 'animate-spin')}
            />
          </button>
        }
      />

      <div className="px-4 py-4 space-y-6 page-enter">

        {/* Status summary banner */}
        {!servicesLoading && downCount > 0 && (
          <div className="bg-red-950/50 border border-red-800/50 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0 animate-pulse" />
            <p className="text-sm text-red-300 font-medium">
              {downCount} service{downCount > 1 ? 's are' : ' is'} unreachable
            </p>
          </div>
        )}

        {!servicesLoading && downCount === 0 && totalServices > 0 && (
          <div className="bg-green-950/40 border border-green-800/40 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
            <p className="text-sm text-green-300 font-medium">All systems operational</p>
          </div>
        )}

        {/* Service Health Grid */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">
            Service Health
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {servicesLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <ServiceCardSkeleton key={i} />
                ))
              : services.map((svc) => (
                  <ServiceCard key={svc.name} service={svc} />
                ))}
          </div>
        </section>

        {/* System Stats */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">
            System Stats
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {/* Outputs */}
            <div className="card flex flex-col items-center justify-center gap-1 py-4 text-center">
              <Activity className="w-5 h-5 text-indigo-400 mb-1" />
              {statsLoading ? (
                <div className="skeleton h-5 w-12 rounded mx-auto" />
              ) : (
                <span className="text-lg font-bold text-slate-100">
                  {stats?.totalOutputs ?? 0}
                </span>
              )}
              <span className="text-[10px] text-slate-500">Outputs</span>
            </div>

            {/* Storage */}
            <div className="card flex flex-col items-center justify-center gap-1 py-4 text-center">
              <HardDrive className="w-5 h-5 text-amber-400 mb-1" />
              {statsLoading ? (
                <div className="skeleton h-5 w-12 rounded mx-auto" />
              ) : (
                <span className="text-lg font-bold text-slate-100">
                  {stats?.storageUsed ? formatBytes(stats.storageUsed) : '0 B'}
                </span>
              )}
              <span className="text-[10px] text-slate-500">Storage</span>
            </div>

            {/* Containers */}
            <div className="card flex flex-col items-center justify-center gap-1 py-4 text-center">
              <Cpu className="w-5 h-5 text-green-400 mb-1" />
              {statsLoading ? (
                <div className="skeleton h-5 w-12 rounded mx-auto" />
              ) : (
                <span className="text-lg font-bold text-slate-100">
                  {stats?.activeContainers ?? 0}
                </span>
              )}
              <span className="text-[10px] text-slate-500">Containers</span>
            </div>
          </div>
        </section>

        {/* Recent Activity */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">
            Recent Activity
          </h2>
          <div className="space-y-2">
            {outputsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card flex items-center gap-3">
                  <div className="skeleton w-8 h-8 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3 w-24 rounded" />
                    <div className="skeleton h-3 w-36 rounded" />
                  </div>
                </div>
              ))
            ) : recentOutputs.length === 0 ? (
              <div className="card flex flex-col items-center justify-center py-8 text-center gap-2">
                <Database className="w-8 h-8 text-slate-600" />
                <p className="text-sm text-slate-500">No recent activity</p>
                <p className="text-xs text-slate-600">Model outputs will appear here</p>
              </div>
            ) : (
              recentOutputs.map((output) => (
                <div
                  key={output.id}
                  className="card flex items-start gap-3 py-3"
                >
                  <div className="w-8 h-8 bg-indigo-900/50 border border-indigo-700/40 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Activity className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-slate-300 truncate">
                        {output.model}
                      </span>
                      <span className="badge bg-slate-700/60 text-slate-400">
                        {output.provider}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{output.prompt}</p>
                  </div>
                  <span className="text-[10px] text-slate-600 flex-shrink-0 pt-0.5">
                    {timeAgo(output.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
