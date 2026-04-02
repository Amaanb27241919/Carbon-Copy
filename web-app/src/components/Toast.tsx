'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

// Global toast state (simple singleton pattern for this app)
let addToastFn: ((toast: Omit<Toast, 'id'>) => void) | null = null;

export function toast(type: ToastType, message: string) {
  if (addToastFn) {
    addToastFn({ type, message });
  }
}

const ICON_MAP = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: CheckCircle,
};

const COLOR_MAP = {
  success: 'bg-green-900/80 border-green-700/60 text-green-100',
  error: 'bg-red-900/80 border-red-700/60 text-red-100',
  warning: 'bg-amber-900/80 border-amber-700/60 text-amber-100',
  info: 'bg-blue-900/80 border-blue-700/60 text-blue-100',
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-4), { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => {
      addToastFn = null;
    };
  }, [addToast]);

  const remove = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div
      className="fixed top-[calc(env(safe-area-inset-top,0px)+12px)] left-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => {
        const Icon = ICON_MAP[t.type];
        return (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-3 px-4 py-3 rounded-2xl border backdrop-blur-xl',
              'shadow-2xl pointer-events-auto',
              'animate-slide-up',
              COLOR_MAP[t.type]
            )}
            role="alert"
          >
            <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="text-sm flex-1 leading-snug">{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="text-current opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
