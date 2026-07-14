'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MUSTARD = '#D4AF37';
const MUSTARD_LIGHT = '#E5C158';
const MUSTARD_GLOW = 'rgba(212, 175, 55, 0.4)';
const BLACK = '#0a0a0a';
const CARD = '#141414';
const BORDER = '#2a2a2a';
const MUTED = '#888888';
const TEXT_SEC = '#aaaaaa';
const HOURLY_RATE = 350;

export default function PickleballCourtReservation() {
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [senderName, setSenderName] = useState('');
  const [lastFourDigits, setLastFourDigits] = useState('');
  const [error, setError] = useState('');
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
    if (!supabaseUrl || !supabaseAnonKey) {
      setError('Supabase not configured. Check .env.local and restart npm run dev.');
    } else {
      setSupabaseReady(true);
    }
  }, []);

  const availableShifts = useMemo(() => [
    '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
    '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM',
    '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM'
  ], []);

  const fetchDateAvailability = useCallback(async () => {
    if (!selectedDate || !supabaseReady) return;
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('bookings')
        .select('time_slot')
        .eq('booking_date', selectedDate)
        .in('status', ['confirmed', 'pending_review']);

      if (fetchError) {
        console.error('Supabase error:', fetchError);
        setError('Failed to load availability. Please refresh.');
      } else if (data) {
        setBookedSlots(data.map(item => item.time_slot));
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Connection error. Please check your internet.');
    }
  }, [selectedDate, supabaseReady]);

  useEffect(() => {
    fetchDateAvailability();
    setSelectedSlots([]);
  }, [fetchDateAvailability]);

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const today = new Date();
  const twoWeeksFromNow = new Date();
  twoWeeksFromNow.setDate(today.getDate() + 14);

  const isDateSelectable = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const t = new Date(today.toISOString().split('T')[0] + 'T00:00:00');
    const max = new Date(twoWeeksFromNow.toISOString().split('T')[0] + 'T00:00:00');
    return d >= t && d <= max;
  };

  const isToday = (dateStr) => dateStr === today.toISOString().split('T')[0];

  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({ day, dateStr, selectable: isDateSelectable(dateStr), isToday: isToday(dateStr) });
    }

    return days;
  };

  const calendarDays = generateCalendarDays();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const toggleSlot = (slot) => {
    setError('');
    setSelectedSlots(prev => {
      if (prev.includes(slot)) {
        return prev.filter(s => s !== slot);
      }
      return [...prev, slot];
    });
  };

  const totalPrice = selectedSlots.length * HOURLY_RATE;

  const handleHoldSlot = async (e) => {
    e.preventDefault();
    setError('');
    const phoneRegex = /^09\d{9}$/;
    if (!phoneRegex.test(phone)) {
      setError('Invalid Mobile Number! Must start with 09 and be exactly 11 digits.');
      return;
    }
    if (selectedSlots.length === 0) {
      setError('Please choose at least one available slot.');
      return;
    }

    setLoading(true);
    try {
      for (const slot of selectedSlots) {
        const { data: duplicateCheck } = await supabase
          .from('bookings')
          .select('id')
          .eq('booking_date', selectedDate)
          .eq('time_slot', slot)
          .in('status', ['confirmed', 'pending_review']);

        if (duplicateCheck && duplicateCheck.length > 0) {
          setError(`Sorry, ${slot} was just taken by someone else!`);
          fetchDateAvailability();
          setLoading(false);
          return;
        }
      }

      const bookingsToInsert = selectedSlots.map(slot => ({
        client_name: name,
        client_phone: phone,
        booking_date: selectedDate,
        time_slot: slot,
        status: 'pending_review'
      }));

      const { error: insertError } = await supabase.from('bookings').insert(bookingsToInsert);

      if (insertError) {
        setError('Database error: ' + insertError.message);
      } else {
        setStep(2);
      }
    } catch (err) {
      console.error('Booking error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReceiptUpload = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{4}$/.test(lastFourDigits)) {
      setError('Account number details must be exactly the last 4 digits.');
      return;
    }
    if (!file) {
      setError('Please select a receipt screenshot.');
      return;
    }

    setLoading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const cleanSender = senderName.replace(/[^a-zA-Z0-9]/g, '') || 'user';
      const cleanDate = selectedDate.replace(/-/g, '');
      const targetPathName = `receipt-${cleanDate}-${cleanSender}-${lastFourDigits}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('Receipts')
        .upload(targetPathName, file);

      if (uploadError) {
        setError('File upload failed: ' + uploadError.message);
        setLoading(false);
        return;
      }

      const { data: urlData } = supabase.storage.from('Receipts').getPublicUrl(targetPathName);

      for (const slot of selectedSlots) {
        await supabase
          .from('bookings')
          .update({ receipt_url: urlData.publicUrl })
          .eq('booking_date', selectedDate)
          .eq('time_slot', slot);
      }

      setStep(3);
    } catch (err) {
      console.error('Upload error:', err);
      setError('Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetBooking = () => {
    setStep(1);
    setSelectedSlots([]);
    setName('');
    setPhone('');
    setSenderName('');
    setLastFourDigits('');
    setFile(null);
    setError('');
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
    fetchDateAvailability();
  };

  const goBackToSlots = () => {
    setStep(1);
    setError('');
  };

  const s = {
    wrapper: { minHeight: '100vh', backgroundColor: BLACK, color: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '0 0 40px 0' },
    nav: { borderBottom: `1px solid ${BORDER}`, backgroundColor: 'rgba(10,10,10,0.9)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 },
    navInner: { maxWidth: '1200px', margin: '0 auto', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    brand: { fontSize: '22px', fontWeight: 800, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '2px' },
    brandRex: { color: MUSTARD, textShadow: '0 0 20px rgba(212, 175, 55, 0.3)' },
    brandKapehan: { color: '#ffffff', textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 10px rgba(0,0,0,0.8)' },
    badge: { fontSize: '11px', color: MUSTARD, backgroundColor: 'rgba(212, 175, 55, 0.1)', border: `1px solid rgba(212, 175, 55, 0.2)`, padding: '4px 12px', borderRadius: '20px', fontWeight: 600 },
    mainLayout: { maxWidth: '1200px', margin: '0 auto', padding: '40px 24px', display: 'flex', flexWrap: 'wrap', gap: '48px', alignItems: 'flex-start' },
    heroColumn: { flex: '1 1 400px', minWidth: '300px', paddingTop: '20px' },
    cardColumn: { flex: '1 1 400px', minWidth: '320px', maxWidth: '560px' },
    heroTitle: { fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, lineHeight: 1.05, marginBottom: '16px', letterSpacing: '-1px' },
    heroSub: { fontSize: '16px', color: TEXT_SEC, lineHeight: 1.6, marginBottom: '32px', maxWidth: '440px' },
    featureList: { display: 'flex', flexDirection: 'column', gap: '14px' },
    featureItem: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: TEXT_SEC },
    featureIcon: { width: '32px', height: '32px', borderRadius: '10px', backgroundColor: 'rgba(212, 175, 55, 0.1)', border: `1px solid rgba(212, 175, 55, 0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 },

    card: { width: '100%', backgroundColor: CARD, borderRadius: '24px', border: `1px solid ${BORDER}`, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)' },
    cardHeader: { padding: '24px 24px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
    venueTitle: { fontSize: '20px', fontWeight: 800, margin: 0, letterSpacing: '-0.3px' },
    venueSub: { fontSize: '13px', color: MUTED, margin: '4px 0 0 0' },
    liveBadge: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: MUSTARD, backgroundColor: 'rgba(212, 175, 55, 0.1)', padding: '6px 10px', borderRadius: '8px', whiteSpace: 'nowrap' },
    pulse: { width: '6px', height: '6px', backgroundColor: MUSTARD, borderRadius: '50%', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' },

    priceBanner: { backgroundColor: 'rgba(212, 175, 55, 0.08)', border: `1px solid rgba(212, 175, 55, 0.15)`, borderRadius: '16px', padding: '16px 20px', margin: '0 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    priceLabel: { fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px' },
    priceValue: { fontSize: '24px', fontWeight: 800, color: MUSTARD },
    priceBreakdown: { fontSize: '12px', color: MUTED, marginTop: '2px' },

    content: { padding: '12px 24px 28px' },
    errorBanner: { padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', color: '#f87171', fontSize: '13px', fontWeight: 500, marginBottom: '16px' },
    formGroup: { marginBottom: '20px' },
    label: { display: 'block', fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' },
    input: { width: '100%', backgroundColor: BLACK, border: `1px solid ${BORDER}`, padding: '14px 16px', borderRadius: '14px', color: '#ffffff', fontSize: '14px', outline: 'none', boxSizing: 'border-box', transition: 'all 0.2s' },
    hint: { fontSize: '11px', color: MUTED, marginTop: '6px' },

    backBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px', color: TEXT_SEC, backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '12px 0', marginTop: '16px', fontWeight: 600, transition: 'color 0.2s', width: '100%' },
    backBtnHover: { color: MUSTARD },

    calendarWrap: { marginBottom: '20px' },
    calendarHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
    calendarMonth: { fontSize: '16px', fontWeight: 700, color: '#ffffff' },
    calendarNav: { display: 'flex', gap: '8px' },
    calendarNavBtn: { width: '32px', height: '32px', borderRadius: '8px', backgroundColor: CARD, border: `1px solid ${BORDER}`, color: TEXT_SEC, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', transition: 'all 0.2s' },
    calendarGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' },
    calendarDayName: { textAlign: 'center', fontSize: '10px', fontWeight: '700', color: MUTED, textTransform: 'uppercase', padding: '8px 0', letterSpacing: '0.5px' },
    calendarDay: { aspectRatio: '1', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: '1px solid transparent', transition: 'all 0.2s', position: 'relative', backgroundColor: 'transparent', color: TEXT_SEC },
    calendarDayEmpty: { aspectRatio: '1' },
    calendarDaySelectable: { color: '#ffffff', backgroundColor: CARD, borderColor: BORDER },
    calendarDaySelected: { backgroundColor: MUSTARD, color: BLACK, borderColor: MUSTARD_LIGHT, boxShadow: `0 0 20px ${MUSTARD_GLOW}` },
    calendarDayToday: { color: MUSTARD, fontWeight: '800' },
    calendarDayTodaySelected: { color: BLACK },
    calendarDayDisabled: { color: '#444444', cursor: 'not-allowed' },
    todayBadge: { fontSize: '8px', fontWeight: '700', textTransform: 'uppercase', position: 'absolute', bottom: '3px' },

    legendRow: { display: 'flex', gap: '16px', marginBottom: '12px', marginTop: '4px' },
    legendItem: { fontSize: '12px', color: TEXT_SEC, display: 'flex', alignItems: 'center', gap: '6px' },
    legendDot: (color, border) => ({ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, border: border || 'none' }),
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px', marginBottom: '8px' },
    slotBtn: { padding: '12px 4px', borderRadius: '12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: '1px solid', textAlign: 'center', transition: 'all 0.15s ease', fontFamily: 'inherit', position: 'relative' },
    slotOpen: { backgroundColor: 'rgba(212, 175, 55, 0.06)', borderColor: 'rgba(212, 175, 55, 0.3)', color: MUSTARD },
    slotOpenHover: { backgroundColor: 'rgba(212, 175, 55, 0.15)', borderColor: MUSTARD, boxShadow: `0 0 12px ${MUSTARD_GLOW}` },
    slotSelected: { backgroundColor: MUSTARD, borderColor: MUSTARD_LIGHT, color: BLACK, boxShadow: `0 0 20px ${MUSTARD_GLOW}, 0 0 40px rgba(212, 175, 55, 0.2)` },
    slotTaken: { backgroundColor: BLACK, borderColor: BORDER, color: '#555555', cursor: 'not-allowed', textDecoration: 'line-through' },

    btnPrimary: { width: '100%', padding: '16px', backgroundColor: MUSTARD, color: BLACK, border: 'none', borderRadius: '14px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', boxShadow: `0 4px 20px rgba(212, 175, 55, 0.25)`, transition: 'all 0.2s', fontFamily: 'inherit' },
    btnPrimaryHover: { backgroundColor: MUSTARD_LIGHT, boxShadow: `0 4px 30px rgba(212, 175, 55, 0.45), 0 0 60px rgba(212, 175, 55, 0.15)` },
    btnSecondary: { width: '100%', padding: '16px', backgroundColor: '#2a2a2a', color: '#ffffff', border: 'none', borderRadius: '14px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit' },
    btnSecondaryHover: { backgroundColor: '#3a3a3a' },
    paymentBox: { backgroundColor: BLACK, border: `1px solid ${BORDER}`, padding: '24px', borderRadius: '16px', textAlign: 'center', marginBottom: '20px' },
    qrImage: { width: '100%', maxWidth: '180px', height: 'auto', borderRadius: '12px', border: `2px solid ${BORDER}` },
    fileRow: { display: 'flex', gap: '12px', marginBottom: '16px' },
    fileCol: { flex: 1 },
    fileName: { fontSize: '12px', color: MUSTARD, marginTop: '8px', fontWeight: '600' },
    successWrap: { textAlign: 'center', padding: '40px 0' },
    successIcon: { width: '64px', height: '64px', backgroundColor: 'rgba(212, 175, 55, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '28px', color: MUSTARD },
    successTitle: { fontSize: '22px', fontWeight: '800', margin: '0 0 8px 0' },
    successText: { color: TEXT_SEC, fontSize: '14px', lineHeight: 1.6, margin: '0 0 24px 0', maxWidth: '280px', marginLeft: 'auto', marginRight: 'auto' },
    footer: { textAlign: 'center', marginTop: '48px', paddingBottom: '24px', borderTop: `1px solid ${BORDER}`, paddingTop: '24px' },
    footerText: { fontSize: '12px', color: '#555555' },
    fadeIn: { animation: 'fadeIn 0.3s ease-out' },
    fileInput: { color: MUTED, fontSize: '13px', marginTop: '4px', width: '100%' }
  };

  return (
    <>
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div style={s.wrapper}>
        <nav style={s.nav}>
          <div style={s.navInner}>
            <div style={s.brand}>
              <span style={s.brandRex}>REX</span>
              <span style={s.brandKapehan}>KAPEHAN</span>
            </div>
            <div style={s.badge}>Talisay City</div>
          </div>
        </nav>

        <div style={s.mainLayout}>
          <div style={s.heroColumn}>
            <h1 style={s.heroTitle}>
              Book Your Court.<br />
              <span style={{ color: MUSTARD }}>Play Today.</span>
            </h1>
            <p style={s.heroSub}>
              Real-time availability, secure GCash payments, and instant confirmation. No calls, no waiting.
            </p>
            <div style={s.featureList}>
              <div style={s.featureItem}>
                <div style={s.featureIcon}>⚡</div>
                <span>Live slot availability — no double bookings</span>
              </div>
              <div style={s.featureItem}>
                <div style={s.featureIcon}>💳</div>
                <span>GCash payment with receipt upload</span>
              </div>
              <div style={s.featureItem}>
                <div style={s.featureIcon}>🏸</div>
                <span>₱350/hour • Anselmo Diaz St, Talisay City</span>
              </div>
            </div>
          </div>

          <div style={s.cardColumn}>
            <div style={s.card}>
              <div style={s.cardHeader}>
                <div>
                  <h2 style={s.venueTitle}>Rex Kapehan Court</h2>
                  <p style={s.venueSub}>Anselmo Diaz St, Talisay City • ₱350/hr</p>
                </div>
                <div style={s.liveBadge}>
                  <span style={s.pulse}></span>
                  LIVE
                </div>
              </div>

              {selectedSlots.length > 0 && (
                <div style={{ ...s.priceBanner, ...s.fadeIn }}>
                  <div>
                    <div style={s.priceLabel}>Total</div>
                    <div style={s.priceBreakdown}>{selectedSlots.length} hour{selectedSlots.length > 1 ? 's' : ''} × ₱{HOURLY_RATE}</div>
                  </div>
                  <div style={s.priceValue}>₱{totalPrice.toLocaleString()}</div>
                </div>
              )}

              <div style={s.content}>
                {!supabaseReady && (
                  <div style={{ ...s.errorBanner, ...s.fadeIn }}>
                    ⚠️ Supabase not configured. Make sure your .env.local has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set, then restart <code>npm run dev</code>.
                  </div>
                )}

                {error && <div style={{ ...s.errorBanner, ...s.fadeIn }}>{error}</div>}

                {step === 1 && (
                  <form onSubmit={handleHoldSlot}>
                    <div style={s.fadeIn}>
                      <div style={s.calendarWrap}>
                        <div style={s.calendarHeader}>
                          <div style={s.calendarMonth}>{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</div>
                          <div style={s.calendarNav}>
                            <button 
                              type="button" 
                              style={s.calendarNavBtn} 
                              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                              onMouseEnter={e => { e.target.style.borderColor = MUSTARD; e.target.style.color = MUSTARD; }}
                              onMouseLeave={e => { e.target.style.borderColor = BORDER; e.target.style.color = TEXT_SEC; }}
                            >‹</button>
                            <button 
                              type="button" 
                              style={s.calendarNavBtn} 
                              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                              onMouseEnter={e => { e.target.style.borderColor = MUSTARD; e.target.style.color = MUSTARD; }}
                              onMouseLeave={e => { e.target.style.borderColor = BORDER; e.target.style.color = TEXT_SEC; }}
                            >›</button>
                          </div>
                        </div>
                        <div style={s.calendarGrid}>
                          {dayNames.map(d => (
                            <div key={d} style={s.calendarDayName}>{d}</div>
                          ))}
                          {calendarDays.map((day, i) => {
                            if (!day) return <div key={i} style={s.calendarDayEmpty} />;
                            const isSelected = selectedDate === day.dateStr;
                            const isToday = day.isToday;
                            let dayStyle = { ...s.calendarDay };
                            if (!day.selectable) dayStyle = { ...dayStyle, ...s.calendarDayDisabled };
                            else if (isSelected) dayStyle = { ...dayStyle, ...s.calendarDaySelected };
                            else dayStyle = { ...dayStyle, ...s.calendarDaySelectable };

                            return (
                              <button
                                type="button"
                                key={i}
                                disabled={!day.selectable}
                                onClick={() => { setSelectedDate(day.dateStr); setSelectedSlots([]); setError(''); }}
                                style={dayStyle}
                                onMouseEnter={e => {
                                  if (day.selectable && !isSelected) {
                                    e.target.style.borderColor = MUSTARD;
                                    e.target.style.boxShadow = `0 0 12px ${MUSTARD_GLOW}`;
                                  }
                                }}
                                onMouseLeave={e => {
                                  if (day.selectable && !isSelected) {
                                    e.target.style.borderColor = BORDER;
                                    e.target.style.boxShadow = 'none';
                                  }
                                }}
                              >
                                <span style={{ 
                                  color: isSelected ? BLACK : isToday ? MUSTARD : undefined,
                                  fontWeight: isToday || isSelected ? '800' : '600'
                                }}>{day.day}</span>
                                {isToday && <span style={{ ...s.todayBadge, color: isSelected ? BLACK : MUSTARD }}>TODAY</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {selectedDate && (
                      <div style={s.fadeIn}>
                        <div style={s.formGroup}>
                          <label style={s.label}>Available Schedule — Click to Select Multiple</label>
                          <div style={s.legendRow}>
                            <span style={s.legendItem}>
                              <span style={s.legendDot(MUSTARD)}></span> Available
                            </span>
                            <span style={s.legendItem}>
                              <span style={s.legendDot(BLACK, `1px solid ${BORDER}`)}></span> Reserved
                            </span>
                            <span style={s.legendItem}>
                              <span style={s.legendDot(MUSTARD, `2px solid ${MUSTARD_LIGHT}`)}></span> Selected
                            </span>
                          </div>

                          <div style={s.grid}>
                            {availableShifts.map(slot => {
                              const isTaken = bookedSlots.includes(slot);
                              const isSelected = selectedSlots.includes(slot);
                              let btnStyle = { ...s.slotBtn };
                              if (isTaken) btnStyle = { ...btnStyle, ...s.slotTaken };
                              else if (isSelected) btnStyle = { ...btnStyle, ...s.slotSelected };
                              else btnStyle = { ...btnStyle, ...s.slotOpen };

                              return (
                                <button
                                  type="button"
                                  key={slot}
                                  disabled={isTaken}
                                  onClick={() => toggleSlot(slot)}
                                  style={btnStyle}
                                  onMouseEnter={e => {
                                    if (!isTaken && !isSelected) {
                                      e.target.style.backgroundColor = s.slotOpenHover.backgroundColor;
                                      e.target.style.borderColor = s.slotOpenHover.borderColor;
                                      e.target.style.boxShadow = s.slotOpenHover.boxShadow;
                                    }
                                  }}
                                  onMouseLeave={e => {
                                    if (!isTaken && !isSelected) {
                                      e.target.style.backgroundColor = s.slotOpen.backgroundColor;
                                      e.target.style.borderColor = s.slotOpen.borderColor;
                                      e.target.style.boxShadow = 'none';
                                    }
                                  }}
                                >
                                  {slot}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {selectedSlots.length > 0 && (
                          <div style={s.fadeIn}>
                            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '20px' }}>
                              <div style={s.formGroup}>
                                <label style={s.label}>Full Legal Name</label>
                                <input type="text" required placeholder="Juan Dela Cruz" style={s.input} value={name} onChange={e => setName(e.target.value)} onFocus={e => e.target.style.borderColor = MUSTARD} onBlur={e => e.target.style.borderColor = BORDER} />
                              </div>
                              <div style={s.formGroup}>
                                <label style={s.label}>Mobile Number</label>
                                <input type="tel" required placeholder="09171234567" maxLength={11} style={s.input} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} onFocus={e => e.target.style.borderColor = MUSTARD} onBlur={e => e.target.style.borderColor = BORDER} />
                                <p style={s.hint}>Must start with 09 and be 11 digits</p>
                              </div>
                              <button type="submit" disabled={loading || !supabaseReady} style={s.btnPrimary} onMouseEnter={e => !loading && Object.assign(e.target.style, s.btnPrimaryHover)} onMouseLeave={e => !loading && Object.assign(e.target.style, { backgroundColor: MUSTARD, boxShadow: s.btnPrimary.boxShadow })}>
                                {loading ? 'Locking Slots...' : `Lock ${selectedSlots.length} Slot${selectedSlots.length > 1 ? 's' : ''} & Pay`}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </form>
                )}

                {step === 2 && (
                  <div style={s.fadeIn}>
                    <form onSubmit={handleReceiptUpload}>
                      <div style={s.paymentBox}>
                        <h4 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: '700' }}>🔒 Secure GCash Transfer</h4>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                          <img src="/gcash.jpg" alt="GCash QR" style={s.qrImage} />
                        </div>
                        <p style={{ color: TEXT_SEC, fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                          Pay <strong style={{ color: MUSTARD }}>₱{totalPrice.toLocaleString()}</strong> for {selectedSlots.length} hour{selectedSlots.length > 1 ? 's' : ''}. Screenshot the confirmation receipt.
                        </p>
                      </div>
                      <div style={s.fileRow}>
                        <div style={s.fileCol}>
                          <label style={s.label}>Sender Name</label>
                          <input type="text" required placeholder="Juan D." style={s.input} value={senderName} onChange={e => setSenderName(e.target.value)} onFocus={e => e.target.style.borderColor = MUSTARD} onBlur={e => e.target.style.borderColor = BORDER} />
                        </div>
                        <div style={s.fileCol}>
                          <label style={s.label}>Last 4 Digits</label>
                          <input type="text" required placeholder="4567" maxLength={4} style={s.input} value={lastFourDigits} onChange={e => setLastFourDigits(e.target.value.replace(/\D/g, '').slice(0, 4))} onFocus={e => e.target.style.borderColor = MUSTARD} onBlur={e => e.target.style.borderColor = BORDER} />
                        </div>
                      </div>
                      <div style={s.formGroup}>
                        <label style={s.label}>Upload Receipt</label>
                        <input type="file" accept="image/*" required style={s.fileInput} onChange={e => { setFile(e.target.files[0]); setError(''); }} />
                        {file && <p style={s.fileName}>✓ {file.name}</p>}
                      </div>
                      <button type="submit" disabled={loading} style={s.btnPrimary} onMouseEnter={e => !loading && Object.assign(e.target.style, s.btnPrimaryHover)} onMouseLeave={e => !loading && Object.assign(e.target.style, { backgroundColor: MUSTARD, boxShadow: s.btnPrimary.boxShadow })}>
                        {loading ? 'Verifying...' : 'Submit Receipt'}
                      </button>

                      {/* BACK BUTTON — below Submit Receipt */}
                      <button 
                        type="button" 
                        style={s.backBtn} 
                        onClick={goBackToSlots}
                        onMouseEnter={e => Object.assign(e.target.style, s.backBtnHover)}
                        onMouseLeave={e => Object.assign(e.target.style, { color: TEXT_SEC })}
                      >
                        ← Back to slot selection
                      </button>
                    </form>
                  </div>
                )}

                {step === 3 && (
                  <div style={{ ...s.successWrap, ...s.fadeIn }}>
                    <div style={s.successIcon}>✓</div>
                    <h3 style={s.successTitle}>Booking Confirmed</h3>
                    <p style={s.successText}>
                      {selectedSlots.length} slot{selectedSlots.length > 1 ? 's' : ''} locked for ₱{totalPrice.toLocaleString()}. We'll verify your receipt and confirm shortly.
                    </p>
                    <button onClick={resetBooking} style={s.btnPrimary} onMouseEnter={e => Object.assign(e.target.style, s.btnPrimaryHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: MUSTARD, boxShadow: s.btnPrimary.boxShadow })}>
                      Book Another Session
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={s.footer}>
          <p style={s.footerText}>© 2026 Rex Kapehan • Talisay City • Secured by Supabase</p>
        </div>
      </div>
    </>
  );
}