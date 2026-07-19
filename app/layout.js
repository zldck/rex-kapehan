export const metadata = {
  title: 'Rex Kapehan',
  description: 'Book pickleball courts at Rex Kapehan, Talisay City',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ backgroundColor: '#0a0a0a' }}>
      <body style={{ backgroundColor: '#0a0a0a', margin: 0, padding: 0, minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  );
}