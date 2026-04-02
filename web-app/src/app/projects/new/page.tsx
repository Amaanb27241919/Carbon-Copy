'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Github, Cpu, MemoryStick, Loader2, Rocket } from 'lucide-react';
import { sandboxApi } from '@/lib/api';
import { getErrorMessage, cn } from '@/lib/utils';
import { toast } from '@/components/Toast';

const CPU_OPTIONS = ['0.5', '1', '2', '4'] as const;
const RAM_OPTIONS = ['256m', '512m', '1g', '2g', '4g'] as const;

export default function NewProjectPage() {
  const router = useRouter();

  const [repoUrl, setRepoUrl] = useState('');
  const [cpuLimit, setCpuLimit] = useState<string>('1');
  const [memoryLimit, setMemoryLimit] = useState<string>('512m');
  const [entrypoint, setEntrypoint] = useState('');

  const runMutation = useMutation({
    mutationFn: () =>
      sandboxApi.run({ repoUrl, cpuLimit, memoryLimit, entrypoint: entrypoint || undefined }),
    onSuccess: (data) => {
      toast('success', data.message || 'Project launched in sandbox!');
      router.push('/projects');
    },
    onError: (err) => {
      toast('error', getErrorMessage(err));
    },
  });

  const isValidUrl = () => {
    try {
      const url = new URL(repoUrl);
      return url.hostname === 'github.com' && url.pathname.split('/').length >= 3;
    } catch {
      return false;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidUrl()) {
      toast('warning', 'Please enter a valid GitHub repository URL');
      return;
    }
    runMutation.mutate();
  };

  return (
    <div className="min-h-screen pb-nav">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 pt-4 pb-3 sticky top-0 z-10 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800/60">
        <button
          onClick={() => router.back()}
          className="btn-secondary p-2.5 min-touch"
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-50">New Project</h1>
          <p className="text-xs text-slate-500">Run a GitHub repo in the sandbox</p>
        </div>
      </header>

      <div className="px-4 py-6 space-y-6 page-enter max-w-lg mx-auto">

        {/* Sandbox notice */}
        <div className="bg-amber-950/40 border border-amber-800/40 rounded-2xl p-4 flex items-start gap-3">
          <Rocket className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300">Sandbox Preview</p>
            <p className="text-xs text-amber-600 mt-0.5">
              The sandbox service is coming soon. This form will submit to the sandbox runner once available.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* GitHub URL */}
          <div>
            <label className="label" htmlFor="repo-url">
              <div className="flex items-center gap-1.5">
                <Github className="w-3.5 h-3.5" />
                GitHub Repository URL
              </div>
            </label>
            <input
              id="repo-url"
              type="url"
              className={cn(
                'input',
                repoUrl && !isValidUrl() && 'border-red-700/70 focus:ring-red-500'
              )}
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
            {repoUrl && !isValidUrl() && (
              <p className="text-xs text-red-400 mt-1.5 px-1">
                Enter a valid GitHub URL (e.g. https://github.com/owner/repo)
              </p>
            )}
          </div>

          {/* Entrypoint (optional) */}
          <div>
            <label className="label" htmlFor="entrypoint">
              Custom Entrypoint{' '}
              <span className="text-slate-600 font-normal">(optional)</span>
            </label>
            <input
              id="entrypoint"
              type="text"
              className="input font-mono"
              placeholder="npm start"
              value={entrypoint}
              onChange={(e) => setEntrypoint(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          {/* CPU Limit */}
          <div>
            <label className="label">
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                CPU Limit
              </div>
            </label>
            <div className="flex gap-2">
              {CPU_OPTIONS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setCpuLimit(val)}
                  className={cn(
                    'flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all duration-150',
                    cpuLimit === val
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  )}
                >
                  {val} {Number(val) === 1 ? 'core' : 'cores'}
                </button>
              ))}
            </div>
          </div>

          {/* RAM Limit */}
          <div>
            <label className="label">
              <div className="flex items-center gap-1.5">
                <MemoryStick className="w-3.5 h-3.5" />
                Memory Limit
              </div>
            </label>
            <div className="flex flex-wrap gap-2">
              {RAM_OPTIONS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setMemoryLimit(val)}
                  className={cn(
                    'py-2.5 px-4 rounded-xl text-sm font-medium border transition-all duration-150',
                    memoryLimit === val
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  )}
                >
                  {val.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Resource summary */}
          <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-3 flex items-center gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              {cpuLimit} CPU{Number(cpuLimit) !== 1 ? 's' : ''}
            </div>
            <div className="w-px h-4 bg-slate-700" />
            <div className="flex items-center gap-1.5">
              <MemoryStick className="w-3.5 h-3.5 text-indigo-400" />
              {memoryLimit.toUpperCase()} RAM
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={runMutation.isPending || !repoUrl}
            className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
          >
            {runMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Launching...
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4" />
                Run in Sandbox
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
