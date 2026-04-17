'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Cpu,
  Server,
  Settings,
  Target,
  MessageSquare,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Tab {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: string | number }>;
  matchExact?: boolean;
}

const TABS: Tab[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, matchExact: true },
  { href: '/missions', label: 'Missions', icon: Target },
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/vms', label: 'VMs', icon: Server },
  { href: '/core', label: 'Core', icon: Layers },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (tab: Tab): boolean => {
    if (tab.matchExact) return pathname === tab.href;
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
  };

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'bg-slate-900/95 backdrop-blur-xl',
        'border-t border-slate-700/60',
        'flex items-stretch',
        // Safe area padding for iPhone home indicator
        'pb-[env(safe-area-inset-bottom,0px)]'
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      {TABS.map((tab) => {
        const active = isActive(tab);
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5',
              'pt-2 pb-1 px-1',
              'min-h-[56px]',
              'transition-all duration-150',
              'select-none touch-manipulation',
              'relative',
              active
                ? 'text-indigo-400'
                : 'text-slate-500 hover:text-slate-300 active:text-slate-200'
            )}
            aria-current={active ? 'page' : undefined}
          >
            {/* Active indicator dot */}
            {active && (
              <span
                className={cn(
                  'absolute top-1.5 w-1 h-1 rounded-full bg-indigo-400',
                  'shadow-[0_0_6px_rgba(99,102,241,0.8)]'
                )}
                aria-hidden
              />
            )}

            <Icon
              className={cn(
                'transition-all duration-150',
                active ? 'w-5 h-5 scale-110' : 'w-5 h-5'
              )}
              strokeWidth={active ? 2.5 : 1.8}
            />

            <span
              className={cn(
                'text-[10px] font-medium leading-none tracking-wide',
                active ? 'text-indigo-400' : 'text-slate-500'
              )}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
