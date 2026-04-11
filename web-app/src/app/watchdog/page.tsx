'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Plus, X, Loader2, CheckCircle, PauseCircle, AlertTriangle } from 'lucide-react';
import { ariaApi, WatchdogMonitor } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { toast } from '@/components/Toast';
import { cn, timeAgo, getErrorMessage } from '@/lib/utils';

const DEFAULT_CLIENT_ID = '00000000-0000-0000-0000-000000000001';

const SIGNAL_TYPES = ['news', 'funding', 'leadership_change', 'regulatory', 'product_launch', 'market_move'];

function CreateMonitorModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [entity, setEntity] = useState('');
  const [signals, setSignals] = useState<string[]>(['news', 'funding']);

  const createMutation = useMutation({
    mutationFn: () =>
      ariaApi.createMonitor({ clientId: DEFAULT_CLIENT_ID, targetEntity: entity.trim(), signalTypes: signals }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchdog'] });
      toast('success', `Monitor created for "${entity}"`);
      onClose();
    },
    onError: (err) => toast('error', getErrorMessage(err)),
  });

  const toggleSignal = (s: string) => {
    setSignals(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-slate-800 border border-slate-700 rounded-t-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100">New WatchDog Monitor</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="label">Target Entity</label>
          <input
            type="text"
            className="input"
            placeholder="Company name, person, or topic..."
            value={entity}
            onChange={e => setEntity(e.target.value)}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <label className="label">Signal Types to Monitor</label>
          <div className="flex flex-wrap gap-2">
            {SIGNAL_TYPES.map(s => (
              <button
                key={s}
                onClick={() => toggleSignal(s)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                  signals.includes(s)
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-700 border-slate-600 text-slate-400'
                )}
              >
                {s.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!entity.trim() || createMutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Create Monitor
          </button>
        </div>
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </div>
  );
}

function MonitorCard({ monitor }: { monitor: WatchdogMonitor }) {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {monitor.status === 'active'
            ? <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
            : <PauseCircle className="w-4 h-4 text-slate-500 flex-shrink-0" />}
          <span className="text-sm font-semibold text-slate-100">{monitor.target_entity}</span>
        </div>
        <span className={cn('text-xs font-medium', monitor.status === 'active' ? 'text-green-400' : 'text-slate-500')}>
          {monitor.status}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(monitor.signal_types || []).map(s => (
          <span key={s} className="badge bg-slate-700/60 text-slate-400 text-[10px]">
            {s.replace(/_/g, ' ')}
          </span>
        ))}
      </div>

      <p className="text-xs text-slate-600">
        {monitor.last_check ? `Last checked ${timeAgo(monitor.last_check)}` : 'Never checked'}
      </p>
    </div>
  );
}

export default function WatchdogPage() {
  const [showCreate, setShowCreate] = useState(false);

  const { data: monitors = [], isLoading } = useQuery<WatchdogMonitor[]>({
    queryKey: ['watchdog'],
    queryFn: () => ariaApi.getWatchdogMonitors(DEFAULT_CLIENT_ID),
    refetchInterval: 30_000,
  });

  const activeCount = monitors.filter(m => m.status === 'active').length;

  return (
    <div className="min-h-screen pb-nav">
      <PageHeader
        title="WatchDog"
        subtitle={`${activeCount} active monitor${activeCount !== 1 ? 's' : ''}`}
        actions={
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-1.5 text-xs py-2 px-3">
            <Plus className="w-3.5 h-3.5" />
            Monitor
          </button>
        }
      />

      <div className="px-4 py-4 space-y-3 page-enter">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card space-y-2">
              <div className="skeleton h-4 w-40 rounded" />
              <div className="skeleton h-3 w-24 rounded" />
            </div>
          ))
        ) : monitors.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-12 text-center gap-3">
            <AlertTriangle className="w-10 h-10 text-slate-600" />
            <p className="text-sm text-slate-400 font-medium">No monitors yet</p>
            <p className="text-xs text-slate-600">Monitor companies, people, or topics for signal changes</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary text-xs mt-2">
              Create Monitor
            </button>
          </div>
        ) : (
          monitors.map(m => <MonitorCard key={m.id} monitor={m} />)
        )}
      </div>

      {showCreate && <CreateMonitorModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
