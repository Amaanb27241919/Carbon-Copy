import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes safely, resolving conflicts.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format bytes to human-readable string.
 * @example formatBytes(1536) → "1.5 KB"
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format a date to a relative "time ago" string.
 * @example timeAgo(new Date(Date.now() - 60000)) → "1 min ago"
 */
export function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);

  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

/**
 * Format a date to a short timestamp string.
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Truncate a string to a max length with ellipsis.
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract a friendly error message from an Axios error or unknown error.
 */
export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    // Axios error shape
    const axiosErr = error as {
      response?: { data?: { message?: string; error?: string } };
      message?: string;
    };
    if (axiosErr.response?.data?.message) return axiosErr.response.data.message;
    if (axiosErr.response?.data?.error) return axiosErr.response.data.error;
    if (axiosErr.message) return axiosErr.message;
  }
  return 'An unexpected error occurred';
}

/**
 * Provider color mappings.
 */
export const providerColors = {
  ollama: { bg: 'bg-green-900/40', text: 'text-green-400', border: 'border-green-800/50' },
  openai: { bg: 'bg-blue-900/40', text: 'text-blue-400', border: 'border-blue-800/50' },
  claude: { bg: 'bg-purple-900/40', text: 'text-purple-400', border: 'border-purple-800/50' },
  huggingface: { bg: 'bg-amber-900/40', text: 'text-amber-400', border: 'border-amber-800/50' },
} as const;

export type Provider = keyof typeof providerColors;

/**
 * Provider emoji badges.
 */
export const providerEmoji: Record<string, string> = {
  ollama: '🟢',
  openai: '🔵',
  claude: '🟣',
  huggingface: '🟡',
};

/**
 * Container state color mappings.
 */
export function getContainerStateColor(state: string): string {
  switch (state) {
    case 'running':
      return 'text-green-400';
    case 'paused':
      return 'text-amber-400';
    case 'restarting':
      return 'text-blue-400';
    case 'exited':
    case 'stopped':
      return 'text-red-400';
    default:
      return 'text-slate-400';
  }
}
