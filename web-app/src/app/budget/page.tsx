'use client';

import { useQuery } from '@tanstack/react-query';
import { DollarSign, Shield, Activity, AlertTriangle, RefreshCw, Users } from 'lucide-react';
import { coreApiV4, V4Budget } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="card flex items-start gap-3 p-4">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{label}</p>
        <p className="text-lg font-bold text-slate-100 leading-tight">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function BudgetPage() {
  const { data: budget, isLoading, isError, refetch } = useQuery<V4Budget>({
    queryKey: ['v4-budget'],
    queryFn: coreApiV4.budgetV4.get,
    refetchInterval: 30_000,
  });

  const hasPaused = (budget?.paused_agents?.length ?? 0) > 0;
  const hasIncidents = (budget?.total_incidents ?? 0) > 0;
  const isWarning = hasPaused || hasIncidents;

  return (
    <div className="min-h-screen pb-nav">
      <PageHeader
        title="Budget"
        subtitle="Carbon Core v4 spend governance"
        actions={
          <button onClick={() => refetch()} className="btn-secondary p-2.5">
            <RefreshCw className="w-4 h-4" />
          </button>
        }
      />

      <div className="px-4 py-4 space-y-5 page-enter">
        {/* Error state */}
        {isError && (
          <div className="bg-red-950/50 border border-red-800/50 rounded-2xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-300 font-medium">
              Cannot reach Carbon Core v4 — run: <code className="font-mono text-xs bg-red-900/50 px-1 rounded">node core/v4/api-server-v4.js</code>
            </p>
          </div>
        )}

        {/* Warning banner */}
        {!isLoading && !isError && isWarning && (
          <div className="bg-amber-950/50 border border-amber-800/50 rounded-2xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-300 font-medium">
              {hasPaused
                ? `${budget!.paused_agents.length} agent${budget!.paused_agents.length > 1 ? 's' : ''} paused — budget exceeded`
                : `${budget!.total_incidents} budget incident${budget!.total_incidents > 1 ? 's' : ''} recorded`}
            </p>
          </div>
        )}

        {/* Stats grid */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">
            Governance Overview
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card p-4">
                  <div className="skeleton h-3 w-20 rounded mb-2" />
                  <div className="skeleton h-5 w-16 rounded" />
                </div>
              ))
            ) : (
              <>
                <StatCard
                  icon={Shield}
                  label="Active Policies"
                  value={String(budget?.total_policies ?? 0)}
                  sub="spend limit rules"
                  color="bg-indigo-900/40 text-indigo-400"
                />
                <StatCard
                  icon={Users}
                  label="Paused Agents"
                  value={String(budget?.paused_agents?.length ?? 0)}
                  sub={hasPaused ? 'over budget limit' : 'all agents running'}
                  color={hasPaused ? 'bg-red-900/40 text-red-400' : 'bg-green-900/40 text-green-400'}
                />
                <StatCard
                  icon={Activity}
                  label="Total Incidents"
                  value={String(budget?.total_incidents ?? 0)}
                  sub="budget breaches logged"
                  color={hasIncidents ? 'bg-amber-900/40 text-amber-400' : 'bg-slate-800 text-slate-400'}
                />
                <StatCard
                  icon={DollarSign}
                  label="Spend Events"
                  value={String(budget?.recent_incidents?.length ?? 0)}
                  sub="recent incidents"
                  color="bg-slate-800 text-slate-400"
                />
              </>
            )}
          </div>
        </section>

        {/* Paused agents */}
        {!isLoading && hasPaused && (
          <section>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">
              Paused Agents
            </h2>
            <div className="card divide-y divide-slate-800/60">
              {budget!.paused_agents.map((agentId) => (
                <div key={agentId} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                    <span className="text-sm text-slate-300 font-mono">{agentId}</span>
                  </div>
                  <span className="text-xs text-red-400 font-medium">Paused</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent incidents */}
        {!isLoading && (budget?.recent_incidents?.length ?? 0) > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">
              Recent Incidents
            </h2>
            <div className="space-y-2">
              {budget!.recent_incidents.map((inc, i) => (
                <div key={i} className="card px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-slate-200 font-mono">{inc.agent_id}</span>
                    <span className="text-xs text-red-400 font-bold">${inc.current_spend.toFixed(4)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Limit: ${inc.limit_usd.toFixed(2)}</span>
                    {inc.reason && <span className="text-xs text-slate-600 truncate max-w-[140px]">{inc.reason}</span>}
                  </div>
                  {/* spend bar */}
                  <div className="mt-2 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full bg-red-500 transition-all"
                      style={{ width: `${Math.min((inc.current_spend / inc.limit_usd) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!isLoading && !isError && (budget?.total_policies ?? 0) === 0 && (
          <div className="card flex flex-col items-center justify-center py-10 text-center gap-3">
            <Shield className="w-8 h-8 text-slate-600" />
            <p className="text-sm text-slate-500">No budget policies configured</p>
            <p className="text-xs text-slate-600 max-w-[220px]">
              Create a policy via<br />
              <code className="font-mono text-indigo-400 text-[10px]">POST /api/v4/budget/policy</code>
            </p>
          </div>
        )}

        <p className="text-xs text-slate-600 text-center pb-2">
          Set BUDGET_DAILY_USD and BUDGET_MONTHLY_USD in .env
        </p>
      </div>
    </div>
  );
}
