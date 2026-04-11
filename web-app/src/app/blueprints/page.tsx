'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { BookOpen, Search, ArrowRight } from 'lucide-react';
import { ariaApi, Blueprint } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';

const CATEGORY_COLORS: Record<string, string> = {
  Strategy: 'bg-indigo-900/40 border-indigo-700/40 text-indigo-300',
  Intelligence: 'bg-violet-900/40 border-violet-700/40 text-violet-300',
  Finance: 'bg-emerald-900/40 border-emerald-700/40 text-emerald-300',
  'M&A': 'bg-amber-900/40 border-amber-700/40 text-amber-300',
  Sales: 'bg-blue-900/40 border-blue-700/40 text-blue-300',
  Legal: 'bg-red-900/40 border-red-700/40 text-red-300',
  Compliance: 'bg-orange-900/40 border-orange-700/40 text-orange-300',
  General: 'bg-slate-800/60 border-slate-700/40 text-slate-300',
};

function BlueprintCard({ blueprint, onUse }: { blueprint: Blueprint; onUse: () => void }) {
  const colorClass = CATEGORY_COLORS[blueprint.category] || CATEGORY_COLORS.General;

  return (
    <div className={cn('card border rounded-2xl p-4 space-y-2', colorClass)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest opacity-70 mb-1 block">
            {blueprint.category}
          </span>
          <h3 className="text-sm font-bold leading-snug">
            {blueprint.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </h3>
        </div>
        <BookOpen className="w-4 h-4 opacity-60 flex-shrink-0 mt-0.5" />
      </div>
      <p className="text-xs opacity-70 leading-relaxed">{blueprint.description}</p>
      <button
        onClick={onUse}
        className="flex items-center gap-1 text-xs font-semibold opacity-80 hover:opacity-100 transition-opacity pt-1"
      >
        Use blueprint <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function BlueprintsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const { data: blueprints = [], isLoading } = useQuery<Blueprint[]>({
    queryKey: ['blueprints'],
    queryFn: ariaApi.getBlueprints,
    staleTime: 300_000,
  });

  const categories = Array.from(new Set(blueprints.map(b => b.category))).sort();

  const filtered = blueprints.filter(b => {
    const matchesSearch = !search || b.name.includes(search.toLowerCase()) || b.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || b.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleUse = (blueprint: Blueprint) => {
    router.push(`/missions/new?blueprint=${blueprint.name}`);
  };

  return (
    <div className="min-h-screen pb-nav">
      <PageHeader
        title="Blueprints"
        subtitle={`${blueprints.length} research templates`}
      />

      <div className="px-4 pt-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="search"
            className="input pl-9"
            placeholder="Search blueprints..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setCategoryFilter('')}
            className={cn(
              'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
              !categoryFilter ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
            )}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
                categoryFilter === cat ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-3 page-enter">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card space-y-2 p-4">
              <div className="skeleton h-3 w-16 rounded" />
              <div className="skeleton h-4 w-40 rounded" />
              <div className="skeleton h-3 w-full rounded" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-12 text-center gap-3">
            <BookOpen className="w-10 h-10 text-slate-600" />
            <p className="text-sm text-slate-400">No blueprints match your search</p>
          </div>
        ) : (
          filtered.map(bp => (
            <BlueprintCard key={bp.id} blueprint={bp} onUse={() => handleUse(bp)} />
          ))
        )}
      </div>
    </div>
  );
}
