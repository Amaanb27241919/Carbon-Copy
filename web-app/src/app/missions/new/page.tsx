'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { coreApi } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { toast } from '@/components/Toast';
import { getErrorMessage } from '@/lib/utils';

const MODES = [
  { value: 'phased', label: 'Phased', description: 'Sequential agent phases (recommended)' },
  { value: 'parallel', label: 'Parallel', description: 'All agents run concurrently' },
  { value: 'sequential', label: 'Sequential', description: 'One agent at a time, in order' },
] as const;

export default function NewMissionPage() {
  const router = useRouter();
  const [goal, setGoal] = useState('');
  const [context, setContext] = useState('');
  const [mode, setMode] = useState<'phased' | 'parallel' | 'sequential'>('phased');

  const submitMutation = useMutation({
    mutationFn: () =>
      coreApi.createMission({ goal: goal.trim(), mode, context: context.trim() || undefined }),
    onSuccess: (data) => {
      toast('success', `Mission submitted — ID: ${(data.missionId || '').slice(0, 8)}...`);
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

        {/* Mode selector */}
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
              Submit Mission
            </>
          )}
        </button>

        <p className="text-xs text-slate-600 text-center">
          Carbon Core will orchestrate agents to complete your mission. Results appear in Missions.
        </p>
      </div>
    </div>
  );
}
