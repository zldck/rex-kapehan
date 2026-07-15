export const metadata = {
  title: 'Rex Kapehan',
  description: 'Book your court at Rex Kapehan',
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
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

