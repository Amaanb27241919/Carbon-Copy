import type { Metadata, Viewport } from 'next';
import './globals.css';
import { QueryProvider } from '@/components/QueryProvider';
import { AuthGuard } from '@/components/AuthGuard';
import { BottomNav } from '@/components/BottomNav';
import { ToastContainer } from '@/components/Toast';
import { NavVisibility } from '@/components/NavVisibility';

export const metadata: Metadata = {
  title: 'Carbon Cloud',
  description: 'AI Cloud Infrastructure Control Panel',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Carbon',
  },
  applicationName: 'Carbon Cloud',
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: [
      { url: '/icon-192.svg', sizes: '192x192' },
      { url: '/icon-512.svg', sizes: '512x512' },
    ],
    icon: [
      { url: '/icon-192.svg', sizes: '192x192' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f172a',
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* iOS PWA meta tags */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Carbon" />
        {/* Prevent iOS phone number detection */}
        <meta name="format-detection" content="telephone=no" />
        {/* MS Tile */}
        <meta name="msapplication-TileColor" content="#0f172a" />
        {/* Apple touch icons */}
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.svg" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icon-512.svg" />
      </head>
      <body className="dark bg-slate-900 text-slate-50 antialiased">
        <QueryProvider>
          <AuthGuard>
            {/* Toast notifications */}
            <ToastContainer />

            {/* Main content area */}
            <main
              className="min-h-screen"
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
            >
              {children}
            </main>

            {/* Bottom navigation — hidden on login page */}
            <NavVisibility>
              <BottomNav />
            </NavVisibility>
          </AuthGuard>
        </QueryProvider>
      </body>
    </html>
  );
}
