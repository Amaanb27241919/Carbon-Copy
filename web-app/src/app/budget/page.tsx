'use client';

import { useQuery } from '@tanstack/react-query';
import { DollarSign, Zap, Target, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import { ariaApi, AriaBudget } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const capped = Math.min(pct, 100);
  const isOver = pct >= 90;
  return (
    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
      <div
        className={cn('h-2 rounded-full transition-all duration-500', isOver ? 'bg-red-500' : color)}
        style={{ width: `${capped}%` }}
      />
    </div>
  );
}

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
  const { data: budget, isLoading, refetch } = useQuery<AriaBudget>({
    queryKey: ['aria-budget'],
    queryFn: ariaApi.getBudget,
    refetchInterval: 30_000,
  });

  const dailyPct = budget?.utilization.dailyPct ?? 0;
  const monthlyPct = budget?.utilization.monthlyPct ?? 0;
  const isWarning = dailyPct >= 80 || monthlyPct >= 80;

  return (
    <div className="min-h-screen pb-nav">
      <PageHeader
        title="Budget"
        subtitle="ARIA intelligence spend tracking"
        actions={
          <button onClick={() => refetch()} className="btn-secondary p-2.5">
            <RefreshCw className="w-4 h-4" />
          </button>
        }
      />

      <div className="px-4 py-4 space-y-5 page-enter">
        {/* Warning banner */}
        {!isLoading && isWarning && (
          <div className="bg-amber-950/50 border border-amber-800/50 rounded-2xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-300 font-medium">
              Approaching budget limit — {Math.max(dailyPct, monthlyPct)}% utilization
            </p>
          </div>
        )}

        {/* Daily utilization */}
        <section className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Today</h2>
            {isLoading ? (
              <div className="skeleton h-3 w-16 rounded" />
            ) : (
              <span className={cn('text-xs font-bold', dailyPct >= 90 ? 'text-red-400' : 'text-slate-400')}>
                {dailyPct}% of ${budget?.limits.dailyUSD}
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="skeleton h-2 w-full rounded-full" />
          ) : (
            <ProgressBar pct={dailyPct} color="bg-indigo-500" />
          )}
        </section>

        {/* Monthly utilization */}
        <section className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">This Month</h2>
            {isLoading ? (
              <div className="skeleton h-3 w-16 rounded" />
            ) : (
              <span className={cn('text-xs font-bold', monthlyPct >= 90 ? 'text-red-400' : 'text-slate-400')}>
                {monthlyPct}% of ${budget?.limits.monthlyUSD}
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="skeleton h-2 w-full rounded-full" />
          ) : (
            <ProgressBar pct={monthlyPct} color="bg-violet-500" />
          )}
        </section>

        {/* Stats grid */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">
            Today
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card p-4">
                  <div className="skeleton h-3 w-20 rounded mb-2" />
                  <div className="skeleton h-5 w-16 rounded" />
                </div>
              ))
            ) : (
              <>
                <StatCard
                  icon={DollarSign}
                  label="Cost"
                  value={`$${(budget?.today.costUSD ?? 0).toFixed(4)}`}
                  sub="USD spent today"
                  color="bg-green-900/40 text-green-400"
                />
                <StatCard
                  icon={Zap}
                  label="Tokens"
                  value={(budget?.today.tokensUsed ?? 0).toLocaleString()}
                  sub="tokens used today"
                  color="bg-amber-900/40 text-amber-400"
                />
                <StatCard
                  icon={Target}
                  label="Missions"
                  value={String(budget?.today.missionsRun ?? 0)}
                  sub="missions today"
                  color="bg-indigo-900/40 text-indigo-400"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Daily Limit"
                  value={`$${budget?.limits.dailyUSD ?? 0}`}
                  sub="configure in .env"
                  color="bg-slate-800 text-slate-400"
                />
              </>
            )}
          </div>
        </section>

        {/* Monthly summary */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">
            This Month
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card flex flex-col items-center py-4 gap-1">
                  <div className="skeleton h-5 w-12 rounded" />
                  <div className="skeleton h-3 w-16 rounded" />
                </div>
              ))
            ) : (
              <>
                <div className="card flex flex-col items-center justify-center py-4 text-center gap-0.5">
                  <DollarSign className="w-4 h-4 text-green-400 mb-1" />
                  <span className="text-base font-bold text-slate-100">
                    ${(budget?.month.costUSD ?? 0).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-500">Cost</span>
                </div>
                <div className="card flex flex-col items-center justify-center py-4 text-center gap-0.5">
                  <Zap className="w-4 h-4 text-amber-400 mb-1" />
                  <span className="text-base font-bold text-slate-100">
                    {((budget?.month.tokensUsed ?? 0) / 1000).toFixed(1)}k
                  </span>
                  <span className="text-[10px] text-slate-500">Tokens</span>
                </div>
                <div className="card flex flex-col items-center justify-center py-4 text-center gap-0.5">
                  <Target className="w-4 h-4 text-indigo-400 mb-1" />
                  <span className="text-base font-bold text-slate-100">
                    {budget?.month.missionsRun ?? 0}
                  </span>
                  <span className="text-[10px] text-slate-500">Missions</span>
                </div>
              </>
            )}
          </div>
        </section>

        <p className="text-xs text-slate-600 text-center pb-2">
          Limits: ${budget?.limits.dailyUSD ?? '—'}/day · ${budget?.limits.monthlyUSD ?? '—'}/month
          <br />Set BUDGET_DAILY_USD and BUDGET_MONTHLY_USD in .env
        </p>
      </div>
    </div>
  );
}
