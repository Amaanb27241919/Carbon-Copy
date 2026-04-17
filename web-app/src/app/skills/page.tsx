'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Zap, X } from 'lucide-react';
import { coreApiV4, V4Skill } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';

const CATEGORY_COLORS: Record<string, string> = {
  content:    'bg-violet-900/40 text-violet-300 border-violet-700/40',
  sales:      'bg-green-900/40  text-green-300  border-green-700/40',
  marketing:  'bg-pink-900/40   text-pink-300   border-pink-700/40',
  seo:        'bg-amber-900/40  text-amber-300  border-amber-700/40',
  cro:        'bg-orange-900/40 text-orange-300 border-orange-700/40',
  research:   'bg-blue-900/40   text-blue-300   border-blue-700/40',
  tools:      'bg-slate-800     text-slate-300  border-slate-600',
  dev:        'bg-indigo-900/40 text-indigo-300 border-indigo-700/40',
};

function categoryColor(cat: string) {
  return CATEGORY_COLORS[cat.toLowerCase()] ?? 'bg-slate-800 text-slate-300 border-slate-600';
}

export default function SkillsPage() {
  const [filter, setFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['v4-skills'],
    queryFn: () => coreApiV4.skillsV4.list(),
    staleTime: 300000,
  });

  const skills = data?.skills ?? [];

  const filtered = useMemo(() => {
    if (!filter.trim()) return skills;
    const q = filter.toLowerCase();
    return skills.filter((s) =>
      s.id.includes(q) ||
      s.category.toLowerCase().includes(q) ||
      (s.triggers ?? []).some((t) => t.toLowerCase().includes(q)) ||
      (s.agents ?? []).some((a) => a.toLowerCase().includes(q))
    );
  }, [skills, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, V4Skill[]>();
    for (const s of filtered) {
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const categories = useMemo(
    () => Array.from(new Set(skills.map((s) => s.category))).sort(),
    [skills]
  );

  return (
    <div className="min-h-screen pb-nav overflow-y-auto">
      <PageHeader
        title="Skills"
        subtitle={`${data?.total ?? 0} skills across ${categories.length} categories`}
      />

      <div className="px-4 py-4 space-y-4 page-enter">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            className="input pl-9 pr-9"
            placeholder="Filter by name, category, or trigger..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {filter && (
            <button
              onClick={() => setFilter('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category chips */}
        {categories.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(filter === cat ? '' : cat)}
                className={cn(
                  'px-3 py-1 rounded-full text-[10px] font-semibold border transition-all capitalize',
                  filter === cat ? categoryColor(cat) + ' ring-1 ring-current' : categoryColor(cat)
                )}
              >
                {cat} ({skills.filter((s) => s.category === cat).length})
              </button>
            ))}
          </div>
        )}

        {/* Loading skeletons */}
        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, g) => (
              <div key={g} className="space-y-2">
                <div className="skeleton h-3 w-24 rounded" />
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 4 }).map((__, i) => (
                    <div key={i} className="card p-3 space-y-2">
                      <div className="skeleton h-3 w-20 rounded" />
                      <div className="skeleton h-3 w-full rounded" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No results */}
        {!isLoading && filtered.length === 0 && (
          <div className="card flex flex-col items-center justify-center py-10 text-center gap-2">
            <Zap className="w-7 h-7 text-slate-600" />
            <p className="text-sm text-slate-500">
              {filter ? `No skills matching "${filter}"` : 'No skills loaded'}
            </p>
            {!filter && (
              <p className="text-xs text-slate-600 max-w-[240px]">
                Skills are loaded from <code className="font-mono text-indigo-400 text-[10px]">skills/</code> at startup.
              </p>
            )}
          </div>
        )}

        {/* Grouped skill list */}
        {!isLoading && grouped.map(([category, categorySkills]) => (
          <section key={category}>
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className={cn(
                'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border capitalize',
                categoryColor(category)
              )}>
                {category}
              </span>
              <span className="text-xs text-slate-600">{categorySkills.length} skills</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {categorySkills.map((skill) => (
                <div key={skill.id} className="card px-3 py-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-slate-200 truncate font-mono">{skill.id}</span>
                  </div>
                  {(skill.triggers ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(skill.triggers ?? []).slice(0, 3).map((trigger) => (
                        <span
                          key={trigger}
                          className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-800 text-slate-400 border border-slate-700/60"
                        >
                          {trigger}
                        </span>
                      ))}
                      {(skill.triggers ?? []).length > 3 && (
                        <span className="text-[9px] text-slate-600">+{(skill.triggers ?? []).length - 3}</span>
                      )}
                    </div>
                  )}
                  {(skill.agents ?? []).length > 0 && (
                    <p className="text-[10px] text-slate-600 truncate">
                      {(skill.agents ?? []).join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
