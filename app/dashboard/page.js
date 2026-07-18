'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const MUSTARD = '#D4AF37';
const BLACK = '#0a0a0a';
const CARD = '#141414';
const BORDER = '#2a2a2a';
const MUTED = '#888888';
const TEXT_SEC = '#aaaaaa';

export default function Dashboard() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showBookings, setShowBookings] = useState(false);

  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  // Check if user is logged in
  useEffect(() => {
    try {
      const email = localStorage.getItem('rk_verified_email');
      const loggedIn = localStorage.getItem('rk_user_logged_in');
      if (email && loggedIn === 'true') {
        setUserEmail(email);
        setIsLoggedIn(true);
        fetchBookings(email);
        fetchProfile(email);
      } else {
        router.push('/');
      }
    } catch (err) {
      console.error('Auth check error:', err);
      setError('Authentication error. Please log in again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch bookings
  const fetchBookings = useCallback(async (email) => {
    if (!email || !supabase) return;
    try {
      const { data, error: fetchError } = await supabase
        .from('bookings')
        .select('*')
        .eq('client_email', email)
        .order('booking_date', { ascending: false })
        .order('time_slot', { ascending: true });

      if (fetchError) {
        console.error('Fetch bookings error:', fetchError);
        setError('Failed to load your bookings.');
      } else {
        setBookings(data || []);
        setError('');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Connection error.');
    }
  }, []);

  // Fetch profile
  const fetchProfile = useCallback(async (email) => {
    if (!email || !supabase) return;
    try {
      const { data, error } = await supabase
        .from('verified_emails')
        .select('name, phone, address')
        .eq('email', email)
        .single();

      if (error) {
        console.error('Profile fetch error:', error);
        return;
      }
      if (data) {
        setProfileName(data.name || '');
        setProfilePhone(data.phone || '');
        setProfileAddress(data.address || '');
        if (data.name) localStorage.setItem('rk_user_name', data.name);
        if (data.phone) localStorage.setItem('rk_user_phone', data.phone);
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
    }
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (!isLoggedIn || !userEmail || !autoRefresh) return;
    const interval = setInterval(() => {
      fetchBookings(userEmail);
    }, 10000);
    return () => clearInterval(interval);
  }, [isLoggedIn, userEmail, autoRefresh, fetchBookings]);

  const handleLogout = () => {
    localStorage.removeItem('rk_verified_email');
    localStorage.removeItem('rk_user_logged_in');
    router.push('/');
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  // Save profile
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    setProfileLoading(true);

    if (!profileName.trim()) {
      setProfileError('Name is required.');
      setProfileLoading(false);
      return;
    }
    const phoneRegex = /^09\d{9}$/;
    if (profilePhone && !phoneRegex.test(profilePhone)) {
      setProfileError('Phone must start with 09 and be 11 digits.');
      setProfileLoading(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('verified_emails')
        .update({
          name: profileName.trim(),
          phone: profilePhone || null,
          address: profileAddress || null,
        })
        .eq('email', userEmail);

      if (error) {
        console.error('Profile update error:', error);
        setProfileError('Failed to update profile: ' + error.message);
        setProfileLoading(false);
        return;
      }

      localStorage.setItem('rk_user_name', profileName.trim());
      if (profilePhone) localStorage.setItem('rk_user_phone', profilePhone);

      setProfileSuccess('Profile updated successfully!');
    } catch (err) {
      console.error('Profile update error:', err);
      setProfileError('Failed to update profile.');
    } finally {
      setProfileLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const isToday = (dateStr) => dateStr === new Date().toISOString().split('T')[0];

  const statusConfig = {
    confirmed: { color: '#10b981', label: 'Confirmed' },
    pending_review: { color: MUSTARD, label: 'Pending Review' },
    cancelled: { color: '#ef4444', label: 'Cancelled' },
  };

  const styles = {
    wrapper: { minHeight: '100vh', backgroundColor: BLACK, color: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '0 0 40px 0' },
    nav: { borderBottom: `1px solid ${BORDER}`, backgroundColor: 'rgba(10,10,10,0.9)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 },
    navInner: { maxWidth: '1200px', margin: '0 auto', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    brand: { fontSize: '22px', fontWeight: 800, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '2px' },
    brandRex: { color: MUSTARD, textShadow: '0 0 20px rgba(212, 175, 55, 0.3)' },
    brandKapehan: { color: '#ffffff', textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 10px rgba(0,0,0,0.8)' },
    container: { maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' },
    headerTitle: { fontSize: '28px', fontWeight: 800, margin: 0 },
    headerSub: { fontSize: '14px', color: TEXT_SEC, margin: '4px 0 0 0' },
    card: { backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '24px', marginBottom: '16px' },
    badge: (status) => ({ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px', color: statusConfig[status]?.color || TEXT_SEC, backgroundColor: `${statusConfig[status]?.color}15`, border: `1px solid ${statusConfig[status]?.color}30` }),
    slotTag: { display: 'inline-block', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(212, 175, 55, 0.1)', color: MUSTARD, border: '1px solid rgba(212, 175, 55, 0.2)', marginRight: '6px', marginBottom: '4px' },
    dateTag: { display: 'inline-block', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)', marginBottom: '6px' },
    dateTagToday: { display: 'inline-block', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', marginBottom: '6px' },
    btnPrimary: { padding: '10px 24px', backgroundColor: MUSTARD, color: BLACK, border: 'none', borderRadius: '12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' },
    btnPrimaryHover: { backgroundColor: '#E5C158' },
    btnOutline: { padding: '10px 24px', backgroundColor: 'transparent', color: TEXT_SEC, border: `1px solid ${BORDER}`, borderRadius: '12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' },
    errorBanner: { padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', color: '#f87171', fontSize: '13px', fontWeight: 500, marginBottom: '16px' },
    successBanner: { padding: '12px 16px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '12px', color: '#34d399', fontSize: '13px', fontWeight: 500, marginBottom: '16px' },
    bookingRow: { padding: '12px 0', borderBottom: `1px solid ${BORDER}` },
    emptyState: { textAlign: 'center', padding: '40px 20px', color: MUTED },
    emptyIcon: { fontSize: '40px', marginBottom: '12px' },
    emptyTitle: { fontSize: '16px', fontWeight: 700, color: TEXT_SEC, marginBottom: '4px' },
    emptyText: { fontSize: '13px', color: '#555555' },
    verifiedBadge: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '6px 12px', borderRadius: '20px' },
    toggle: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: TEXT_SEC, cursor: 'pointer', userSelect: 'none' },
    toggleDot: (active) => ({ width: '36px', height: '20px', borderRadius: '10px', backgroundColor: active ? MUSTARD : BORDER, position: 'relative', transition: 'all 0.2s' }),
    toggleKnob: (active) => ({ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#ffffff', position: 'absolute', top: '2px', left: active ? '18px' : '2px', transition: 'all 0.2s' }),
    formGroup: { marginBottom: '20px' },
    label: { display: 'block', fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' },
    input: { width: '100%', backgroundColor: BLACK, border: `1px solid ${BORDER}`, padding: '14px 16px', borderRadius: '14px', color: '#ffffff', fontSize: '14px', outline: 'none', boxSizing: 'border-box', transition: 'all 0.2s' },
    hint: { fontSize: '11px', color: MUTED, marginTop: '6px' },
    collapseBtn: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 0', backgroundColor: 'transparent', border: 'none', color: '#ffffff', fontSize: '16px', fontWeight: 700, cursor: 'pointer', borderTop: `1px solid ${BORDER}`, marginTop: '16px', paddingTop: '16px' },
    collapseArrow: (open) => ({ fontSize: '20px', transition: 'transform 0.3s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }),
    collapsibleContent: (open) => ({ overflow: 'hidden', maxHeight: open ? '9999px' : '0', transition: 'max-height 0.4s ease' }),
  };

  // --- Loading State ---
  if (isLoading) {
    return (
      <div style={styles.wrapper}>
        <nav style={styles.nav}>
          <div style={styles.navInner}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <div style={styles.brand}>
                <span style={styles.brandRex}>REX</span>
                <span style={styles.brandKapehan}>KAPEHAN</span>
              </div>
            </Link>
          </div>
        </nav>
        <div style={{ ...styles.container, textAlign: 'center', padding: '80px 20px', color: MUTED }}>
          Loading...
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div style={styles.wrapper}>
        <div style={{ ...styles.container, textAlign: 'center', padding: '80px 20px', color: MUTED }}>
          <p>Please log in to view your dashboard.</p>
          <Link href="/" style={{ color: MUSTARD, textDecoration: 'underline' }}>Go to homepage</Link>
        </div>
      </div>
    );
  }

  // --- Stats ---
  const totalBookings = bookings.length;
  const pendingCount = bookings.filter(b => b.status === 'pending_review').length;
  const confirmedCount = bookings.filter(b => b.status === 'confirmed').length;
  const cancelledCount = bookings.filter(b => b.status === 'cancelled').length;

  // --- Upcoming sessions ---
  const upcomingBookings = bookings
    .filter(b => b.status !== 'cancelled' && b.booking_date >= new Date().toISOString().split('T')[0])
    .sort((a, b) => a.booking_date.localeCompare(b.booking_date));

  // --- Past bookings ---
  const pastBookings = bookings
    .filter(b => b.booking_date < new Date().toISOString().split('T')[0] || b.status === 'cancelled')
    .sort((a, b) => b.booking_date.localeCompare(a.booking_date));

  return (
    <div style={styles.wrapper}>
      <nav style={styles.nav}>
        <div style={styles.navInner}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={styles.brand}>
              <span style={styles.brandRex}>REX</span>
              <span style={styles.brandKapehan}>KAPEHAN</span>
            </div>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={styles.verifiedBadge}>✓ {userEmail}</div>
            <Link href="/" style={{ ...styles.btnOutline, padding: '6px 12px', fontSize: '11px', textDecoration: 'none' }}>
              ← Back to Booking
            </Link>
            <button style={{ ...styles.btnOutline, padding: '6px 12px', fontSize: '11px' }} onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.headerTitle}>My Profile</h1>
            <p style={styles.headerSub}>
              Manage your personal information and view your bookings
              {autoRefresh && <span style={{ color: '#10b981', marginLeft: '12px', fontSize: '12px' }}>● Live</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            {pendingCount > 0 && (
              <span style={{ ...styles.badge('pending_review'), fontSize: '13px', padding: '6px 14px' }}>
                ⏳ {pendingCount} Pending
              </span>
            )}
            {confirmedCount > 0 && (
              <span style={{ ...styles.badge('confirmed'), fontSize: '13px', padding: '6px 14px' }}>
                ✅ {confirmedCount} Confirmed
              </span>
            )}
            {cancelledCount > 0 && (
              <span style={{ ...styles.badge('cancelled'), fontSize: '13px', padding: '6px 14px' }}>
                ❌ {cancelledCount} Cancelled
              </span>
            )}
            <div style={styles.toggle} onClick={toggleAutoRefresh}>
              <span style={{ fontSize: '11px' }}>Auto-refresh</span>
              <div style={styles.toggleDot(autoRefresh)}>
                <div style={styles.toggleKnob(autoRefresh)}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Form */}
        <div style={styles.card}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 700 }}>Edit Profile</h3>
          <p style={{ color: MUTED, fontSize: '13px', marginBottom: '20px' }}>
            Update your personal information. We'll use these details for your bookings.
          </p>

          {profileError && <div style={styles.errorBanner}>{profileError}</div>}
          {profileSuccess && <div style={styles.successBanner}>{profileSuccess}</div>}

          <form onSubmit={handleSaveProfile}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Email Address (read-only)</label>
              <input type="email" value={userEmail} disabled style={{ ...styles.input, opacity: 0.6, cursor: 'not-allowed' }} />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Full Name *</label>
              <input
                type="text"
                required
                placeholder="Juan Dela Cruz"
                style={styles.input}
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                onFocus={e => e.target.style.borderColor = MUSTARD}
                onBlur={e => e.target.style.borderColor = BORDER}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Mobile Number</label>
              <input
                type="tel"
                placeholder="09171234567"
                maxLength={11}
                style={styles.input}
                value={profilePhone}
                onChange={e => setProfilePhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                onFocus={e => e.target.style.borderColor = MUSTARD}
                onBlur={e => e.target.style.borderColor = BORDER}
              />
              <p style={styles.hint}>Must start with 09 and be 11 digits.</p>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Address</label>
              <input
                type="text"
                placeholder="Street, Barangay, City"
                style={styles.input}
                value={profileAddress}
                onChange={e => setProfileAddress(e.target.value)}
                onFocus={e => e.target.style.borderColor = MUSTARD}
                onBlur={e => e.target.style.borderColor = BORDER}
              />
            </div>

            <button
              type="submit"
              disabled={profileLoading}
              style={styles.btnPrimary}
              onMouseEnter={e => !profileLoading && Object.assign(e.target.style, styles.btnPrimaryHover)}
              onMouseLeave={e => !profileLoading && Object.assign(e.target.style, { backgroundColor: MUSTARD })}
            >
              {profileLoading ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </div>

        {/* Bookings Section - Collapsible */}
        <div style={styles.card}>
          <button
            style={styles.collapseBtn}
            onClick={() => setShowBookings(!showBookings)}
          >
            <span>
              📋 Booking History ({totalBookings})
              {pendingCount > 0 && (
                <span style={{ color: MUSTARD, fontSize: '12px', marginLeft: '8px' }}>
                  • {pendingCount} pending
                </span>
              )}
            </span>
            <span style={styles.collapseArrow(showBookings)}>▼</span>
          </button>

          <div style={styles.collapsibleContent(showBookings)}>
            {error && <div style={styles.errorBanner}>{error}</div>}

            {bookings.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>📋</div>
                <div style={styles.emptyTitle}>No bookings yet</div>
                <div style={styles.emptyText}>
                  Head over to the booking page to reserve your first court session.
                </div>
                <Link href="/" style={{ ...styles.btnPrimary, display: 'inline-block', marginTop: '16px', textDecoration: 'none' }}>
                  Book a Court
                </Link>
              </div>
            ) : (
              <>
                {/* Upcoming Sessions */}
                {upcomingBookings.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 700, color: MUSTARD }}>📅 Upcoming Sessions</h4>
                    {upcomingBookings.map((bk, idx) => (
                      <div key={idx} style={{ ...styles.bookingRow, borderBottom: idx === upcomingBookings.length - 1 ? 'none' : `1px solid ${BORDER}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            {isToday(bk.booking_date) ? (
                              <span style={styles.dateTagToday}>TODAY</span>
                            ) : (
                              <span style={styles.dateTag}>{formatDate(bk.booking_date)}</span>
                            )}
                            <span style={{ marginLeft: '8px', fontSize: '13px', color: TEXT_SEC }}>{bk.time_slot}</span>
                          </div>
                          <span style={styles.badge(bk.status)}>{statusConfig[bk.status]?.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Past Bookings */}
                {pastBookings.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 700, color: MUTED }}>📜 Past Bookings</h4>
                    {pastBookings.map((bk, idx) => (
                      <div key={idx} style={{ ...styles.bookingRow, borderBottom: idx === pastBookings.length - 1 ? 'none' : `1px solid ${BORDER}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <span style={styles.dateTag}>{formatDate(bk.booking_date)}</span>
                            <span style={{ marginLeft: '8px', fontSize: '13px', color: TEXT_SEC }}>{bk.time_slot}</span>
                            <span style={{ marginLeft: '8px', fontSize: '11px', color: MUTED }}>• {bk.client_name}</span>
                          </div>
                          <span style={styles.badge(bk.status)}>{statusConfig[bk.status]?.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}