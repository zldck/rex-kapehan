'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MUSTARD = '#D4AF37';
const BLACK = '#0a0a0a';
const CARD = '#141414';
const BORDER = '#2a2a2a';
const MUTED = '#888888';
const TEXT_SEC = '#aaaaaa';

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [adminViewDate, setAdminViewDate] = useState('');
  const [allBookings, setAllBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showReceipt, setShowReceipt] = useState(null);
  const [pendingAlertDismissed, setPendingAlertDismissed] = useState(false);

  const fetchAdminBookings = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError('');

    let query = supabase
      .from('bookings')
      .select('*')
      .order('booking_date', { ascending: true })
      .order('time_slot', { ascending: true });

    if (adminViewDate) {
      query = query.eq('booking_date', adminViewDate);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      setError('Failed to load bookings');
      console.error(fetchError);
    } else {
      setAllBookings(data || []);
    }
    setLoading(false);
  }, [isAuthenticated, adminViewDate]);

  useEffect(() => {
    if (isAuthenticated) fetchAdminBookings();
  }, [fetchAdminBookings]);

  useEffect(() => {
    if (!isAuthenticated || !autoRefresh) return;
    const interval = setInterval(() => fetchAdminBookings(), 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated, autoRefresh, adminViewDate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setAuthLoading(true);

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setIsAuthenticated(true);
      } else {
        setError(data.error || 'Incorrect password. Access denied.');
        setPasswordInput('');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleUpdateStatus = async (ids, newStatus) => {
    setLoading(true);
    setError('');
    setSuccess('');

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: newStatus })
      .in('id', ids);

    if (updateError) {
      setError('Update failed. Please try again.');
      console.error(updateError);
    } else {
      setSuccess('Booking ' + newStatus + ' successfully.');
      fetchAdminBookings();
    }
    setLoading(false);
  };

  const handleDeleteBooking = async (ids, customerName) => {
    setError('');
    if (!confirm('Permanently delete ALL ' + ids.length + ' slot(s) for ' + customerName + '? This cannot be undone.')) return;

    setLoading(true);
    const { error: deleteError } = await supabase
      .from('bookings')
      .delete()
      .in('id', ids);

    if (deleteError) {
      setError('Delete failed. Please try again.');
      console.error(deleteError);
    } else {
      setSuccess('Deleted ' + ids.length + ' reservation(s).');
      setAllBookings(prev => prev.filter(item => !ids.includes(item.id)));
    }
    setLoading(false);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard!');
    setTimeout(() => setSuccess(''), 2000);
  };

  const groupedBookings = useMemo(() => {
    const groups = {};
    allBookings.forEach(bk => {
      const key = bk.client_phone + '-' + bk.booking_date;
      if (!groups[key]) {
        groups[key] = {
          customerKey: key,
          client_name: bk.client_name,
          client_phone: bk.client_phone,
          booking_date: bk.booking_date,
          status: bk.status,
          receipt_url: bk.receipt_url,
          slots: [],
          ids: []
        };
      }
      groups[key].slots.push(bk.time_slot);
      groups[key].ids.push(bk.id);
      if (!groups[key].created_at || (bk.created_at && new Date(bk.created_at) < new Date(groups[key].created_at))) {
        groups[key].created_at = bk.created_at;
      }
      if (bk.status === 'pending_review') groups[key].status = 'pending_review';
      else if (bk.status === 'confirmed' && groups[key].status !== 'pending_review') groups[key].status = 'confirmed';
    });
    return Object.values(groups).sort((a, b) => {
      if (a.status === 'pending_review' && b.status !== 'pending_review') return -1;
      if (b.status === 'pending_review' && a.status !== 'pending_review') return 1;
      if (a.booking_date !== b.booking_date) return a.booking_date.localeCompare(b.booking_date);
      return a.slots[0].localeCompare(b.slots[0]);
    });
  }, [allBookings]);

  const stats = useMemo(() => {
    const total = allBookings.length;
    const confirmed = allBookings.filter(b => b.status === 'confirmed').length;
    const pending = allBookings.filter(b => b.status === 'pending_review').length;
    const cancelled = allBookings.filter(b => b.status === 'cancelled').length;
    return { total, confirmed, pending, cancelled };
  }, [allBookings]);

  const pendingByDate = useMemo(() => {
    const pending = groupedBookings.filter(bk => bk.status === 'pending_review');
    const byDate = {};
    pending.forEach(bk => {
      if (!byDate[bk.booking_date]) byDate[bk.booking_date] = [];
      byDate[bk.booking_date].push(bk);
    });
    return byDate;
  }, [groupedBookings]);

  const pendingDates = Object.keys(pendingByDate).sort();
  const totalPending = stats.pending;

  const filteredBookings = useMemo(() => {
    return groupedBookings.filter(bk => {
      const matchesSearch = 
        bk.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bk.client_phone.includes(searchTerm) ||
        bk.slots.some(s => s.toLowerCase().includes(searchTerm.toLowerCase())) ||
        bk.booking_date.includes(searchTerm);
      const matchesStatus = statusFilter === 'all' || bk.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [groupedBookings, searchTerm, statusFilter]);

  const statusConfig = {
    confirmed: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', label: 'Confirmed' },
    pending_review: { color: MUSTARD, bg: 'rgba(212, 175, 55, 0.1)', label: 'Pending' },
    cancelled: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', label: 'Cancelled' }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return '—';
    const d = new Date(timestamp);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const isToday = (dateStr) => dateStr === new Date().toISOString().split('T')[0];

  const s = {
    wrapper: { minHeight: '100vh', backgroundColor: BLACK, color: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '0 0 40px 0' },
    nav: { borderBottom: '1px solid ' + BORDER, backgroundColor: 'rgba(10,10,10,0.9)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 },
    navInner: { maxWidth: '1200px', margin: '0 auto', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    brand: { fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '2px' },
    brandRex: { color: MUSTARD },
    brandKapehan: { color: '#ffffff', textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' },
    badge: { fontSize: '11px', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '4px 12px', borderRadius: '20px', fontWeight: 600 },
    navBadge: { fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', gap: '6px' },

    authWrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    authCard: { width: '100%', maxWidth: '380px', backgroundColor: CARD, border: '1px solid ' + BORDER, borderRadius: '24px', padding: '40px', boxSizing: 'border-box' },
    authTitle: { fontSize: '24px', fontWeight: 800, textAlign: 'center', margin: '0 0 8px 0' },
    authSub: { fontSize: '13px', color: TEXT_SEC, textAlign: 'center', margin: '0 0 32px 0' },
    input: { width: '100%', backgroundColor: BLACK, border: '1px solid ' + BORDER, padding: '14px 16px', borderRadius: '14px', color: '#ffffff', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' },
    btnPrimary: { width: '100%', padding: '14px', backgroundColor: MUSTARD, color: BLACK, border: 'none', borderRadius: '14px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' },
    btnPrimaryHover: { backgroundColor: '#E5C158' },

    container: { maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' },
    headerTitle: { fontSize: '28px', fontWeight: 800, margin: 0 },
    headerSub: { fontSize: '14px', color: TEXT_SEC, margin: '4px 0 0 0' },

    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' },
    statCard: { backgroundColor: CARD, border: '1px solid ' + BORDER, borderRadius: '16px', padding: '20px', position: 'relative', overflow: 'hidden' },
    statLabel: { fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' },
    statValue: { fontSize: '28px', fontWeight: 800, color: '#ffffff' },
    statValueGreen: { color: '#10b981' },
    statValueOrange: { color: MUSTARD },
    statValueRed: { color: '#ef4444' },
    statPulse: { position: 'absolute', top: '16px', right: '16px', width: '8px', height: '8px', backgroundColor: '#ef4444', borderRadius: '50%', animation: 'pulse 2s infinite' },

    pendingAlert: { backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '16px', padding: '20px 24px', marginBottom: '24px' },
    pendingAlertHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' },
    pendingAlertTitle: { fontSize: '14px', fontWeight: 700, color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' },
    pendingAlertDismiss: { fontSize: '12px', color: MUTED, backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px' },
    pendingDateRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', fontSize: '13px', color: TEXT_SEC },
    pendingDateDot: { width: '6px', height: '6px', backgroundColor: '#ef4444', borderRadius: '50%' },
    pendingDateLink: { color: MUSTARD, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' },
    pendingDateCount: { marginLeft: 'auto', fontSize: '12px', color: MUTED },

    toolbar: { display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '24px', padding: '16px', backgroundColor: CARD, border: '1px solid ' + BORDER, borderRadius: '16px' },
    toolbarGroup: { display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 auto' },
    searchInput: { flex: 1, minWidth: '200px', backgroundColor: BLACK, border: '1px solid ' + BORDER, padding: '10px 14px', borderRadius: '10px', color: '#ffffff', fontSize: '13px', outline: 'none' },
    dateInput: { backgroundColor: BLACK, border: '1px solid ' + BORDER, padding: '10px 14px', borderRadius: '10px', color: '#ffffff', fontSize: '13px', outline: 'none' },
    select: { backgroundColor: BLACK, border: '1px solid ' + BORDER, padding: '10px 14px', borderRadius: '10px', color: '#ffffff', fontSize: '13px', outline: 'none', cursor: 'pointer' },
    toggle: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: TEXT_SEC, cursor: 'pointer', userSelect: 'none' },
    toggleDot: (active) => ({ width: '36px', height: '20px', borderRadius: '10px', backgroundColor: active ? MUSTARD : BORDER, position: 'relative', transition: 'all 0.2s' }),
    toggleKnob: (active) => ({ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#ffffff', position: 'absolute', top: '2px', left: active ? '18px' : '2px', transition: 'all 0.2s' }),
    quickFilterBtn: (active) => ({ padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', border: '1px solid', transition: 'all 0.15s', backgroundColor: active ? MUSTARD : 'transparent', color: active ? BLACK : TEXT_SEC, borderColor: active ? MUSTARD : BORDER }),
    allDatesBtn: (active) => ({ padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', border: '1px solid', transition: 'all 0.15s', backgroundColor: active ? 'rgba(212, 175, 55, 0.15)' : 'transparent', color: active ? MUSTARD : TEXT_SEC, borderColor: active ? MUSTARD : BORDER }),

    alert: (type) => ({ padding: '12px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 500, marginBottom: '16px', border: '1px solid', 
      backgroundColor: type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', 
      color: type === 'error' ? '#f87171' : '#34d399', 
      borderColor: type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)' 
    }),

    tableWrap: { backgroundColor: CARD, border: '1px solid ' + BORDER, borderRadius: '16px', overflow: 'hidden' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
    th: { textAlign: 'left', padding: '14px 20px', color: MUTED, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid ' + BORDER, backgroundColor: BLACK },
    td: { padding: '16px 20px', borderBottom: '1px solid ' + BORDER, color: '#e2e8f0', verticalAlign: 'middle' },
    rowHover: { transition: 'background 0.15s' },
    rowPending: { backgroundColor: 'rgba(212, 175, 55, 0.03)' },

    cardList: { display: 'flex', flexDirection: 'column', gap: '12px' },
    card: { backgroundColor: CARD, border: '1px solid ' + BORDER, borderRadius: '16px', padding: '20px' },
    cardPending: { borderColor: 'rgba(212, 175, 55, 0.3)', backgroundColor: 'rgba(212, 175, 55, 0.03)' },
    cardRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
    cardTime: { fontSize: '18px', fontWeight: 800, color: '#ffffff' },
    statusPill: (status) => ({ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px', color: statusConfig[status]?.color || TEXT_SEC, backgroundColor: statusConfig[status]?.bg || 'rgba(148, 163, 184, 0.1)' }),
    cardInfo: { marginBottom: '12px' },
    cardInfoRow: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: TEXT_SEC, marginBottom: '6px' },
    cardInfoLabel: { color: MUTED, fontWeight: 600 },
    cardActions: { display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid ' + BORDER },

    btnSm: { padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', border: 'none', transition: 'all 0.15s' },
    btnApprove: { backgroundColor: MUSTARD, color: BLACK },
    btnApproveHover: { backgroundColor: '#E5C158' },
    btnCancel: { backgroundColor: '#2a2a2a', color: '#ffffff' },
    btnCancelHover: { backgroundColor: '#3a3a3a' },
    btnDelete: { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' },
    btnDeleteHover: { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
    btnGhost: { backgroundColor: 'transparent', color: MUSTARD, border: '1px solid ' + BORDER, padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' },
    btnGhostHover: { backgroundColor: 'rgba(212, 175, 55, 0.1)' },
    btnIcon: { backgroundColor: 'transparent', color: MUTED, border: '1px solid ' + BORDER, padding: '6px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
    btnIconHover: { backgroundColor: '#2a2a2a', color: '#ffffff' },

    modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    modalCard: { backgroundColor: CARD, border: '1px solid ' + BORDER, borderRadius: '20px', padding: '24px', maxWidth: '400px', width: '100%', textAlign: 'center' },
    modalImg: { width: '100%', borderRadius: '12px', marginBottom: '16px', border: '1px solid ' + BORDER },
    modalTitle: { fontSize: '16px', fontWeight: 700, marginBottom: '4px' },
    modalSub: { fontSize: '13px', color: TEXT_SEC, marginBottom: '16px' },
    btnSecondary: { width: '100%', padding: '12px', borderRadius: '14px', fontSize: '14px', fontWeight: 700, border: 'none', cursor: 'pointer', backgroundColor: '#2a2a2a', color: '#ffffff' },

    empty: { textAlign: 'center', padding: '60px 20px', color: MUTED },
    emptyIcon: { fontSize: '40px', marginBottom: '16px' },
    emptyTitle: { fontSize: '16px', fontWeight: 700, color: TEXT_SEC, marginBottom: '4px' },
    emptyText: { fontSize: '13px', color: '#555555' },

    slotTag: { display: 'inline-block', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(212, 175, 55, 0.1)', color: MUSTARD, border: '1px solid rgba(212, 175, 55, 0.2)', marginRight: '6px', marginBottom: '4px' },
    dateTag: { display: 'inline-block', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)', marginBottom: '6px' },
    dateTagToday: { display: 'inline-block', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', marginBottom: '6px' },
    dateTagPending: { display: 'inline-block', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: '6px' },

    hideMobile: { display: 'none' },
    hideDesktop: { display: 'block' },
  };

  const responsiveStyles = `
    @media (min-width: 768px) {
      .hide-mobile { display: block !important; }
      .hide-desktop { display: none !important; }
    }
  `;

  const globalKeyframes = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(-8px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `;

  if (!isAuthenticated) {
    return (
      <>
        <style>{responsiveStyles}</style>
        <style>{globalKeyframes}</style>
        <div style={s.wrapper}>
          <nav style={s.nav}>
            <div style={s.navInner}>
              <div style={s.brand}>
                <span style={s.brandRex}>REX</span>
                <span style={s.brandKapehan}>KAPEHAN</span>
                <span style={{ color: MUSTARD, marginLeft: '4px' }}>.admin</span>
              </div>
              <div style={s.badge}>Restricted Access</div>
            </div>
          </nav>
          <div style={s.authWrap}>
            <div style={{ ...s.authCard, animation: 'fadeIn 0.4s ease-out' }}>
              <div style={{ fontSize: '40px', textAlign: 'center', marginBottom: '16px' }}>🔒</div>
              <h2 style={s.authTitle}>Admin Terminal</h2>
              <p style={s.authSub}>Rex Kapehan Court Management</p>
              {error && <div style={s.alert('error')}>{error}</div>}
              <form onSubmit={handleLogin}>
                <input type="password" required placeholder="Enter password" style={s.input} value={passwordInput} onChange={e => { setPasswordInput(e.target.value); setError(''); }} onFocus={e => e.target.style.borderColor = MUSTARD} onBlur={e => e.target.style.borderColor = BORDER} />
                <button type="submit" disabled={authLoading} style={s.btnPrimary} onMouseEnter={e => !authLoading && Object.assign(e.target.style, s.btnPrimaryHover)} onMouseLeave={e => !authLoading && Object.assign(e.target.style, { backgroundColor: MUSTARD })}>
                  {authLoading ? 'Authenticating...' : 'Authenticate'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{responsiveStyles}</style>
      <style>{globalKeyframes}</style>

      <div style={s.wrapper}>
        <nav style={s.nav}>
          <div style={s.navInner}>
            <div style={s.brand}>
              <span style={s.brandRex}>REX</span>
              <span style={s.brandKapehan}>KAPEHAN</span>
              <span style={{ color: MUSTARD, marginLeft: '4px' }}>.admin</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {totalPending > 0 && (
                <div style={s.navBadge}>
                  <span style={{ width: '6px', height: '6px', backgroundColor: '#ef4444', borderRadius: '50%', animation: 'pulse 2s infinite' }}></span>
                  {totalPending} pending
                </div>
              )}
              <button style={{ ...s.btnGhost, borderColor: '#ef4444', color: '#ef4444' }} onMouseEnter={e => Object.assign(e.target.style, { backgroundColor: 'rgba(239, 68, 68, 0.1)' })} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'transparent' })} onClick={() => setIsAuthenticated(false)}>🔒 Lock</button>
            </div>
          </div>
        </nav>

        <div style={s.container}>
          <div style={s.header}>
            <div>
              <h1 style={s.headerTitle}>System Management Log</h1>
              <p style={s.headerSub}>Rex Kapehan Backend Operations Panel</p>
            </div>
          </div>

          <div style={s.statsGrid}>
            <div style={s.statCard}>
              <div style={s.statLabel}>Total Bookings</div>
              <div style={s.statValue}>{stats.total}</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>Confirmed</div>
              <div style={{ ...s.statValue, ...s.statValueGreen }}>{stats.confirmed}</div>
            </div>
            <div style={{ ...s.statCard, borderColor: totalPending > 0 ? 'rgba(239, 68, 68, 0.3)' : BORDER }}>
              <div style={s.statLabel}>Pending Review</div>
              <div style={{ ...s.statValue, ...s.statValueRed }}>{stats.pending}</div>
              {totalPending > 0 && <div style={s.statPulse}></div>}
            </div>
            <div style={s.statCard}>
              <div style={s.statLabel}>Cancelled</div>
              <div style={{ ...s.statValue, ...s.statValueRed }}>{stats.cancelled}</div>
            </div>
          </div>

          {totalPending > 0 && !pendingAlertDismissed && (
            <div style={{ ...s.pendingAlert, animation: 'fadeIn 0.3s ease-out' }}>
              <div style={s.pendingAlertHeader}>
                <div style={s.pendingAlertTitle}>
                  <span>🔔</span>
                  {totalPending} pending approval{totalPending > 1 ? 's' : ''} across {pendingDates.length} date{pendingDates.length > 1 ? 's' : ''}
                </div>
                <button style={s.pendingAlertDismiss} onClick={() => setPendingAlertDismissed(true)}>✕ Dismiss</button>
              </div>
              <div>
                {pendingDates.map(date => (
                  <div key={date} style={s.pendingDateRow}>
                    <span style={s.pendingDateDot}></span>
                    <span 
                      style={s.pendingDateLink}
                      onClick={() => { setAdminViewDate(date); setStatusFilter('pending_review'); setPendingAlertDismissed(true); }}
                    >
                      {isToday(date) ? 'Today' : formatDate(date)}
                      {isToday(date) && <span style={{ fontSize: '10px', color: '#10b981', marginLeft: '6px' }}>●</span>}
                    </span>
                    <span style={s.pendingDateCount}>{pendingByDate[date].length} booking{pendingByDate[date].length > 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={s.toolbar}>
            <div style={{ ...s.toolbarGroup, flex: '2 1 300px' }}>
              <input type="text" placeholder="Search by name, phone, time, or date..." style={s.searchInput} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onFocus={e => e.target.style.borderColor = MUSTARD} onBlur={e => e.target.style.borderColor = BORDER} />
            </div>
            <div style={s.toolbarGroup}>
              <button 
                style={s.allDatesBtn(!adminViewDate)} 
                onClick={() => setAdminViewDate('')}
              >
                📅 All Dates
              </button>
              <input type="date" style={s.dateInput} value={adminViewDate} onChange={e => setAdminViewDate(e.target.value)} />
            </div>
            <div style={s.toolbarGroup}>
              <button style={s.quickFilterBtn(statusFilter === 'pending_review')} onClick={() => setStatusFilter(statusFilter === 'pending_review' ? 'all' : 'pending_review')}>⏳ Pending Only</button>
            </div>
            <div style={s.toolbarGroup}>
              <select style={s.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All Status</option>
                <option value="pending_review">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div style={s.toggle} onClick={() => setAutoRefresh(!autoRefresh)}>
              <span>Auto-refresh</span>
              <div style={s.toggleDot(autoRefresh)}><div style={s.toggleKnob(autoRefresh)}></div></div>
            </div>
          </div>

          {error && <div style={{ ...s.alert('error'), animation: 'fadeIn 0.2s ease-out' }}>{error}</div>}
          {success && <div style={{ ...s.alert('success'), animation: 'fadeIn 0.2s ease-out' }}>{success}</div>}

          {loading && filteredBookings.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: MUTED }}><div style={{ fontSize: '24px', marginBottom: '8px' }}>⟳</div>Loading bookings...</div>
          )}

          {!loading && filteredBookings.length === 0 && (
            <div style={s.empty}>
              <div style={s.emptyIcon}>📋</div>
              <div style={s.emptyTitle}>No reservations found</div>
              <div style={s.emptyText}>{searchTerm || statusFilter !== 'all' || adminViewDate ? 'Try adjusting your filters.' : 'No bookings in the system.'}</div>
            </div>
          )}

          <div className="hide-mobile" style={{ ...s.tableWrap, ...s.hideMobile }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Date & Time</th>
                  <th style={s.th}>Customer</th>
                  <th style={s.th}>Phone</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Receipt</th>
                  <th style={s.th}>Booked</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((bk) => (
                  <tr 
                    key={bk.customerKey} 
                    style={{ ...s.rowHover, ...(bk.status === 'pending_review' ? s.rowPending : {}) }} 
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = BLACK} 
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={s.td}>
                      {!adminViewDate && (
                        <div style={{ marginBottom: '4px' }}>
                          {isToday(bk.booking_date) ? (
                            <span style={s.dateTagToday}>TODAY</span>
                          ) : bk.status === 'pending_review' ? (
                            <span style={s.dateTagPending}>{formatDate(bk.booking_date)}</span>
                          ) : (
                            <span style={s.dateTag}>{formatDate(bk.booking_date)}</span>
                          )}
                        </div>
                      )}
                      {adminViewDate && isToday(bk.booking_date) && (
                        <div style={{ marginBottom: '4px' }}>
                          <span style={s.dateTagToday}>TODAY</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '4px' }}>
                        {bk.slots.map(slot => (
                          <span key={slot} style={s.slotTag}>{slot}</span>
                        ))}
                      </div>
                    </td>
                    <td style={s.td}>{bk.client_name}</td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {bk.client_phone}
                        <button style={s.btnIcon} onClick={() => copyToClipboard(bk.client_phone)} title="Copy phone" onMouseEnter={e => Object.assign(e.target.style, s.btnIconHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'transparent', color: MUTED })}>📋</button>
                      </div>
                    </td>
                    <td style={s.td}>
                      <span style={s.statusPill(bk.status)}>{statusConfig[bk.status]?.label || bk.status}</span>
                    </td>
                    <td style={s.td}>
                      {bk.receipt_url ? (
                        <button style={s.btnGhost} onClick={() => setShowReceipt(bk)} onMouseEnter={e => Object.assign(e.target.style, s.btnGhostHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'transparent' })}>View ↗</button>
                      ) : (<span style={{ color: '#555555', fontSize: '12px' }}>—</span>)}
                    </td>
                    <td style={s.td}>
                      <span style={{ fontSize: '12px', color: MUTED }}>{formatDateTime(bk.created_at)}</span>
                    </td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {bk.status !== 'confirmed' && (
                          <button style={{ ...s.btnSm, ...s.btnApprove }} onClick={() => handleUpdateStatus(bk.ids, 'confirmed')} onMouseEnter={e => Object.assign(e.target.style, s.btnApproveHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: MUSTARD })}>Approve</button>
                        )}
                        {bk.status !== 'cancelled' && (
                          <button style={{ ...s.btnSm, ...s.btnCancel }} onClick={() => handleUpdateStatus(bk.ids, 'cancelled')} onMouseEnter={e => Object.assign(e.target.style, s.btnCancelHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: '#2a2a2a' })}>Cancel</button>
                        )}
                        <button style={{ ...s.btnSm, ...s.btnDelete }} onClick={() => handleDeleteBooking(bk.ids, bk.client_name)} onMouseEnter={e => Object.assign(e.target.style, s.btnDeleteHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'rgba(239, 68, 68, 0.1)' })}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="hide-desktop" style={{ ...s.cardList, ...s.hideDesktop }}>
            {filteredBookings.map((bk) => (
              <div key={bk.customerKey} style={{ ...s.card, ...(bk.status === 'pending_review' ? s.cardPending : {}), animation: 'slideIn 0.3s ease-out' }}>
                <div style={s.cardRow}>
                  <div>
                    {!adminViewDate && (
                      <div style={{ marginBottom: '4px' }}>
                        {isToday(bk.booking_date) ? (
                          <span style={s.dateTagToday}>TODAY</span>
                        ) : bk.status === 'pending_review' ? (
                          <span style={s.dateTagPending}>{formatDate(bk.booking_date)}</span>
                        ) : (
                          <span style={s.dateTag}>{formatDate(bk.booking_date)}</span>
                        )}
                      </div>
                    )}
                    {adminViewDate && isToday(bk.booking_date) && (
                      <div style={{ marginBottom: '4px' }}>
                        <span style={s.dateTagToday}>TODAY</span>
                      </div>
                    )}
                    <div style={{ marginTop: '6px' }}>
                      {bk.slots.map(slot => (
                        <span key={slot} style={s.slotTag}>{slot}</span>
                      ))}
                    </div>
                  </div>
                  <span style={s.statusPill(bk.status)}>{statusConfig[bk.status]?.label || bk.status}</span>
                </div>
                <div style={s.cardInfo}>
                  <div style={s.cardInfoRow}><span style={s.cardInfoLabel}>Name:</span>{bk.client_name}</div>
                  <div style={s.cardInfoRow}><span style={s.cardInfoLabel}>Phone:</span>{bk.client_phone}<button style={{ ...s.btnIcon, marginLeft: '4px' }} onClick={() => copyToClipboard(bk.client_phone)} onMouseEnter={e => Object.assign(e.target.style, s.btnIconHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'transparent', color: MUTED })}>📋</button></div>
                  <div style={s.cardInfoRow}><span style={s.cardInfoLabel}>Booked:</span><span style={{ color: MUTED }}>{formatDateTime(bk.created_at)}</span></div>
                </div>
                {bk.receipt_url && (
                  <div style={{ marginBottom: '12px' }}>
                    <button style={s.btnGhost} onClick={() => setShowReceipt(bk)} onMouseEnter={e => Object.assign(e.target.style, s.btnGhostHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'transparent' })}>View Receipt ↗</button>
                  </div>
                )}
                <div style={s.cardActions}>
                  {bk.status !== 'confirmed' && (<button style={{ ...s.btnSm, ...s.btnApprove, flex: 1 }} onClick={() => handleUpdateStatus(bk.ids, 'confirmed')} onMouseEnter={e => Object.assign(e.target.style, s.btnApproveHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: MUSTARD })}>Approve</button>)}
                  {bk.status !== 'cancelled' && (<button style={{ ...s.btnSm, ...s.btnCancel, flex: 1 }} onClick={() => handleUpdateStatus(bk.ids, 'cancelled')} onMouseEnter={e => Object.assign(e.target.style, s.btnCancelHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: '#2a2a2a' })}>Cancel</button>)}
                  <button style={{ ...s.btnSm, ...s.btnDelete, flex: 1 }} onClick={() => handleDeleteBooking(bk.ids, bk.client_name)} onMouseEnter={e => Object.assign(e.target.style, s.btnDeleteHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'rgba(239, 68, 68, 0.1)' })}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showReceipt && (
        <div style={s.modalOverlay} onClick={() => setShowReceipt(null)}>
          <div style={s.modalCard} onClick={e => e.stopPropagation()}>
            <img src={showReceipt.receipt_url} alt="Receipt" style={s.modalImg} />
            <div style={s.modalTitle}>{showReceipt.client_name}</div>
            <div style={s.modalSub}>{showReceipt.slots.join(', ')} • {formatDate(showReceipt.booking_date)}</div>
            <button style={{ ...s.btnPrimary, marginBottom: '8px' }} onClick={() => window.open(showReceipt.receipt_url, '_blank')} onMouseEnter={e => Object.assign(e.target.style, s.btnPrimaryHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: MUSTARD })}>Open in New Tab</button>
            <button style={s.btnSecondary} onClick={() => setShowReceipt(null)} onMouseEnter={e => Object.assign(e.target.style, { backgroundColor: '#3a3a3a' })} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: '#2a2a2a' })}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}