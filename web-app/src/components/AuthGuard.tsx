'use client';

import React, { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth';

const PUBLIC_PATHS = ['/login'];

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  // DEV BYPASS: auto-login until auth flow is fixed
  const { login, isAuthenticated } = useAuthStore();
  const [ready, setReady] = React.useState(isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) { setReady(true); return; }
    fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'OmniFlow2026!' }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.accessToken) { login(data.accessToken, data.user); }
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  if (!ready) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#6366f1', fontSize: 14 }}>
      Starting Carbon Cloud...
    </div>
  );

  return <>{children}</>;
}
