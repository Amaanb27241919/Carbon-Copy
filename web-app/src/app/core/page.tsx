'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, DollarSign, Server, Shield, Cpu, Zap, GitBranch, Users } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';

const CORE_API = process.env.NEXT_PUBLIC_CORE_API_URL || '/app/core-api';

async function fetchCore(path: string) {
  const res = await fetch(`${CORE_API}${path}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function StatCard({ icon: Icon, label, value, sub, color = 'indigo' }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  const colors: Record<string, string> = {
    indigo: 'text-indigo-400 bg-indigo-900/40 border-indigo-700/40',
    green:  'text-green-400  bg-green-900/40  border-green-700/40',
    amber:  'text-amber-400  bg-amber-900/40  border-amber-700/40',
    red:    'text-red-400    bg-red-900/40    border-red-700/40',
    blue:   'text-blue-400   bg-blue-900/40   border-blue-700/40',
  };
  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center border', colors[color])}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xl font-bold text-slate-100">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
        {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls = s === 'healthy' ? 'bg-green-500' : s === 'degraded' ? 'bg-amber-500' : 'bg-red-500';
  return <span className={cn('w-2 h-2 rounded-full flex-shrink-0', cls)} />;
}

export default function CorePage() {
  const summary = useQuery({ queryKey: ['core-summary'], queryFn: () => fetchCore('/summary'), refetchInterval: 15000 });
  const health  = useQuery({ queryKey: ['core-health'],  queryFn: () => fetchCore('/health'),  refetchInterval: 30000 });
  const budget  = useQuery({ queryKey: ['core-budget'],  queryFn: () => fetchCore('/budget'),  refetchInterval: 30000 });
  const agents  = useQuery({ queryKey: ['core-agents'],  queryFn: () => fetchCore('/agents/expert'), staleTime: 300000 });
  const vms     = useQuery({ queryKey: ['core-vms'],     queryFn: () => fetchCore('/vms'),     refetchInterval: 30000 });
  const usage   = useQuery({ queryKey: ['core-usage'],   queryFn: () => fetchCore('/usage/window?days=7'), refetchInterval: 60000 });

  const s = summary.data;
  const h = health.data;
  const b = budget.data;
  const v = vms.data;
  const u = usage.data;

  return (
    <div className="min-h-screen pb-nav overflow-y-auto">
      <PageHeader
        title="Carbon Core"
        subtitle={s ? `v3.0 · ${s.health === 'healthy' ? 'All systems operational' : s.health}` : 'Loading...'}
      />

      <div className="px-4 py-4 space-y-6 page-enter">

        {/* Health Banner */}
        {health.isError && !h && (
          <div className="bg-red-950/50 border border-red-800/50 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0 animate-pulse" />
            <p className="text-sm text-red-300 font-medium">
              Carbon Core unreachable · Run: <code className="font-mono text-xs bg-red-900/50 px-1 py-0.5 rounded">node api-server-v2.js</code>
            </p>
          </div>
        )}
        {h && (
          <div className={cn(
            'rounded-2xl px-4 py-3 flex items-center gap-3 border',
            h.status === 'healthy'   ? 'bg-green-950/40 border-green-800/40' :
            h.status === 'degraded'  ? 'bg-amber-950/40 border-amber-800/40' :
                                       'bg-red-950/40   border-red-800/40'
          )}>
            <StatusDot status={h.status} />
            <p className={cn(
              'text-sm font-medium',
              h.status === 'healthy' ? 'text-green-300' :
              h.status === 'degraded' ? 'text-amber-300' : 'text-red-300'
            )}>
              System {h.status} · Uptime {Math.floor((h.uptime_seconds || 0) / 60)}m
            </p>
          </div>
        )}

        {/* Stats Grid */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">Overview</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Activity}   label="Total Runs"    value={s?.total_runs ?? 0}      color="indigo" />
            <StatCard icon={Zap}        label="Active Runs"   value={s?.active_runs ?? 0}     color="blue" />
            <StatCard icon={Shield}     label="Audit Events"  value={s?.activity_count ?? 0}  color="green" />
            <StatCard icon={DollarSign} label="Cost 7d"       value={`$${(u?.cost_usd ?? 0).toFixed(3)}`} sub={`${u?.turns ?? 0} turns`} color="amber" />
          </div>
        </section>

        {/* Subsystem Health */}
        {h?.subsystems?.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">Subsystems</h2>
            <div className="card divide-y divide-slate-800/60">
              {h.subsystems.map((sub: { name: string; status: string; message: string; latency_ms?: number }) => (
                <div key={sub.name} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <StatusDot status={sub.status} />
                    <span className="text-sm text-slate-300 capitalize">{sub.name.replace('_', ' ')}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 truncate max-w-[140px]">{sub.message}</p>
                    {sub.latency_ms != null && (
                      <p className="text-[10px] text-slate-600">{sub.latency_ms}ms</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Budget */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">Budget Governance</h2>
          {b ? (
            <div className="space-y-2">
              <div className="card p-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <DollarSign className="w-4 h-4 text-indigo-400" />
                  Active Policies
                </div>
                <span className="font-bold text-slate-100">{b.total_policies}</span>
              </div>
              <div className="card p-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Shield className="w-4 h-4 text-amber-400" />
                  Paused Agents
                </div>
                <span className={cn('font-bold', b.paused_agents?.length > 0 ? 'text-red-400' : 'text-green-400')}>
                  {b.paused_agents?.length ?? 0}
                </span>
              </div>
              <div className="card p-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Activity className="w-4 h-4 text-red-400" />
                  Budget Incidents
                </div>
                <span className="font-bold text-slate-100">{b.total_incidents}</span>
              </div>
            </div>
          ) : (
            <div className="card p-4 text-center text-xs text-slate-500">Loading budget...</div>
          )}
        </section>

        {/* VMs */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">Virtual Machines</h2>
          {v ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="card py-3 flex flex-col items-center gap-1">
                  <span className="text-xl font-bold text-slate-100">{v.total ?? 0}</span>
                  <span className="text-[10px] text-slate-500">Total VMs</span>
                </div>
                <div className="card py-3 flex flex-col items-center gap-1">
                  <span className="text-xl font-bold text-green-400">{v.running ?? 0}</span>
                  <span className="text-[10px] text-slate-500">Running</span>
                </div>
                <div className="card py-3 flex flex-col items-center gap-1">
                  <span className="text-xl font-bold text-slate-400">{v.stopped ?? 0}</span>
                  <span className="text-[10px] text-slate-500">Stopped</span>
                </div>
              </div>
              {!v.kvm_available && (
                <div className="card px-4 py-3 flex items-center gap-3 border border-amber-800/40 bg-amber-950/30">
                  <Server className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <p className="text-xs text-amber-300">KVM manager not running. Start Docker to enable VMs.</p>
                </div>
              )}
              {(v.vms || []).map((vm: { id: string; name: string; os: string; running: boolean; ram_mb: number; cpus: number }) => (
                <div key={vm.id} className="card flex items-center gap-3 px-4 py-3">
                  <div className={cn('w-2 h-2 rounded-full', vm.running ? 'bg-green-500' : 'bg-slate-600')} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{vm.name}</p>
                    <p className="text-xs text-slate-500">{vm.os} · {vm.cpus}vCPU · {vm.ram_mb}MB</p>
                  </div>
                  <span className={cn('text-xs font-medium', vm.running ? 'text-green-400' : 'text-slate-500')}>
                    {vm.running ? 'Running' : 'Stopped'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-4 text-center text-xs text-slate-500">Loading VMs...</div>
          )}
        </section>

        {/* Expert Agents */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">
            Expert Agents <span className="text-slate-600 normal-case">({agents.data?.length ?? 0})</span>
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {(agents.data || []).slice(0, 8).map((agent: { id: string; name: string; description: string }) => (
              <div key={agent.id} className="card px-3 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  <span className="text-xs font-semibold text-slate-200">{agent.name}</span>
                </div>
                <p className="text-[10px] text-slate-500 line-clamp-2">{agent.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* System Info */}
        {h?.system && (
          <section>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">System</h2>
            <div className="card divide-y divide-slate-800/60">
              {[
                { label: 'CPU', value: `${h.system.cpu_percent}%` },
                { label: 'Memory', value: `${h.system.memory_used_mb}MB / ${h.system.memory_total_mb}MB (${h.system.memory_percent}%)` },
                { label: 'Node', value: h.system.node_version },
                { label: 'Platform', value: h.system.platform },
                { label: 'Host', value: h.system.hostname },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-xs text-slate-500">{label}</span>
                  <span className="text-xs text-slate-300 font-mono">{value}</span>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
