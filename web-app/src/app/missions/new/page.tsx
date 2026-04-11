'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { ariaApi, Blueprint } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { toast } from '@/components/Toast';
import { getErrorMessage } from '@/lib/utils';

// Default client ID — in a real deployment this comes from auth context
const DEFAULT_CLIENT_ID = '00000000-0000-0000-0000-000000000001';

export default function NewMissionPage() {
  const router = useRouter();
  const [goal, setGoal] = useState('');
  const [context, setContext] = useState('');
  const [selectedBlueprint, setSelectedBlueprint] = useState('');

  const { data: blueprints = [] } = useQuery<Blueprint[]>({
    queryKey: ['blueprints'],
    queryFn: ariaApi.getBlueprints,
    staleTime: 300_000,
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      ariaApi.createMission({
        clientId: DEFAULT_CLIENT_ID,
        goal: goal.trim(),
        context: context.trim(),
        blueprintId: selectedBlueprint || undefined,
      }),
    onSuccess: (data) => {
      toast('success', `Mission submitted — ID: ${data.missionId.slice(0, 8)}...`);
      router.push('/missions');
    },
    onError: (err) => toast('error', getErrorMessage(err)),
  });

  const canSubmit = goal.trim().length > 0 && !submitMutation.isPending;

  // Group blueprints by category
  const byCategory = blueprints.reduce<Record<string, Blueprint[]>>((acc, bp) => {
    const cat = bp.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(bp);
    return acc;
  }, {});

  return (
    <div className="min-h-screen pb-nav">
      <PageHeader
        title="New Mission"
        subtitle="Submit a research mission to ARIA"
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
            Research Goal <span className="text-red-400">*</span>
          </label>
          <textarea
            id="mission-goal"
            className="input resize-none min-h-[100px]"
            placeholder="e.g. Analyse the competitive landscape for AI-powered CRMs in the mid-market segment..."
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={4}
          />
          <p className="text-xs text-slate-600">{goal.length} / 2000 characters</p>
        </div>

        {/* Blueprint selector */}
        <div className="space-y-1.5">
          <label className="label" htmlFor="blueprint-select">
            Blueprint (optional)
          </label>
          <select
            id="blueprint-select"
            className="input"
            value={selectedBlueprint}
            onChange={(e) => setSelectedBlueprint(e.target.value)}
          >
            <option value="">Auto-select blueprint</option>
            {Object.entries(byCategory).map(([cat, bps]) => (
              <optgroup key={cat} label={cat}>
                {bps.map(bp => (
                  <option key={bp.id} value={bp.name}>{bp.name.replace(/_/g, ' ')}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="text-xs text-slate-600">Blueprints guide the research structure and output format</p>
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
          ARIA will run through scan → research → synthesis agents. Results appear in Missions.
        </p>
      </div>
    </div>
  );
}
