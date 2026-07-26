import PWARegister from './PWARegister';
import PWAInstallPrompt from './PWAInstallPrompt';
import PWAUpdatePrompt from './PWAUpdatePrompt';

export const metadata = {
  title: 'Rex Kapehan - Court Reservations',
  description: 'Book pickleball courts at Rex Kapehan, Talisay City. Reserve your court online instantly.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Rex Kapehan',
  },
  formatDetection: {
    telephone: false,
  },
  icons: [
    { rel: 'icon', url: '/icons/favicon.ico' },
    { rel: 'icon', type: 'image/svg+xml', url: '/icons/favicon.svg' },
    { rel: 'apple-touch-icon', url: '/icons/apple-touch-icon.png' },
    { rel: 'icon', sizes: '192x192', url: '/icons/web-app-manifest-192x192.png' },
    { rel: 'icon', sizes: '512x512', url: '/icons/web-app-manifest-512x512.png' },
  ],
};

export const viewport = {
  themeColor: '#D4AF37',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ backgroundColor: '#0a0a0a' }}>
      <head>
        <meta charSet="utf-8" />
        <meta name="mobile-web-app-capable" content="yes" />
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