'use client';

import { usePathname } from 'next/navigation';

const HIDDEN_PATHS = ['/login'];

export function NavVisibility({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (HIDDEN_PATHS.includes(pathname)) return null;
  return <>{children}</>;
}
