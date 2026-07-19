'use client';

import { useState, useEffect } from 'react';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for app install event
    window.addEventListener('appinstalled', () => {
      console.log('PWA installed');
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);

    if (outcome === 'accepted') {
      setShowPrompt(false);
    }

    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (isInstalled || !showPrompt) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        left: '16px',
        maxWidth: '400px',
        margin: '0 auto',
        backgroundColor: '#141414',
        border: '2px solid #D4AF37',
        borderRadius: '12px',
        padding: '16px',
        zIndex: 9999,
        boxShadow: '0 4px 12px rgba(212, 175, 55, 0.3)',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <span style={{ fontSize: '20px', marginTop: '2px' }}>🚀</span>
        <div style={{ flex: 1 }}>
          <h3
            style={{
              margin: '0 0 4px 0',
              color: '#D4AF37',
              fontSize: '14px',
              fontWeight: '700',
            }}
          >
            Install Rex Kapehan
          </h3>
          <p
            style={{
              margin: '0 0 12px 0',
              color: '#aaaaaa',
              fontSize: '13px',
              lineHeight: '1.4',
            }}
          >
            Install our app for faster access and offline support.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleInstall}
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
              Install
            </button>
            <button
              onClick={handleDismiss}
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
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '0',
            marginTop: '-4px',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
