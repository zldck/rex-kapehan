'use client';

import { useEffect, useState } from 'react';

export default function PWAUpdatePrompt() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const handleServiceWorkerUpdate = async (reg) => {
      setRegistration(reg);

      // Check for updates periodically
      const interval = setInterval(() => {
        reg.update();
      }, 60000); // Check every minute

      return () => clearInterval(interval);
    };

    const handleControllerChange = () => {
      // Service worker has been updated and activated
      console.log('Service Worker updated. Reload page to see changes.');
    };

    navigator.serviceWorker.ready.then((reg) => {
      handleServiceWorkerUpdate(reg);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
            // New service worker is ready and there was a previous worker
            setShowUpdate(true);
          }
        });
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const handleUpdate = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      setShowUpdate(false);
      // Reload after a short delay to allow the new service worker to take over
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };

  if (!showUpdate) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        left: '16px',
        maxWidth: '400px',
        margin: '0 auto',
        backgroundColor: '#141414',
        border: '2px solid #D4AF37',
        borderRadius: '12px',
        padding: '16px',
        zIndex: 9998,
        boxShadow: '0 4px 12px rgba(212, 175, 55, 0.3)',
        animation: 'slideDown 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes slideDown {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <span style={{ fontSize: '20px' }}>⚡</span>
        <div style={{ flex: 1 }}>
          <h3
            style={{
              margin: '0 0 4px 0',
              color: '#D4AF37',
              fontSize: '14px',
              fontWeight: '700',
            }}
          >
            Update Available
          </h3>
          <p
            style={{
              margin: '0 0 12px 0',
              color: '#aaaaaa',
              fontSize: '13px',
              lineHeight: '1.4',
            }}
          >
            A new version of Rex Kapehan is ready. Update now to get the latest features and improvements.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleUpdate}
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: '#D4AF37',
                color: '#000',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => (e.target.style.backgroundColor = '#E5C158')}
              onMouseLeave={(e) => (e.target.style.backgroundColor = '#D4AF37')}
            >
              Update Now
            </button>
            <button
              onClick={() => setShowUpdate(false)}
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: 'transparent',
                color: '#888',
                border: '1px solid #2a2a2a',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = '#444';
                e.target.style.color = '#aaa';
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = '#2a2a2a';
                e.target.style.color = '#888';
              }}
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
