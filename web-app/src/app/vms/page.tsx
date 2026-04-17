'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Server, Plus, Play, Square, PowerOff, Trash2, Monitor, ExternalLink, X, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { toast } from '@/components/Toast';

const CORE_API = '/app/core-api';

async function fetchVMs() {
  const res = await fetch(`${CORE_API}/vms`);
  if (!res.ok) throw new Error('Failed to fetch VMs');
  return res.json();
}

const OS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  macOS:   { bg: 'bg-purple-900/40 border-purple-700/40', text: 'text-purple-300', label: 'macOS' },
  Windows: { bg: 'bg-blue-900/40 border-blue-700/40',   text: 'text-blue-300',   label: 'Windows' },
  Ubuntu:  { bg: 'bg-orange-900/40 border-orange-700/40', text: 'text-orange-300', label: 'Ubuntu' },
  Linux:   { bg: 'bg-amber-900/40 border-amber-700/40',  text: 'text-amber-300',  label: 'Linux' },
  Alpine:  { bg: 'bg-cyan-900/40 border-cyan-700/40',   text: 'text-cyan-300',   label: 'Alpine' },
};

const PROVIDER_STYLES: Record<string, string> = {
  utm: 'bg-violet-900/40 text-violet-300 border-violet-700/40',
  kvm: 'bg-blue-900/40 text-blue-300 border-blue-700/40',
};

const OS_OPTIONS = [
  { id: 'macos-sonoma',   label: 'macOS Sonoma',    provider: 'utm', emoji: '🍎', ram: 8192,  cpus: 4, disk: 64 },
  { id: 'windows-11-arm', label: 'Windows 11 ARM',  provider: 'utm', emoji: '🪟', ram: 8192,  cpus: 4, disk: 64 },
  { id: 'ubuntu-24-arm',  label: 'Ubuntu 24.04',    provider: 'utm', emoji: '🐧', ram: 4096,  cpus: 2, disk: 32 },
  { id: 'linux-generic',  label: 'Alpine Linux',    provider: 'kvm', emoji: '⛰️', ram: 1024,  cpus: 1, disk: 8  },
];

interface VM {
  id: string; name: string; provider: string; os_display: string;
  status: string; running: boolean; cpus: number; ram_mb: number;
  screenshot_url?: string; vnc_url?: string;
}

