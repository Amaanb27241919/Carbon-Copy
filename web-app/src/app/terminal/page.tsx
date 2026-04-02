'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Terminal, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { vmApi, Container } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';

const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, '');
}

function LogLine({ line, index }: { line: string; index: number }) {
  const isError = /error|failed|fatal|exception/i.test(line);
  const isWarn = /warn|warning/i.test(line);
  const isSuccess = /success|started|ready|listening|connected/i.test(line);

  return (
    <div
      className={cn(
        'font-mono text-xs leading-5 break-all whitespace-pre-wrap px-4',
        'hover:bg-slate-800/40',
        isError && 'text-red-400',
        isWarn && !isError && 'text-amber-400',
        isSuccess && !isError && !isWarn && 'text-green-400',
        !isError && !isWarn && !isSuccess && 'text-green-300/90'
      )}
    >
      <span className="select-none text-slate-700 mr-3 text-[10px]">
        {String(index + 1).padStart(4, '0')}
      </span>
      {stripAnsi(line)}
    </div>
  );
}

export default function TerminalPage() {
  const [selectedContainer, setSelectedContainer] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [tailLines, setTailLines] = useState(200);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Fetch available containers
  const { data: containers = [], isLoading: containersLoading } = useQuery<Container[]>({
    queryKey: ['containers'],
    queryFn: vmApi.listContainers,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Auto-select first running container
  useEffect(() => {
    if (!selectedContainer && containers.length > 0) {
      const running = containers.find((c) => c.state === 'running');
      if (running) setSelectedContainer(running.name);
      else if (containers[0]) setSelectedContainer(containers[0].name);
    }
  }, [containers, selectedContainer]);

  // Fetch logs
  const {
    data: rawLogs,
    isLoading: logsLoading,
    error: logsError,
    refetch,
    isFetching,
  } = useQuery<string>({
    queryKey: ['logs', selectedContainer, tailLines],
    queryFn: () => vmApi.getLogs(selectedContainer, tailLines),
    enabled: !!selectedContainer,
    refetchInterval: 5_000, // Poll every 5s
    staleTime: 3_000,
  });

  const logLines = rawLogs
    ? rawLogs
        .split('\n')
        .filter((line) => line.trim())
    : [];

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logLines.length, autoScroll]);

  // Detect manual scroll to pause auto-scroll
  const handleScroll = useCallback(() => {
    const el = logsContainerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 50;
    setAutoScroll(isAtBottom);
  }, []);

  const containerInfo = containers.find((c) => c.name === selectedContainer);

  return (
    <div className="min-h-screen pb-nav flex flex-col">
      <PageHeader
        title="Terminal"
        subtitle={selectedContainer ? `Logs: ${selectedContainer}` : 'Select a container'}
        actions={
          <button
            onClick={() => refetch()}
            disabled={isFetching || !selectedContainer}
            className="btn-secondary p-2.5 min-touch"
            aria-label="Refresh logs"
          >
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
          </button>
        }
      />

      {/* Controls */}
      <div className="px-4 pt-3 pb-2 space-y-2 border-b border-slate-800/60">
        {/* Container selector */}
        <div className="relative">
          <select
            value={selectedContainer}
            onChange={(e) => setSelectedContainer(e.target.value)}
            className="input appearance-none pr-10 text-sm font-mono"
            disabled={containersLoading}
            aria-label="Select container"
          >
            {containersLoading ? (
              <option>Loading containers...</option>
            ) : containers.length === 0 ? (
              <option>No containers found</option>
            ) : (
              <>
                <option value="">-- Select container --</option>
                {containers.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.state === 'running' ? '● ' : '○ '}
                    {c.name} ({c.state})
                  </option>
                ))}
              </>
            )}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        </div>

        {/* Options row */}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {/* Container status */}
          {containerInfo && (
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  containerInfo.state === 'running' ? 'bg-green-500' : 'bg-slate-600'
                )}
              />
              <span>{containerInfo.state}</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-3">
            {/* Tail lines selector */}
            <label className="flex items-center gap-1.5">
              <span>Last</span>
              <select
                value={tailLines}
                onChange={(e) => setTailLines(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
              </select>
              <span>lines</span>
            </label>

            {/* Auto-scroll toggle */}
            <button
              onClick={() => {
                setAutoScroll((v) => !v);
                if (!autoScroll) {
                  logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className={cn(
                'flex items-center gap-1 transition-colors',
                autoScroll ? 'text-indigo-400' : 'text-slate-500'
              )}
            >
              <span>{autoScroll ? '↓ Auto' : '↓ Paused'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Log Output */}
      <div
        ref={logsContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-slate-950 terminal-output"
        style={{ minHeight: 0 }}
        role="log"
        aria-live="polite"
        aria-label="Container logs"
      >
        {!selectedContainer ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-16 text-center">
            <Terminal className="w-10 h-10 text-slate-700" />
            <p className="text-sm text-slate-600 font-medium">No container selected</p>
            <p className="text-xs text-slate-700">Select a container above to view logs</p>
          </div>
        ) : logsLoading ? (
          <div className="flex items-center justify-center h-32 gap-2 text-green-700">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading logs...</span>
          </div>
        ) : logsError ? (
          <div className="flex flex-col items-center justify-center h-32 gap-3 text-center px-4">
            <AlertCircle className="w-8 h-8 text-red-700" />
            <p className="text-sm text-red-600">Failed to fetch logs</p>
            <button
              onClick={() => refetch()}
              className="text-xs text-red-500 hover:text-red-400 underline"
            >
              Retry
            </button>
          </div>
        ) : logLines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
            <p className="text-sm text-slate-700">No log output</p>
            <p className="text-xs text-slate-800">Container may not have produced output yet</p>
          </div>
        ) : (
          <div className="py-2">
            {/* Polled indicator */}
            <div className="px-4 py-1 text-[10px] text-slate-800 border-b border-slate-900">
              {isFetching ? (
                <span className="text-green-900">● Polling...</span>
              ) : (
                <span>● Auto-refresh every 5s</span>
              )}
            </div>
            {logLines.map((line, i) => (
              <LogLine key={i} line={line} index={i} />
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Scroll-to-bottom button */}
      {!autoScroll && selectedContainer && logLines.length > 0 && (
        <button
          onClick={() => {
            setAutoScroll(true);
            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          className={cn(
            'fixed right-5 z-40',
            'bg-indigo-600 text-white rounded-full shadow-lg',
            'flex items-center gap-2 px-4 py-2.5',
            'text-xs font-medium',
            'transition-all duration-150',
            'hover:bg-indigo-500'
          )}
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
          }}
        >
          <ChevronDown className="w-3.5 h-3.5" />
          Latest
        </button>
      )}
    </div>
  );
}
