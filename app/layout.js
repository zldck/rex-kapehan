export const metadata = {
  title: 'Rex Kapehan — Court Booking',
  description: 'Real-time court booking with GCash payments',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0a0a0a" />
      </head>
      <body style={{ margin: 0, backgroundColor: '#0a0a0a', color: '#ffffff' }}>
        {children}
      </body>
    </html>
  );
}