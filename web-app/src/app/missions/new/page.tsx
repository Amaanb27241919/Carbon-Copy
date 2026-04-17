'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Send, Loader2, ChevronDown, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { coreApi, coreApiV4 } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { toast } from '@/components/Toast';
import { getErrorMessage } from '@/lib/utils';
import { cn } from '@/lib/utils';

const MODES = [
  { value: 'phased',       label: 'Phased',       description: 'Plan → Execute → Synthesize → Critique' },
  { value: 'parallel',     label: 'Parallel',      description: 'All agents run concurrently' },
  { value: 'sequential',   label: 'Sequential',    description: 'One agent at a time, in order' },
  { value: 'hierarchical', label: 'Hierarchical',  description: 'Planner decomposes → workers in parallel' },
] as const;

type Mode = typeof MODES[number]['value'];

export default function NewMissionPage() {
  const router = useRouter();
  const [goal, setGoal] = useState('');
  const [context, setContext] = useState('');
  const [mode, setMode] = useState<Mode>('phased');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [ralphMode, setRalphMode] = useState(false);
  const [maxIterations, setMaxIterations] = useState(5);
  const [scoreThreshold, setScoreThreshold] = useState(0.8);

  const { data: agentsData } = useQuery({
    queryKey: ['v4-agents-list'],
    queryFn: () => coreApiV4.agentsV4.list(),
    staleTime: 300000,
  });

  const agents = agentsData?.agents ?? [];

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (ralphMode) {
        return coreApiV4.ralphV4.run(goal.trim(), {
          maxIterations,
          agentId: selectedAgent || undefined,
        });
      }
      if (selectedAgent) {
        return coreApiV4.agentsV4.run(selectedAgent, goal.trim(), {
          context: context.trim() || undefined,
        });
      }
      return coreApi.createMission({ goal: goal.trim(), mode, context: context.trim() || undefined });
    },
    onSuccess: (data) => {
      const id = (data as Record<string, string>).missionId
        ?? (data as Record<string, string>).loopId
        ?? (data as Record<string, string>).runId
        ?? '';
      toast('success', `Submitted — ID: ${id.slice(0, 8)}...`);
      router.push('/missions');
    },
    onError: (err) => toast('error', getErrorMessage(err)),
  });

  const canSubmit = goal.trim().length > 0 && !submitMutation.isPending;

  return (
    <div className="min-h-screen pb-nav">
      <PageHeader
        title="New Mission"
        subtitle="Submit a task to Carbon Core orchestration"
        actions={
          <Link href="/missions" className="btn-secondary p-2.5">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        }
      />

      <div className="px-4 py-4 space-y-5 page-enter">
        {/* Goal */}
        <div className="space-y-1.5">
          <label className="label" htmlFor="mission-goal">
            Mission Goal <span className="text-red-400">*</span>
          </label>
          <textarea
            id="mission-goal"
            className="input resize-none min-h-[100px]"
            placeholder="e.g. Research the competitive landscape for AI-powered CRMs in the mid-market segment..."
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={4}
          />
          <p className="text-xs text-slate-600">{goal.length} / 2000 characters</p>
        </div>

        {/* Agent selector */}
        <div className="space-y-1.5">
          <label className="label" htmlFor="agent-select">
            Agent <span className="text-slate-500 font-normal">(optional — auto-routes if unset)</span>
          </label>
          <div className="relative">
            <select
              id="agent-select"
              className="input appearance-none pr-8 cursor-pointer"
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
            >
              <option value="">Auto-route</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.role}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Ralph Mode toggle */}
        <div className="card px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-indigo-400" />
              <div>
                <p className="text-sm font-semibold text-slate-200">Ralph Mode</p>
                <p className="text-xs text-slate-500">Iterative self-improving loop</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRalphMode(!ralphMode)}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0',
                ralphMode ? 'bg-indigo-600' : 'bg-slate-700'
              )}
            >
              <span className={cn(
                'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
                ralphMode ? 'translate-x-5' : 'translate-x-0.5'
              )} />
            </button>
          </div>

          {ralphMode && (
            <div className="mt-4 space-y-4 pt-4 border-t border-slate-800/60">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-400 font-medium">Max Iterations</label>
                  <span className="text-xs font-bold text-indigo-400">{maxIterations}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={maxIterations}
                  onChange={(e) => setMaxIterations(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <div className="flex justify-between text-[10px] text-slate-600">
                  <span>1</span><span>10</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-400 font-medium">Score Threshold</label>
                  <span className="text-xs font-bold text-indigo-400">{scoreThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={1.0}
                  step={0.05}
                  value={scoreThreshold}
                  onChange={(e) => setScoreThreshold(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <div className="flex justify-between text-[10px] text-slate-600">
                  <span>0.50</span><span>1.00</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mode selector — hidden in ralph mode */}
        {!ralphMode && (
          <div className="space-y-1.5">
            <label className="label">Execution Mode</label>
            <div className="space-y-2">
              {MODES.map((m) => (
                <label
                  key={m.value}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    mode === m.value
                      ? 'border-indigo-500 bg-indigo-900/20'
                      : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={m.value}
                    checked={mode === m.value}
                    onChange={() => setMode(m.value)}
                    className="mt-0.5 accent-indigo-500"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{m.label}</p>
                    <p className="text-xs text-slate-500">{m.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Additional context */}
        <div className="space-y-1.5">
          <label className="label" htmlFor="mission-context">
            Additional Context (optional)
          </label>
          <textarea
            id="mission-context"
            className="input resize-none"
            placeholder="Any background information, specific requirements, or constraints..."
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
          />
        </div>

        {/* Submit */}
        <button
          onClick={() => submitMutation.mutate()}
          disabled={!canSubmit}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3"
        >
          {submitMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              {ralphMode ? 'Start Ralph Loop' : 'Submit Mission'}
            </>
          )}
        </button>

        <p className="text-xs text-slate-600 text-center">
          {ralphMode
            ? `Ralph will run up to ${maxIterations} iterations until score ≥ ${scoreThreshold.toFixed(2)}.`
            : 'Carbon Core will orchestrate agents to complete your mission. Results appear in Missions.'}
        </p>
      </div>
    </div>
  );
}
