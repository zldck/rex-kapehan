'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { setAutoRefreshPreference, useAutoRefreshPreference } from '../lib/mobile-preferences';

const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61592514809377';
const DIRECTIONS_URL = 'https://www.google.com/maps/dir/?api=1&destination=Rex+Kapehan+Anselmo+Diaz+St+Talisay+City+Cebu';
const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'muihilado@gmail.com')
  .split(',')
  .map((email) => email.trim().toLowerCase());

export function MobileMenuButton({ className = '', style = {} }) {
  return (
    <button
      type="button"
      className={`shared-mobile-menu-button ${className}`.trim()}
      aria-label="Open navigation menu"
      aria-haspopup="dialog"
      aria-controls="shared-mobile-navigation-drawer"
      onClick={() => window.dispatchEvent(new Event('rk-open-mobile-navigation'))}
      style={style}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}

function DrawerIcon({ children, color }) {
  return <span className="shared-drawer-icon" aria-hidden="true" style={color ? { color } : undefined}>{children}</span>;
}

export default function MobileNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState({ email: '', name: '', loggedIn: false, isAdmin: false });
  const autoRefresh = useAutoRefreshPreference();
  const isAdminArea = pathname.startsWith('/admin');

  const syncUser = useCallback(() => {
    const email = localStorage.getItem('rk_verified_email') || '';
    const loggedIn = localStorage.getItem('rk_user_logged_in') === 'true' && Boolean(email);
    setUser({
      email,
      name: localStorage.getItem('rk_user_name') || '',
      loggedIn,
      isAdmin: loggedIn && ADMIN_EMAILS.includes(email.toLowerCase()),
    });
  }, []);

  useEffect(() => {
    const handleOpen = () => {
      syncUser();
      setIsOpen(true);
    };
    const handleStorage = () => syncUser();
    window.addEventListener('rk-open-mobile-navigation', handleOpen);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('rk-user-session-changed', handleStorage);
    return () => {
      window.removeEventListener('rk-open-mobile-navigation', handleOpen);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('rk-user-session-changed', handleStorage);
    };
  }, [syncUser]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  const close = () => setIsOpen(false);
  const toggleAutoRefresh = () => {
    setAutoRefreshPreference(!autoRefresh);
  };
  const openLogin = () => {
    close();
    if (pathname === '/') {
      window.dispatchEvent(new Event('rk-open-login-modal'));
      return;
    }
    router.push('/?openLogin=1');
  };
  const logout = async () => {
    close();
    localStorage.removeItem('rk_verified_email');
    localStorage.removeItem('rk_user_logged_in');
    localStorage.removeItem('rk_pending_booking');
    window.dispatchEvent(new Event('rk-user-session-changed'));
    if (pathname.startsWith('/admin')) {
      try {
        await fetch('/api/admin/auth/logout', { method: 'POST' });
      } catch { /* Continue local logout if the request fails. */ }
    }
    router.push('/');
  };

  return (
    <>
      <style jsx global>{`
        .shared-mobile-menu-button {
          display: none;
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          align-items: center;
          justify-content: center;
          border: 1px solid #e7eaf0;
          border-radius: 10px;
          color: #647084;
          background: #ffffff;
          cursor: pointer;
        }
        .shared-drawer-shell {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
        }
        .shared-drawer-backdrop {
          position: absolute;
          inset: 0;
          z-index: 0;
          border: 0;
          background: rgba(15, 20, 32, 0.48);
          animation: sharedDrawerFade 0.18s ease-out;
        }
        .shared-drawer {
          position: relative;
          z-index: 1;
          width: min(82vw, 300px);
          height: 100%;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          padding: 18px 14px 16px;
          color: #202434;
          background: #ffffff;
          border-right: 1px solid #e8ebf2;
          box-shadow: 20px 0 60px rgba(0, 0, 0, 0.24);
          animation: sharedDrawerSlide 0.22s ease-out;
        }
        @keyframes sharedDrawerSlide {
          from { opacity: 0; transform: translateX(-100%); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes sharedDrawerFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .shared-drawer-brand-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
        .shared-drawer-brand-mark { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; color: #171717; background: #D4AF37; font-size: 15px; font-weight: 900; letter-spacing: -1px; }
        .shared-drawer-close { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid #e7eaf0; border-radius: 9px; color: #647084; background: #fff; font-size: 20px; cursor: pointer; }
        .shared-drawer-profile { display: flex; align-items: center; gap: 11px; padding: 0 6px 18px; margin-bottom: 14px; border-bottom: 1px solid #edf0f5; }
        .shared-drawer-avatar { width: 38px; height: 38px; flex: 0 0 38px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: linear-gradient(145deg, #313a52, #141a29); font-size: 12px; font-weight: 800; }
        .shared-drawer-name { overflow: hidden; color: #202434; font-size: 12px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
        .shared-drawer-caption { overflow: hidden; margin-top: 3px; color: #8992a4; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
        .shared-drawer-section { padding: 0 10px; margin: 8px 0 7px; color: #9aa2b1; font-size: 9px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
        .shared-drawer-item { width: 100%; min-height: 38px; display: flex; align-items: center; gap: 11px; box-sizing: border-box; padding: 0 10px; margin: 2px 0; border: 0; border-radius: 9px; color: #505a6d; background: transparent; font: inherit; font-size: 11px; font-weight: 650; text-align: left; text-decoration: none; cursor: pointer; transition: background .16s ease, color .16s ease; }
        .shared-drawer-item:hover { color: #263248; background: #f2f4f8; }
        .shared-drawer-item-active, .shared-drawer-item-active:hover { color: #fff; background: #718cf2; box-shadow: 0 5px 12px rgba(91, 120, 232, .2); }
        .shared-drawer-icon { width: 15px; height: 15px; flex: 0 0 15px; display: grid; place-items: center; color: currentColor; }
        .shared-drawer-divider { height: 1px; margin: 14px 4px 12px; background: #edf0f5; }
        .shared-drawer-switch { width: 30px; height: 17px; flex: 0 0 30px; display: flex; align-items: center; padding: 2px; border: 0; border-radius: 999px; background: #c9ced8; cursor: pointer; transition: background .18s ease; }
        .shared-drawer-switch[aria-checked="true"] { background: #718cf2; }
        .shared-drawer-switch-knob { width: 13px; height: 13px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .18); transition: transform .18s ease; }
        .shared-drawer-switch[aria-checked="true"] .shared-drawer-switch-knob { transform: translateX(13px); }
        .shared-drawer-bottom { margin-top: auto; padding-top: 14px; border-top: 1px solid #edf0f5; }
        @media (max-width: 767px) {
          .shared-mobile-menu-button { display: inline-flex; }
          .shared-desktop-nav-actions { display: none !important; }
        }
      `}</style>

      {isOpen && (
        <div className="shared-drawer-shell">
          <button type="button" className="shared-drawer-backdrop" aria-label="Close navigation menu" onClick={close} />
          <aside id="shared-mobile-navigation-drawer" className="shared-drawer" role="dialog" aria-modal="true" aria-label="Main navigation">
            <div className="shared-drawer-brand-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div className="shared-drawer-brand-mark" aria-hidden="true">RK</div>
                <div style={{ color: '#202434', fontSize: 11, fontWeight: 850, letterSpacing: '.04em' }}>REX KAPEHAN</div>
              </div>
              <button type="button" className="shared-drawer-close" aria-label="Close navigation menu" onClick={close}>×</button>
            </div>

            <div className="shared-drawer-profile">
              <div className="shared-drawer-avatar" aria-hidden="true">
                {(user.name || user.email || 'CG').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="shared-drawer-name">{user.name || (user.email ? user.email.split('@')[0] : 'Court Guest')}</div>
                <div className="shared-drawer-caption">{user.loggedIn ? user.email : 'Court reservation'}</div>
              </div>
            </div>

            <div className="shared-drawer-section">Booking</div>
            <Link href="/#booking" className={`shared-drawer-item${pathname === '/' ? ' shared-drawer-item-active' : ''}`} aria-current={pathname === '/' ? 'page' : undefined} onClick={close}>
              <DrawerIcon>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
              </DrawerIcon>
              Book a Court
            </Link>
            {user.loggedIn && (
              <Link href="/dashboard" className={`shared-drawer-item${pathname.startsWith('/dashboard') ? ' shared-drawer-item-active' : ''}`} onClick={close}>
                <DrawerIcon>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>
                </DrawerIcon>
                My Profile
              </Link>
            )}
            {(user.isAdmin || isAdminArea) && (
              <Link href="/admin" className={`shared-drawer-item${pathname.startsWith('/admin') ? ' shared-drawer-item-active' : ''}`} onClick={close}>
                <DrawerIcon>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 14.2 4l2.4-.2 1.2 2.1 2.1 1.2-.2 2.4 1 2.2-1 2.2.2 2.4-2.1 1.2-1.2 2.1-2.4-.2L12 21l-2.2-1-2.4.2-1.2-2.1-2.1-1.2.2-2.4-1-2.2 1-2.2-.2-2.4 2.1-1.2 1.2-2.1 2.4.2L12 3Z" /><circle cx="12" cy="12" r="3" /></svg>
                </DrawerIcon>
                Admin Panel
              </Link>
            )}
            {!user.loggedIn && (
              <button type="button" className="shared-drawer-item" onClick={openLogin}>
                <DrawerIcon>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5m5 5H3" /></svg>
                </DrawerIcon>
                Sign In / Create Account
              </button>
            )}

            <div className="shared-drawer-divider" />
            <div className="shared-drawer-section">Preferences &amp; Links</div>
            <button type="button" className="shared-drawer-item" role="switch" aria-checked={autoRefresh} aria-label="Auto-refresh availability" onClick={toggleAutoRefresh}>
              <DrawerIcon>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></svg>
              </DrawerIcon>
              <span style={{ flex: 1 }}>Auto-refresh availability</span>
              <span className="shared-drawer-switch" aria-hidden="true"><span className="shared-drawer-switch-knob" /></span>
            </button>
            <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="shared-drawer-item" onClick={close}>
              <DrawerIcon color="#1877F2">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.973h-1.513c-1.49 0-1.956.93-1.956 1.885v2.263h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073Z" /></svg>
              </DrawerIcon>
              Rex Kapehan on Facebook
              <span aria-hidden="true" style={{ marginLeft: 'auto', color: '#98a1b1' }}>↗</span>
            </a>
            <a href={DIRECTIONS_URL} target="_blank" rel="noopener noreferrer" className="shared-drawer-item" onClick={close}>
              <DrawerIcon>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
              </DrawerIcon>
              Get Directions
              <span aria-hidden="true" style={{ marginLeft: 'auto', color: '#98a1b1' }}>↗</span>
            </a>

            <div className="shared-drawer-bottom">
              {user.loggedIn || isAdminArea ? (
                <button type="button" className="shared-drawer-item" style={{ color: '#c14354' }} onClick={logout}>
                  <DrawerIcon>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 17l5-5-5-5m5 5H3" /><path d="M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></svg>
                  </DrawerIcon>
                  Log Out
                </button>
              ) : (
                <div style={{ padding: '3px 10px', color: '#98a1b1', fontSize: 9, lineHeight: 1.5 }}>Sign in to view your bookings and profile.</div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
