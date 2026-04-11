'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, AlertCircle, CheckCircle, Loader2, Clock, Cpu } from 'lucide-react';
import { ariaApi, AriaAgent } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';

const ROLE_DESCRIPTIONS: Record<string, string> = {
  scanner: 'Routes and prioritizes incoming mission requests',
  researcher: 'Executes deep research using AI models',
  synthesizer: 'Formats and structures research output',
  deliverer: 'Dispatches results via email, Slack, or PDF',
  client_mgr: 'Manages client preferences and mission history',
};

const STATUS_CONFIG = {
  idle: { icon: CheckCircle, color: 'text-green-400', label: 'Idle' },
  planning: { icon: Clock, color: 'text-amber-400', label: 'Planning' },
  executing: { icon: Loader2, color: 'text-blue-400', label: 'Executing', spin: true },
  outputting: { icon: Activity, color: 'text-indigo-400', label: 'Outputting' },
  delivered: { icon: CheckCircle, color: 'text-emerald-400', label: 'Delivered' },
  error: { icon: AlertCircle, color: 'text-red-400', label: 'Error' },
};

function AgentCard({ agent }: { agent: AriaAgent }) {
  const cfg = STATUS_CONFIG[agent.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.idle;
  const StatusIcon = cfg.icon;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold text-slate-100">{agent.name}</span>
          </div>
          <p className="text-xs text-slate-500">{ROLE_DESCRIPTIONS[agent.role] || agent.role}</p>
        </div>
        <span className={cn('flex items-center gap-1 text-xs font-semibold flex-shrink-0', cfg.color)}>
          <StatusIcon className={cn('w-3.5 h-3.5', (cfg as { spin?: boolean }).spin && 'animate-spin')} />
          {cfg.label}
        </span>
      </div>

      {agent.currentTask && (
        <div className="bg-slate-800/60 rounded-lg px-3 py-2">
          <p className="text-xs text-slate-400 font-mono">{agent.currentTask}</p>
        </div>
      )}

      <div className="flex gap-4 text-xs text-slate-500">
        <span>{agent.tokensUsedToday.toLocaleString()} tokens today</span>
        <span>${agent.costToday.toFixed(4)} today</span>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const { data: agents = [], isLoading, refetch } = useQuery<AriaAgent[]>({
    queryKey: ['agents'],
    queryFn: ariaApi.getAgents,
    refetchInterval: 5_000,
  });

  const activeCount = agents.filter(a => a.status !== 'idle').length;

  return (
    <div className="min-h-screen pb-nav">
      <PageHeader
        title="Agents"
        subtitle={activeCount > 0 ? `${activeCount} agent${activeCount > 1 ? 's' : ''} active` : 'All agents idle'}
        actions={
          <button onClick={() => refetch()} className="btn-secondary p-2.5">
            <Activity className="w-4 h-4" />
          </button>
        }
      />

      <div className="px-4 py-4 space-y-3 page-enter">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card space-y-3">
              <div className="flex items-center gap-2">
                <div className="skeleton w-4 h-4 rounded" />
                <div className="skeleton h-4 w-28 rounded" />
              </div>
              <div className="skeleton h-3 w-48 rounded" />
              <div className="skeleton h-3 w-36 rounded" />
            </div>
          ))
        ) : (
          agents.map(agent => <AgentCard key={agent.id} agent={agent} />)
        )}
      </div>
    </div>
  );
}