function VMCard({ vm, onStart, onStop, onShutdown, onDelete, loading }: {
  vm: VM;
  onStart: () => void; onStop: () => void; onShutdown: () => void; onDelete: () => void;
  loading: boolean;
}) {
  const os = OS_STYLES[vm.os_display] || OS_STYLES.Linux;
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0',
            vm.running ? 'bg-green-500' : vm.status === 'starting' ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'
          )} />
          <span className="text-sm font-semibold text-slate-100 truncate">{vm.name}</span>
        </div>
        <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full border', PROVIDER_STYLES[vm.provider] || PROVIDER_STYLES.kvm)}>
          {vm.provider.toUpperCase()}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', os.bg, os.text)}>{vm.os_display}</span>
        <span className="text-xs text-slate-500">{vm.cpus}vCPU · {Math.round(vm.ram_mb / 1024)}GB RAM</span>
      </div>

      <div className="flex items-center gap-2">
        {!vm.running ? (
          <button onClick={onStart} disabled={loading} className="btn-secondary text-xs flex-1 flex items-center justify-center gap-1.5 py-1.5">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Start
          </button>
        ) : (
          <>
            <button onClick={onStop} disabled={loading} className="btn-secondary text-xs flex-1 flex items-center justify-center gap-1.5 py-1.5">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
              Stop
            </button>
            {vm.running && (
              <>
                <button onClick={onShutdown} disabled={loading}
                  title="Graceful shutdown (sends power-off signal to OS)"
                  className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 text-amber-400 border-amber-700/40 hover:bg-amber-900/20">
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <PowerOff className="w-3 h-3" />}
                  Shutdown
                </button>
                <a href="utm://" onClick={(e) => { e.preventDefault(); window.open('utm://', '_blank'); }}
                  className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3">
                  <Monitor className="w-3 h-3" /> Open UTM
                </a>
              </>
            )}
          </>
        )}
        <button onClick={onDelete} disabled={loading}
          className="p-1.5 rounded-lg border border-slate-700/60 text-slate-500 hover:text-red-400 hover:border-red-700/40 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function CreateVMModal({ onClose, utmAvailable }: { onClose: () => void; utmAvailable: boolean }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [os, setOs] = useState(utmAvailable ? 'ubuntu-24-arm' : 'linux-generic');

  const selectedOS = OS_OPTIONS.find(o => o.id === os)!;

  const create = useMutation({
    mutationFn: async () => {
      const endpoint = selectedOS.provider === 'utm' ? `${CORE_API}/vms/utm` : `${CORE_API}/vms`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, os, ram_mb: selectedOS.ram, cpus: selectedOS.cpus, disk_gb: selectedOS.disk }),
      });
      if (!res.ok) throw new Error('Failed to create VM');
      return res.json();
    },
    onSuccess: () => {
      toast('success', `VM "${name}" created`);
      qc.invalidateQueries({ queryKey: ['vms'] });
      onClose();
    },
    onError: (e: Error) => toast('error', e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-2xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">Create Virtual Machine</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-slate-400">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="my-dev-vm"
            className="w-full bg-slate-800 border border-slate-700/60 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60" />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-slate-400">Operating System</label>
          <div className="grid grid-cols-2 gap-2">
            {OS_OPTIONS.filter(o => o.provider === 'utm' ? utmAvailable : true).map(opt => (
              <button key={opt.id} onClick={() => setOs(opt.id)}
                className={cn('p-3 rounded-xl border text-left transition-all',
                  os === opt.id ? 'border-indigo-500/60 bg-indigo-950/30' : 'border-slate-700/60 hover:border-slate-600')}>
                <div className="text-lg mb-1">{opt.emoji}</div>
                <div className="text-xs font-medium text-slate-200">{opt.label}</div>
                <div className="text-[10px] text-slate-500 uppercase mt-0.5">{opt.provider}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-500 bg-slate-800/60 rounded-xl p-3">
          {selectedOS.cpus} vCPU · {selectedOS.ram >= 1024 ? `${selectedOS.ram/1024}GB` : `${selectedOS.ram}MB`} RAM · {selectedOS.disk}GB disk
        </div>

        <button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}
          className="w-full btn-primary py-2.5 text-sm flex items-center justify-center gap-2">
          {create.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : <><Plus className="w-4 h-4" /> Create VM</>}
        </button>
      </div>
    </div>
  );
}

export default function VMsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['vms'], queryFn: fetchVMs, refetchInterval: 15000 });

  const vms: VM[] = data?.vms || [];
  const utmAvailable = data?.utm_available || false;
  const runningCount = vms.filter(v => v.running).length;

  async function vmAction(id: string, action: () => Promise<unknown>) {
    setLoadingId(id);
    try { await action(); qc.invalidateQueries({ queryKey: ['vms'] }); }
    catch { toast('error', 'Action failed'); }
    finally { setLoadingId(null); }
  }

  return (
    <div className="min-h-screen pb-nav overflow-y-auto">
      <PageHeader
        title="Virtual Machines"
        subtitle={isLoading ? 'Loading...' : vms.length ? `${runningCount} running · ${vms.length} total` : 'No VMs yet'}
        actions={
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-1.5 px-3 py-2 text-sm">
            <Plus className="w-4 h-4" /> Create VM
          </button>
        }
      />

      <div className="px-4 py-4 space-y-5 page-enter">

        {/* Provider status */}
        <div className="flex gap-2">
          <span className={cn('text-xs px-3 py-1.5 rounded-full border font-medium',
            utmAvailable ? 'bg-green-900/30 text-green-300 border-green-700/40' : 'bg-amber-900/30 text-amber-300 border-amber-700/40')}>
            {utmAvailable ? '✅ UTM Ready' : '⚠️ UTM not running'}
          </span>
          <span className={cn('text-xs px-3 py-1.5 rounded-full border font-medium',
            data?.kvm_available ? 'bg-green-900/30 text-green-300 border-green-700/40' : 'bg-slate-800 text-slate-500 border-slate-700/40')}>
            {data?.kvm_available ? '✅ Docker KVM' : '○ Docker KVM'}
          </span>
        </div>

        {!utmAvailable && (
          <div className="card p-4 border-amber-800/40 bg-amber-950/20 flex items-start gap-3">
            <Server className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-300">Install UTM for macOS, Windows & Linux VMs</p>
              <p className="text-xs text-amber-400/70 mt-0.5">Runs natively on your M4 Mac at near-native speed via Apple Virtualization Framework.</p>
              <a href="https://mac.getutm.app" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 mt-2 font-medium">
                Download UTM <ExternalLink className="w-3 h-3" />
              </a>
              <p className="text-[10px] text-amber-400/50 mt-1">After installing: Settings → Server → Enable (port 8080)</p>
            </div>
          </div>
        )}

        {/* VM grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1,2].map(i => <div key={i} className="card h-36 skeleton" />)}
          </div>
        ) : vms.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-12 text-center gap-3">
            <Server className="w-10 h-10 text-slate-600" />
            <div>
              <p className="text-sm font-medium text-slate-300">No virtual machines yet</p>
              <p className="text-xs text-slate-500 mt-1">
                {utmAvailable
                  ? 'Create your first VM to get started.'
                  : 'Install UTM to run macOS, Windows, and Linux VMs natively on your M4 Mac.'}
              </p>
            </div>
            {utmAvailable
              ? <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-1.5 px-4 py-2 text-sm"><Plus className="w-4 h-4" />Create VM</button>
              : <a href="https://mac.getutm.app" target="_blank" rel="noreferrer" className="btn-primary flex items-center gap-1.5 px-4 py-2 text-sm">Download UTM <ExternalLink className="w-3.5 h-3.5" /></a>
            }
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {vms.map(vm => (
              <VMCard
                key={vm.id}
                vm={vm}
                loading={loadingId === vm.id}
                onStart={() => vmAction(vm.id, () => fetch(`${CORE_API}/vms/${vm.provider === 'utm' ? 'utm/' : ''}${vm.id}/start`, { method: 'POST' }))}
                onStop={() => vmAction(vm.id, () => fetch(`${CORE_API}/vms/${vm.provider === 'utm' ? 'utm/' : ''}${vm.id}/stop`, { method: 'POST', body: JSON.stringify({ force: true }), headers: { 'Content-Type': 'application/json' } }))}
                onShutdown={() => vmAction(vm.id, () => fetch(`${CORE_API}/vms/utm/${vm.id}/shutdown`, { method: 'POST' }))}
                onDelete={() => {
                  if (confirm(`Delete "${vm.name}"?`)) {
                    vmAction(vm.id, () => fetch(`${CORE_API}/vms/${vm.provider === 'utm' ? 'utm/' : ''}${vm.id}`, { method: 'DELETE' }));
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateVMModal onClose={() => setShowCreate(false)} utmAvailable={utmAvailable} />}
    </div>
  );
}
