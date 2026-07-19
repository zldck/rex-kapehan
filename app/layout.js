import PWARegister from './PWARegister';
import PWAInstallPrompt from './PWAInstallPrompt';
import PWAUpdatePrompt from './PWAUpdatePrompt';

export const metadata = {
  title: 'Rex Kapehan - Court Reservations',
  description: 'Book pickleball courts at Rex Kapehan, Talisay City. Reserve your court online instantly.',
  manifest: '/manifest.json',
  themeColor: '#D4AF37',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Rex Kapehan',
  },
  formatDetection: {
    telephone: false,
  },
  icons: [
    { rel: 'icon', url: '/favicon.ico' },
    { rel: 'icon', type: 'image/svg+xml', url: '/favicon.svg' },
    { rel: 'apple-touch-icon', url: '/web-app-manifest-192x192.png' },
    { rel: 'icon', sizes: '192x192', url: '/web-app-manifest-192x192.png' },
    { rel: 'icon', sizes: '512x512', url: '/web-app-manifest-512x512.png' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ backgroundColor: '#0a0a0a' }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="x-ua-compatible" content="ie=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Rex Kapehan" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/web-app-manifest-192x192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#D4AF37" />
        <meta name="description" content="Book pickleball courts at Rex Kapehan, Talisay City" />
        <meta name="keywords" content="pickleball, court, reservation, booking, sports" />
        <link rel="alternate" type="application/json+oembed" href="/api/oembed" />
      </head>
      <body style={{ backgroundColor: '#0a0a0a', margin: 0, padding: 0, minHeight: '100vh' }}>
        <PWARegister />
        <PWAInstallPrompt />
        <PWAUpdatePrompt />
        {children}
      </body>
    </html>
  );
}