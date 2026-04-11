'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Target, Plus, CheckCircle, Clock, XCircle, Loader2, DollarSign, Zap } from 'lucide-react';
import { ariaApi, AriaMission } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { cn, timeAgo } from '@/lib/utils';

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-900/30 border-amber-700/40' },
  running: { label: 'Running', icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-900/30 border-blue-700/40' },
  completed: { label: 'Completed', icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-900/30 border-green-700/40' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-400', bg: 'bg-red-900/30 border-red-700/40' },
};

function MissionCard({ mission }: { mission: AriaMission }) {
  const cfg = STATUS_CONFIG[mission.status] || STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;

  return (
    <div className={cn('card border rounded-2xl p-4 space-y-3', cfg.bg)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-100 leading-snug flex-1">{mission.goal}</p>
        <span className={cn('flex items-center gap-1 text-xs font-semibold flex-shrink-0', cfg.color)}>
          <StatusIcon className={cn('w-3.5 h-3.5', mission.status === 'running' && 'animate-spin')} />
          {cfg.label}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <DollarSign className="w-3 h-3" />
          ${(mission.cost_usd || 0).toFixed(4)}
        </span>
        <span className="flex items-center gap-1">
          <Zap className="w-3 h-3" />
          {mission.tokens_used || 0} tokens
        </span>
        <span className="ml-auto">{timeAgo(mission.created_at)}</span>
      </div>

      {mission.status === 'completed' && mission.output && (
        <p className="text-xs text-slate-400 line-clamp-2">
          {(mission.output as Record<string, unknown>).summary as string || 'Research completed'}
        </p>
      )}
    </div>
  );
}

export default function MissionsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data: missions = [], isLoading, refetch } = useQuery<AriaMission[]>({
    queryKey: ['missions', statusFilter],
    queryFn: () => ariaApi.getMissions({ status: statusFilter || undefined, limit: 50 }),
    refetchInterval: 10_000,
  });

  const statuses = ['', 'pending', 'running', 'completed', 'failed'];

  return (
    <div className="min-h-screen pb-nav">
      <PageHeader
        title="Missions"
        subtitle={`${missions.length} missions`}
        actions={
          <Link href="/missions/new" className="btn-primary flex items-center gap-1.5 text-xs py-2 px-3">
            <Plus className="w-3.5 h-3.5" />
            New
          </Link>
        }
      />

      {/* Status filter tabs */}
      <div className="flex gap-1.5 mx-4 mt-4 overflow-x-auto pb-1 scrollbar-none">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150',
              statusFilter === s
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-300'
            )}
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 space-y-3 page-enter">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card space-y-3">
              <div className="skeleton h-4 w-3/4 rounded" />
              <div className="skeleton h-3 w-1/2 rounded" />
            </div>
          ))
        ) : missions.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-12 text-center gap-3">
            <Target className="w-10 h-10 text-slate-600" />
            <p className="text-sm text-slate-400 font-medium">No missions yet</p>
            <p className="text-xs text-slate-600">Submit a new mission to get started</p>
            <Link href="/missions/new" className="btn-primary text-xs mt-2 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              New Mission
            </Link>
          </div>
        ) : (
          missions.map(m => <MissionCard key={m.id} mission={m} />)
        )}
      </div>
    </div>
  );
}
