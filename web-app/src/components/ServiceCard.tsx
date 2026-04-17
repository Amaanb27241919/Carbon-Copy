'use client';

import { cn, timeAgo } from '@/lib/utils';
import type { ServiceHealth } from '@/lib/api';

interface ServiceCardProps {
  service: ServiceHealth;
  className?: string;
}

const STATUS_CONFIG = {
  up: {
    dotClass: 'status-dot-up',
    label: 'Operational',
    labelClass: 'text-green-400',
    bgGlow: 'shadow-[0_0_0_1px_rgba(34,197,94,0.1)]',
  },
  down: {
    dotClass: 'status-dot-down',
    label: 'Unreachable',
    labelClass: 'text-red-400',
    bgGlow: 'shadow-[0_0_0_1px_rgba(239,68,68,0.1)]',
  },
  offline: {
    dotClass: 'status-dot-unknown',
    label: 'Docker required',
    labelClass: 'text-amber-400',
    bgGlow: 'shadow-[0_0_0_1px_rgba(245,158,11,0.08)]',
  },
  unknown: {
    dotClass: 'status-dot-unknown',
    label: 'Unknown',
    labelClass: 'text-amber-400',
    bgGlow: 'shadow-[0_0_0_1px_rgba(245,158,11,0.1)]',
  },
} as const;

export function ServiceCard({ service, className }: ServiceCardProps) {
  const config = STATUS_CONFIG[service.status];

  return (
    <div
      className={cn(
        'card flex flex-col gap-2 min-h-[100px]',
        'transition-all duration-200',
        config.bgGlow,
        className
      )}
      role="article"
      aria-label={`${service.name}: ${config.label}`}
    >
      {/* Header row: name + status dot */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-slate-100 leading-tight">
          {service.name}
        </span>
        <span className={cn('status-dot mt-0.5 flex-shrink-0', config.dotClass)} />
      </div>

      {/* Status label */}
      <span className={cn('text-xs font-medium', config.labelClass)}>
        {config.label}
      </span>

      {/* Response time (when available) */}
      {service.responseTime !== undefined && service.status === 'up' && (
        <span className="text-xs text-slate-500">
          {service.responseTime}ms
        </span>
      )}

      {/* Last checked */}
      <span className="text-xs text-slate-600 mt-auto">
        {timeAgo(service.lastChecked)}
      </span>
    </div>
  );
}

// Skeleton version for loading state
export function ServiceCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('card flex flex-col gap-2 min-h-[100px]', className)}>
      <div className="flex items-start justify-between">
        <div className="skeleton h-4 w-20 rounded" />
        <div className="skeleton w-2.5 h-2.5 rounded-full" />
      </div>
      <div className="skeleton h-3 w-16 rounded" />
      <div className="skeleton h-3 w-12 rounded mt-auto" />
    </div>
  );
}
