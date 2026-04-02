'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Play,
  Square,
  RotateCcw,
  Plus,
  Box,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { vmApi, Container } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { cn, getContainerStateColor, timeAgo } from '@/lib/utils';
import { toast } from '@/components/Toast';

function StateBadge({ state }: { state: Container['state'] }) {
  const colors = {
    running: 'bg-green-900/50 text-green-400 border-green-800/50',
    stopped: 'bg-slate-700/50 text-slate-400 border-slate-600/50',
    paused: 'bg-amber-900/50 text-amber-400 border-amber-800/50',
    restarting: 'bg-blue-900/50 text-blue-400 border-blue-800/50',
    exited: 'bg-red-900/50 text-red-400 border-red-800/50',
  };

  return (
    <span
      className={cn(
        'badge border capitalize',
        colors[state] ?? 'bg-slate-700/50 text-slate-400 border-slate-600/50'
      )}
    >
      {state}
    </span>
  );
}

function ContainerCard({ container }: { container: Container }) {
  const queryClient = useQueryClient();

  const startMutation = useMutation({
    mutationFn: () => vmApi.startContainer(container.name),
    onSuccess: () => {
      toast('success', `${container.name} started`);
      queryClient.invalidateQueries({ queryKey: ['containers'] });
    },
    onError: () => toast('error', `Failed to start ${container.name}`),
  });

  const stopMutation = useMutation({
    mutationFn: () => vmApi.stopContainer(container.name),
    onSuccess: () => {
      toast('success', `${container.name} stopped`);
      queryClient.invalidateQueries({ queryKey: ['containers'] });
    },
    onError: () => toast('error', `Failed to stop ${container.name}`),
  });

  const restartMutation = useMutation({
    mutationFn: () => vmApi.restartContainer(container.name),
    onSuccess: () => {
      toast('success', `${container.name} restarting...`);
      queryClient.invalidateQueries({ queryKey: ['containers'] });
    },
    onError: () => toast('error', `Failed to restart ${container.name}`),
  });

  const isBusy =
    startMutation.isPending || stopMutation.isPending || restartMutation.isPending;
  const isRunning = container.state === 'running';

  return (
    <div className="card space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 bg-slate-700/60 border border-slate-600/40 rounded-lg flex items-center justify-center flex-shrink-0">
            <Box className="w-4 h-4 text-slate-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">
              {container.name}
            </p>
            <p className="text-xs text-slate-500 truncate">{container.image}</p>
          </div>
        </div>
        <StateBadge state={container.state} />
      </div>

      {/* Ports & meta */}
      {container.ports.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {container.ports.map((port) => (
            <span key={port} className="badge bg-slate-700/40 text-slate-400 border border-slate-700/40 font-mono text-[10px]">
              {port}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 text-xs text-slate-600">
        <span>Created {timeAgo(container.created)}</span>
        {container.cpu && (
          <>
            <span className="text-slate-700">·</span>
            <span className={getContainerStateColor(container.state)}>
              CPU {container.cpu}
            </span>
          </>
        )}
        {container.memory && (
          <>
            <span className="text-slate-700">·</span>
            <span className="text-slate-500">{container.memory}</span>
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-1 border-t border-slate-700/40">
        {!isRunning ? (
          <button
            onClick={() => startMutation.mutate()}
            disabled={isBusy}
            className="flex-1 btn-secondary text-green-400 hover:text-green-300 flex items-center justify-center gap-1.5 text-xs py-2"
          >
            {startMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            Start
          </button>
        ) : (
          <button
            onClick={() => stopMutation.mutate()}
            disabled={isBusy}
            className="flex-1 btn-secondary text-red-400 hover:text-red-300 flex items-center justify-center gap-1.5 text-xs py-2"
          >
            {stopMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            Stop
          </button>
        )}
        <button
          onClick={() => restartMutation.mutate()}
          disabled={isBusy || container.state === 'exited'}
          className="btn-secondary flex items-center justify-center gap-1.5 text-xs py-2 px-3"
          aria-label="Restart container"
        >
          {restartMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RotateCcw className="w-3.5 h-3.5" />
          )}
          Restart
        </button>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped'>('all');

  const {
    data: containers = [],
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery<Container[]>({
    queryKey: ['containers'],
    queryFn: vmApi.listContainers,
    refetchInterval: 15_000,
  });

  const filtered = containers.filter((c) => {
    if (filter === 'running') return c.state === 'running';
    if (filter === 'stopped') return c.state !== 'running';
    return true;
  });

  const runningCount = containers.filter((c) => c.state === 'running').length;

  return (
    <div className="min-h-screen pb-nav">
      <PageHeader
        title="Projects"
        subtitle={`${runningCount} running · ${containers.length} total`}
        actions={
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-secondary p-2.5 min-touch"
            aria-label="Refresh"
          >
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
          </button>
        }
      />

      <div className="px-4 py-4 space-y-4 page-enter">
        {/* Filter tabs */}
        <div className="flex gap-2 bg-slate-800/60 rounded-xl p-1">
          {(['all', 'running', 'stopped'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'flex-1 py-2 px-3 rounded-lg text-xs font-semibold capitalize transition-all duration-150',
                filter === f
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-300'
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Container list */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card space-y-3">
                <div className="flex items-center gap-3">
                  <div className="skeleton w-8 h-8 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-4 w-32 rounded" />
                    <div className="skeleton h-3 w-48 rounded" />
                  </div>
                  <div className="skeleton h-5 w-16 rounded" />
                </div>
                <div className="skeleton h-8 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="card flex flex-col items-center justify-center py-12 text-center gap-3">
            <Box className="w-10 h-10 text-slate-600" />
            <p className="text-sm text-slate-400 font-medium">Failed to load containers</p>
            <p className="text-xs text-slate-600">Check that vm-manager is running</p>
            <button onClick={() => refetch()} className="btn-secondary text-xs mt-2">
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-12 text-center gap-3">
            <Box className="w-10 h-10 text-slate-600" />
            <p className="text-sm text-slate-400 font-medium">
              {filter === 'all' ? 'No containers found' : `No ${filter} containers`}
            </p>
            <p className="text-xs text-slate-600">
              Add a project to get started
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((container) => (
              <ContainerCard key={container.id} container={container} />
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => router.push('/projects/new')}
        className={cn(
          'fixed right-5 z-40 w-14 h-14',
          'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700',
          'rounded-full shadow-[0_4px_24px_rgba(99,102,241,0.5)]',
          'flex items-center justify-center',
          'transition-all duration-150',
          'touch-manipulation'
        )}
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
        }}
        aria-label="Add new project"
      >
        <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
      </button>
    </div>
  );
}
