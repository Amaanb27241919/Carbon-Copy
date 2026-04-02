'use client';

import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex items-center justify-between',
        'px-4 pt-4 pb-3',
        'sticky top-0 z-10',
        'bg-slate-900/90 backdrop-blur-xl',
        'border-b border-slate-800/60',
        className
      )}
    >
      <div className="flex flex-col gap-0.5">
        <h1 className="text-xl font-bold text-slate-50 leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-xs text-slate-500">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
