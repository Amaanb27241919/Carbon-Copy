'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, BookOpen, X, FileText } from 'lucide-react';
import { coreApiV4, V4KnowledgeResult } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';

export default function KnowledgePage() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [activeDomain, setActiveDomain] = useState<string>('');

  const { data: domainsData } = useQuery({
    queryKey: ['v4-domains'],
    queryFn: () => coreApiV4.knowledgeV4.domains(),
    staleTime: 60000,
  });

  const domains = domainsData?.domains ?? [];

  const { data: results, isFetching, isError } = useQuery<{ results: V4KnowledgeResult[]; total: number; query: string }>({
    queryKey: ['v4-knowledge-search', submitted, activeDomain],
    queryFn: () => coreApiV4.knowledgeV4.search(submitted, {
      domain: activeDomain || undefined,
      limit: 20,
    }),
    enabled: submitted.length > 0,
    staleTime: 30000,
  });

  const handleSearch = () => {
    if (query.trim()) setSubmitted(query.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
  };

  const clearSearch = () => {
    setQuery('');
    setSubmitted('');
  };

  const hits = results?.results ?? [];

  return (
    <div className="min-h-screen pb-nav overflow-y-auto">
      <PageHeader
        title="Knowledge"
        subtitle="Search the Carbon Core knowledge base"
      />

      <div className="px-4 py-4 space-y-4 page-enter">
        {/* Search bar */}
        <div className="relative flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              className="input pl-9 pr-9"
              placeholder="Search knowledge base..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {query && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={!query.trim()}
            className="btn-primary px-4 py-2.5 text-sm font-medium disabled:opacity-50 flex-shrink-0"
          >
            Search
          </button>
        </div>

        {/* Domain filter chips */}
        {domains.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveDomain('')}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                activeDomain === ''
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-500'
              )}
            >
              All
            </button>
            {domains.map((domain) => (
              <button
                key={domain}
                onClick={() => setActiveDomain(activeDomain === domain ? '' : domain)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border transition-all capitalize',
                  activeDomain === domain
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-500'
                )}
              >
                {domain}
              </button>
            ))}
          </div>
        )}

        {/* No domains ingest notice */}
        {domains.length === 0 && !submitted && (
          <div className="card flex flex-col items-center justify-center py-10 text-center gap-3">
            <BookOpen className="w-8 h-8 text-slate-600" />
            <p className="text-sm text-slate-500">No knowledge ingested yet</p>
            <p className="text-xs text-slate-600 max-w-[240px]">
              Add markdown files to <code className="font-mono text-indigo-400 text-[10px]">knowledge-vault/</code> and ingest via:<br />
              <code className="font-mono text-[10px] text-slate-400">POST /api/v4/knowledge/ingest</code>
            </p>
          </div>
        )}

        {/* Loading */}
        {isFetching && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card p-4 space-y-2">
                <div className="skeleton h-3 w-32 rounded" />
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-3/4 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {isError && submitted && (
          <div className="card px-4 py-3 border border-red-800/40 bg-red-950/30">
            <p className="text-sm text-red-300">Search failed — is Carbon Core v4 running?</p>
          </div>
        )}

        {/* Empty results */}
        {!isFetching && submitted && hits.length === 0 && !isError && (
          <div className="card flex flex-col items-center justify-center py-10 text-center gap-2">
            <Search className="w-6 h-6 text-slate-600" />
            <p className="text-sm text-slate-500">No results for &ldquo;{submitted}&rdquo;</p>
            {activeDomain && (
              <p className="text-xs text-slate-600">Try removing the domain filter</p>
            )}
          </div>
        )}

        {/* Results */}
        {!isFetching && hits.length > 0 && (
          <section>
            <p className="text-xs text-slate-500 mb-3 px-1">
              {results?.total ?? hits.length} result{(results?.total ?? hits.length) !== 1 ? 's' : ''} for &ldquo;{submitted}&rdquo;
            </p>
            <div className="space-y-3">
              {hits.map((result, i) => (
                <div key={result.id ?? i} className="card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                      <p className="text-sm font-semibold text-slate-200 truncate">
                        {result.title ?? result.source ?? 'Untitled'}
                      </p>
                    </div>
                    {result.category && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-900/40 text-indigo-300 border border-indigo-700/40 flex-shrink-0 capitalize">
                        {result.category}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                    {result.content}
                  </p>
                  {result.source && (
                    <p className="text-[10px] text-slate-600 font-mono truncate">
                      {result.source}
                    </p>
                  )}
                  {result.score != null && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-800 rounded-full h-1 overflow-hidden">
                        <div
                          className="h-1 rounded-full bg-indigo-500"
                          style={{ width: `${Math.round(result.score * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-600 font-mono">{(result.score * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
