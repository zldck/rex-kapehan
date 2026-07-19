'use client';

import { useEffect } from 'react';

export default function PWARegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .then((registration) => {
            console.log('✓ Service Worker registered:', registration);
          })
          .catch((error) => {
            console.error('✗ Service Worker registration failed:', error);
          });
      });
    }
  }, []);

  return null;
}
