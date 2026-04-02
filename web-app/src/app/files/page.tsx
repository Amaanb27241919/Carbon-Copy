'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Folder,
  File,
  Upload,
  ChevronRight,
  HardDrive,
  Loader2,
  ArrowLeft,
  RefreshCw,
  Database,
} from 'lucide-react';
import { dataApi, FileEntry, StorageStats } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { cn, formatBytes, timeAgo, getErrorMessage } from '@/lib/utils';
import { toast } from '@/components/Toast';

function StorageBar({ stats }: { stats: StorageStats }) {
  const pct = stats.total > 0 ? Math.round((stats.used / stats.total) * 100) : 0;
  const color =
    pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-indigo-500';

  return (
    <div className="card space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-300">Storage</span>
        </div>
        <span className="text-xs text-slate-500">
          {formatBytes(stats.used)} / {formatBytes(stats.total)}
        </span>
      </div>

      <div className="w-full bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex gap-4 text-xs text-slate-500">
        <span>{stats.buckets} bucket{stats.buckets !== 1 ? 's' : ''}</span>
        <span>{stats.objects} object{stats.objects !== 1 ? 's' : ''}</span>
        <span className="ml-auto font-medium text-slate-400">{pct}% used</span>
      </div>
    </div>
  );
}

function FileIcon({ entry }: { entry: FileEntry }) {
  if (entry.type === 'bucket' || entry.type === 'folder') {
    return <Folder className="w-5 h-5 text-amber-400 flex-shrink-0" />;
  }

  const ext = entry.name.split('.').pop()?.toLowerCase();
  const colorMap: Record<string, string> = {
    jpg: 'text-pink-400',
    jpeg: 'text-pink-400',
    png: 'text-pink-400',
    gif: 'text-pink-400',
    pdf: 'text-red-400',
    json: 'text-yellow-400',
    txt: 'text-slate-400',
    md: 'text-blue-400',
    py: 'text-green-400',
    js: 'text-yellow-300',
    ts: 'text-blue-300',
  };

  return (
    <File
      className={cn(
        'w-5 h-5 flex-shrink-0',
        ext && colorMap[ext] ? colorMap[ext] : 'text-slate-400'
      )}
    />
  );
}

export default function FilesPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentPath, setCurrentPath] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['files', currentPath],
    queryFn: () => dataApi.listFiles(currentPath),
    staleTime: 30_000,
  });

  const files: FileEntry[] = data?.files ?? [];
  const stats: StorageStats | null = data?.stats ?? null;

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const bucket = currentPath.split('/')[0] || 'default';
      await dataApi.uploadFile(bucket, file, setUploadProgress);
    },
    onSuccess: () => {
      toast('success', 'File uploaded successfully');
      setUploadProgress(null);
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
    onError: (err) => {
      toast('error', getErrorMessage(err));
      setUploadProgress(null);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
    // Reset so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleEntryTap = (entry: FileEntry) => {
    if (entry.type === 'bucket' || entry.type === 'folder') {
      setCurrentPath(entry.path);
    } else {
      // Initiate download
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api';
      const downloadUrl = `${apiUrl}/data/download?path=${encodeURIComponent(entry.path)}`;
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Build breadcrumb from currentPath
  const pathParts = currentPath ? currentPath.split('/').filter(Boolean) : [];

  return (
    <div className="min-h-screen pb-nav">
      <PageHeader
        title="Files"
        subtitle={stats ? `${formatBytes(stats.used)} used` : 'MinIO Storage'}
        actions={
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-secondary p-2.5 min-touch"
            aria-label="Refresh"
          >
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
          </button>
        }
      />

      <div className="px-4 py-4 space-y-4 page-enter">
        {/* Storage bar */}
        {stats && <StorageBar stats={stats} />}

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs overflow-x-auto" aria-label="Breadcrumb">
          <button
            onClick={() => setCurrentPath('')}
            className={cn(
              'text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap',
              currentPath === '' && 'text-slate-100 font-semibold'
            )}
          >
            Root
          </button>
          {pathParts.map((part, i) => {
            const partPath = pathParts.slice(0, i + 1).join('/');
            return (
              <span key={partPath} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
                <button
                  onClick={() => setCurrentPath(partPath)}
                  className={cn(
                    'text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap',
                    i === pathParts.length - 1 && 'text-slate-100 font-semibold'
                  )}
                >
                  {part}
                </button>
              </span>
            );
          })}
        </nav>

        {/* Back button */}
        {currentPath && (
          <button
            onClick={() => {
              const parts = currentPath.split('/').filter(Boolean);
              parts.pop();
              setCurrentPath(parts.join('/'));
            }}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors py-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        )}

        {/* Upload progress */}
        {uploadProgress !== null && (
          <div className="card space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Uploading...</span>
              <span className="text-indigo-400 font-medium">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* File list */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card flex items-center gap-3 py-3">
                <div className="skeleton w-5 h-5 rounded" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3.5 w-32 rounded" />
                  <div className="skeleton h-3 w-20 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="card flex flex-col items-center justify-center py-12 text-center gap-3">
            <Database className="w-10 h-10 text-slate-600" />
            <p className="text-sm text-slate-400 font-medium">Failed to load files</p>
            <p className="text-xs text-slate-600">Check that data-server is running</p>
            <button onClick={() => refetch()} className="btn-secondary text-xs mt-2">
              Try again
            </button>
          </div>
        ) : files.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-12 text-center gap-3">
            <Folder className="w-10 h-10 text-slate-600" />
            <p className="text-sm text-slate-400 font-medium">
              {currentPath ? 'This folder is empty' : 'No buckets found'}
            </p>
            <p className="text-xs text-slate-600">Upload a file to get started</p>
          </div>
        ) : (
          <div className="space-y-1">
            {files.map((entry) => (
              <button
                key={entry.path}
                onClick={() => handleEntryTap(entry)}
                className="w-full card flex items-center gap-3 py-3 text-left hover:border-slate-600 active:opacity-80 transition-all duration-150 touch-manipulation"
              >
                <FileIcon entry={entry} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 font-medium truncate">{entry.name}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    {entry.size !== undefined && (
                      <span>{formatBytes(entry.size)}</span>
                    )}
                    {entry.lastModified && (
                      <>
                        {entry.size !== undefined && <span>·</span>}
                        <span>{timeAgo(entry.lastModified)}</span>
                      </>
                    )}
                  </div>
                </div>
                {(entry.type === 'bucket' || entry.type === 'folder') && (
                  <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        onChange={handleFileSelect}
        aria-label="Upload file"
      />

      {/* FAB upload button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadMutation.isPending}
        className={cn(
          'fixed right-5 z-40 w-14 h-14',
          'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700',
          'rounded-full shadow-[0_4px_24px_rgba(99,102,241,0.5)]',
          'flex items-center justify-center',
          'transition-all duration-150',
          'touch-manipulation',
          'disabled:opacity-60'
        )}
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
        }}
        aria-label="Upload file"
      >
        {uploadMutation.isPending ? (
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        ) : (
          <Upload className="w-6 h-6 text-white" />
        )}
      </button>
    </div>
  );
}
