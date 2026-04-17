'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle, Loader2, X, Star, Clock } from 'lucide-react';
import { coreApi, ExpertAgent, PipelineAgent, ActiveRun } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';

const FEATURED_IDS = new Set(['executor', 'verifier', 'planner', 'debugger', 'architect']);

// ── Pipeline Agent Card ──────────────────────────────────────────────────────

function PipelineCard({ agent }: { agent: PipelineAgent }) {
  const isRunning = agent.status === 'running';
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-100">{agent.name}</p>
          <p className="text-xs text-slate-500">{agent.role}</p>
        </div>
        <span className={cn('flex items-center gap-1.5 text-xs font-medium flex-shrink-0',
          isRunning ? 'text-blue-400' : 'text-green-400')}>
          <span className={cn('w-2 h-2 rounded-full',
            isRunning ? 'bg-blue-400 animate-pulse' : 'bg-green-400')} />
          {isRunning ? 'Running' : 'Idle'}
        </span>
      </div>
      <p className="text-xs text-slate-400">{agent.description}</p>
    </div>
  );
}

// ── Expert Agent Card ────────────────────────────────────────────────────────

function ExpertCard({ agent, onClick }: { agent: ExpertAgent; onClick: () => void }) {
  const isFeatured = FEATURED_IDS.has(agent.id);
  const firstLine = (agent.description || agent.system_prompt || '').split('\n')[0].slice(0, 80);

  return (
    <button
      onClick={onClick}
      className="card p-4 text-left space-y-1.5 hover:border-indigo-500/50 transition-colors w-full"
    >
      <div className="flex items-center gap-2">
        {isFeatured && <Star className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
        <span className="text-sm font-semibold text-slate-100 truncate">{agent.name || agent.id}</span>
        {isFeatured && (
          <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-400 font-medium flex-shrink-0">
            Featured
          </span>
        )}
      </div>
      {firstLine && (
        <p className="text-xs text-slate-400 line-clamp-2">{firstLine}</p>
      )}
    </button>
  );
}

// ── Expert Agent Modal ───────────────────────────────────────────────────────

function ExpertModal({ agent, onClose }: { agent: ExpertAgent; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
          <div>
            <p className="text-sm font-semibold text-slate-100">{agent.name || agent.id}</p>
            {FEATURED_IDS.has(agent.id) && (
              <span className="text-xs text-amber-400 font-medium">Featured</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {agent.description && (
            <p className="text-sm text-slate-300 mb-3">{agent.description}</p>
          )}
          {agent.system_prompt && (
            <div className="bg-slate-800/60 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wide">System Prompt</p>
              <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                {agent.system_prompt}
              </pre>
            </div>
          )}
          {agent.tags && agent.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {agent.tags.map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Active Run Row ────────────────────────────────────────────────────────────

function ActiveRunRow({ run }: { run: ActiveRun }) {
  const elapsed = run.started_at
    ? Math.floor((Date.now() - new Date(run.started_at).getTime()) / 1000)
    : 0;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div className="card p-3 flex items-center gap-3">
      <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{run.agent_id}</p>
        {run.prompt_preview && (
          <p className="text-xs text-slate-500 truncate">{run.prompt_preview}</p>
        )}
      </div>
      <div className="flex items-center gap-1 text-xs text-slate-500 flex-shrink-0">
        <Clock className="w-3 h-3" />
        {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [selectedAgent, setSelectedAgent] = useState<ExpertAgent | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['agents-combined'],
    queryFn: coreApi.getAgents,
    refetchInterval: 8_000,
  });

  const expertAgents = data?.expert_agents ?? [];
  const pipelineAgents = data?.pipeline_agents ?? [];
  const activeRuns = data?.active_runs ?? [];
  const stats = data?.stats;

  const subtitleParts: string[] = [];
  if (stats) {
    subtitleParts.push(`${expertAgents.length} expert agents`);
    if (stats.active > 0) subtitleParts.push(`${stats.active} running`);
  }

  return (
    <div className="min-h-screen pb-nav">
      <PageHeader
        title="Agents"
        subtitle={subtitleParts.length > 0 ? subtitleParts.join(' · ') : 'Carbon Core agent registry'}
        actions={
          <button onClick={() => refetch()} className="btn-secondary p-2.5">
            <Activity className="w-4 h-4" />
          </button>
        }
      />

      <div className="px-4 py-4 space-y-6 page-enter">

        {/* Active Runs */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Active Runs</h2>
          {isLoading ? (
            <div className="card p-3 flex items-center gap-2">
              <div className="skeleton w-4 h-4 rounded" />
              <div className="skeleton h-3 w-40 rounded" />
            </div>
          ) : activeRuns.length > 0 ? (
            <div className="space-y-2">
              {activeRuns.map(run => <ActiveRunRow key={run.id} run={run} />)}
            </div>
          ) : (
            <div className="card p-3 flex items-center gap-2 text-slate-500">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-sm">No active runs</span>
            </div>
          )}
        </section>

        {/* Pipeline Agents */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Pipeline Agents</h2>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="card p-4 space-y-2">
                  <div className="skeleton h-4 w-24 rounded" />
                  <div className="skeleton h-3 w-40 rounded" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="card p-4 text-sm text-slate-500">
              ARIA pipeline requires Docker
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {pipelineAgents.map(agent => (
                <PipelineCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </section>

        {/* Expert Agents */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Expert Agents
            {expertAgents.length > 0 && (
              <span className="ml-2 text-indigo-400 normal-case font-normal">{expertAgents.length} loaded</span>
            )}
          </h2>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card p-4 space-y-1.5">
                  <div className="skeleton h-4 w-24 rounded" />
                  <div className="skeleton h-3 w-32 rounded" />
                </div>
              ))}
            </div>
          ) : expertAgents.length === 0 ? (
            <div className="card p-4 text-sm text-slate-500">No expert agents found</div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {expertAgents.map(agent => (
                <ExpertCard
                  key={agent.id}
                  agent={agent}
                  onClick={() => setSelectedAgent(agent)}
                />
              ))}
            </div>
          )}
        </section>

      </div>

      {selectedAgent && (
        <ExpertModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}
    </div>
  );
}
