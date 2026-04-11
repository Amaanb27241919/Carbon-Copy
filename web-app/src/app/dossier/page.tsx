'use client';

import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload, Loader2, Trash2, FolderOpen } from 'lucide-react';
import { ariaApi, DossierFile } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { toast } from '@/components/Toast';
import { timeAgo, getErrorMessage } from '@/lib/utils';

const DEFAULT_CLIENT_ID = '00000000-0000-0000-0000-000000000001';

function DossierCard({ file }: { file: DossierFile }) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => fetch(`/api/dossier/${file.id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dossier'] });
      toast('success', `Deleted ${file.filename}`);
    },
    onError: (err) => toast('error', getErrorMessage(err)),
  });

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">{file.filename}</p>
            <p className="text-xs text-slate-600 mt-0.5">{timeAgo(file.uploaded_at)}</p>
          </div>
        </div>
        <button
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
          className="text-slate-600 hover:text-red-400 transition-colors p-1 flex-shrink-0"
          aria-label="Delete file"
        >
          {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
      {file.ai_summary && (
        <p className="text-xs text-slate-400 line-clamp-3 pl-6">{file.ai_summary}</p>
      )}
    </div>
  );
}

export default function DossierPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: files = [], isLoading } = useQuery<DossierFile[]>({
    queryKey: ['dossier'],
    queryFn: () => ariaApi.getDossierFiles(DEFAULT_CLIENT_ID),
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => ariaApi.uploadDossierFile(DEFAULT_CLIENT_ID, file),
    onSuccess: (file) => {
      queryClient.invalidateQueries({ queryKey: ['dossier'] });
      toast('success', `Uploaded and summarized ${file.filename}`);
    },
    onError: (err) => toast('error', getErrorMessage(err)),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = '';
  };

  return (
    <div className="min-h-screen pb-nav">
      <PageHeader
        title="Dossier"
        subtitle={`${files.length} document${files.length !== 1 ? 's' : ''}`}
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".txt,.md,.pdf,.csv,.json"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              className="btn-primary flex items-center gap-1.5 text-xs py-2 px-3"
            >
              {uploadMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              Upload
            </button>
          </>
        }
      />

      <div className="px-4 py-4 space-y-3 page-enter">
        <div className="card p-3 bg-indigo-950/30 border-indigo-800/30">
          <p className="text-xs text-indigo-300">
            Documents are AI-summarized and automatically injected as context into missions. Upload PDFs, text files, or CSV data.
          </p>
        </div>

        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card space-y-2 p-4">
              <div className="flex items-center gap-2">
                <div className="skeleton w-4 h-4 rounded" />
                <div className="skeleton h-4 w-36 rounded" />
              </div>
              <div className="skeleton h-3 w-full rounded" />
            </div>
          ))
        ) : files.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-12 text-center gap-3">
            <FolderOpen className="w-10 h-10 text-slate-600" />
            <p className="text-sm text-slate-400 font-medium">No documents yet</p>
            <p className="text-xs text-slate-600">Upload documents to build your intelligence dossier</p>
            <button onClick={() => fileInputRef.current?.click()} className="btn-primary text-xs mt-2">
              Upload File
            </button>
          </div>
        ) : (
          files.map(f => <DossierCard key={f.id} file={f} />)
        )}
      </div>
    </div>
  );
}
