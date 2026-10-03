'use client';

import { useEffect, useRef, useState } from 'react';

export default function PWAUpdatePrompt() {
  const [showUpdate, setShowUpdate] = useState(false);
  const registrationRef = useRef(null);
  const waitingWorkerRef = useRef(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const hadControllerAtStart = Boolean(navigator.serviceWorker.controller);
    const handleControllerChange = () => {
      if (hadControllerAtStart) {
        window.location.reload();
      }
    };

    let isMounted = true;
    let updateInterval;
    let currentRegistration;
    const handleUpdateFound = (reg) => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          waitingWorkerRef.current = reg.waiting || newWorker;
          setShowUpdate(true);
        }
      });
    };
    const handleRegistrationUpdateFound = () => {
      if (currentRegistration) handleUpdateFound(currentRegistration);
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    navigator.serviceWorker.ready.then((reg) => {
      if (!isMounted) return;
      currentRegistration = reg;
      registrationRef.current = reg;
      reg.addEventListener('updatefound', handleRegistrationUpdateFound);

      if (reg.waiting && navigator.serviceWorker.controller) {
        waitingWorkerRef.current = reg.waiting;
        setShowUpdate(true);
      }

      updateInterval = setInterval(() => {
        reg.update().catch((error) => {
          console.error('Service Worker update check failed:', error);
        });
      }, 60000);
    }).catch((error) => {
      console.error('Service Worker readiness check failed:', error);
    });

    return () => {
      isMounted = false;
      clearInterval(updateInterval);
      currentRegistration?.removeEventListener('updatefound', handleRegistrationUpdateFound);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const handleUpdate = () => {
    const waitingWorker = waitingWorkerRef.current || registrationRef.current?.waiting;
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      // If activation already completed, reload to use the newly controlled app.
      window.location.reload();
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
