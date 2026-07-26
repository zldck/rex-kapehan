'use client';

import { useEffect } from 'react';

export default function PWARegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Register immediately if page already loaded, otherwise wait for load
    const registerSW = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((registration) => {
          console.log('✓ Service Worker registered:', registration);
        })
        .catch((error) => {
          console.error('✗ Service Worker registration failed:', error);
        });
    };

    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW, { once: true });
    }

    return () => {
      window.removeEventListener('load', registerSW);
    };
  }, []);

  return null;
}
