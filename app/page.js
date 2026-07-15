'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

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
  const [userEmail, setUserEmail] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [pendingSlots, setPendingSlots] = useState([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [senderName, setSenderName] = useState('');
  const [lastFourDigits, setLastFourDigits] = useState('');
  const [error, setError] = useState('');
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [paymentDeadline, setPaymentDeadline] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [pendingBookingIds, setPendingBookingIds] = useState([]);

  // Auth modal state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authStep, setAuthStep] = useState('check');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authOtpInput, setAuthOtpInput] = useState('');
  const [authCountdown, setAuthCountdown] = useState(0);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // --- Load saved data and check Supabase ---
  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setError('Supabase not configured.');
      setSupabaseReady(false);
      return;
    }
    setSupabaseReady(true);
    setError('');

    const savedEmail = localStorage.getItem('rk_verified_email');
    const savedName = localStorage.getItem('rk_user_name');
    const savedPhone = localStorage.getItem('rk_user_phone');
    const loggedIn = localStorage.getItem('rk_user_logged_in');

    if (savedEmail) {
      setUserEmail(savedEmail);
      setIsLoggedIn(loggedIn === 'true');
    }
    if (savedName) setName(savedName);
    if (savedPhone) setPhone(savedPhone);

    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
  }, []);

  // --- Auth countdown timer ---
  useEffect(() => {
    let timer;
    if (authCountdown > 0) {
      timer = setTimeout(() => setAuthCountdown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [authCountdown]);

  // --- Payment timer ---
  useEffect(() => {
    if (paymentDeadline && step === 2 && pendingBookingIds.length > 0) {
      const updateTimer = () => {
        const remaining = Math.max(0, Math.floor((paymentDeadline - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) {
          handleAutoCancel();
        }
      };
      updateTimer();
      const timer = setInterval(updateTimer, 1000);
      return () => clearInterval(timer);
    }
  }, [paymentDeadline, step, pendingBookingIds]);

  // --- Available Shifts (UPDATED: 6am-9am, 4pm-12am) ---
  const availableShifts = useMemo(() => [
    // Morning block: 6:00 AM - 9:00 AM
    '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM',
    // Afternoon/Evening block: 4:00 PM - 12:00 AM
    '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM'
  ], []);

  const fetchDateAvailability = useCallback(async () => {
    if (!selectedDate || !supabaseReady || !supabase) return;
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('bookings')
        .select('time_slot, status')
        .eq('booking_date', selectedDate)
        .in('status', ['confirmed', 'pending_review']);

      if (fetchError) {
        console.error('Availability fetch error:', fetchError);
        setError('Failed to load availability.');
      } else if (data) {
        setBookedSlots(data.filter(item => item.status === 'confirmed').map(item => item.time_slot));
        setPendingSlots(data.filter(item => item.status === 'pending_review').map(item => item.time_slot));
      }
    } catch (err) {
      console.error('Availability fetch error:', err);
      setError('Connection error.');
    }
  }, [selectedDate, supabaseReady]);

  useEffect(() => {
    if (supabaseReady) {
      fetchDateAvailability();
      setSelectedSlots([]);
    }
  }, [fetchDateAvailability, supabaseReady]);

  // --- Hold slots (called after successful booking login) ---
  const holdSlots = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bookings/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          email: userEmail,
          date: selectedDate,
          slots: selectedSlots,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError(`Slots just taken: ${data.takenSlots?.join(', ') || ''}`);
          fetchDateAvailability();
        } else {
          setError(data.error || 'Failed to reserve slots');
        }
        setLoading(false);
        return;
      }

      setPendingBookingIds(data.bookingIds || []);
      setPaymentDeadline(Date.now() + 15 * 60 * 1000);
      setStep(2);
    } catch (err) {
      console.error('Booking error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // --- Authentication handlers ---

  // Pure login (from the "Log In" button) – just sets user, no booking
  const loginUserOnly = (email) => {
    localStorage.setItem('rk_verified_email', email);
    localStorage.setItem('rk_user_logged_in', 'true');
    setUserEmail(email);
    setIsLoggedIn(true);
    const savedName = localStorage.getItem('rk_user_name');
    const savedPhone = localStorage.getItem('rk_user_phone');
    if (savedName) setName(savedName);
    if (savedPhone) setPhone(savedPhone);
    setAuthModalOpen(false);
    setAuthStep('check');
    setAuthPassword('');
    setAuthConfirmPassword('');
    setAuthOtpInput('');
    setAuthCountdown(0);
    setAuthError('');
  };

  // Login and proceed to booking (from "Reserve & Pay")
  const loginUserAndBook = (email) => {
    loginUserOnly(email);
    holdSlots();
  };

  const handleLoginClick = () => {
    setAuthModalOpen(true);
    setAuthError('');
    const storedEmail = localStorage.getItem('rk_verified_email');
    if (storedEmail) {
      setAuthEmail(storedEmail);
      fetch('/api/auth/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: storedEmail }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.hasPassword) {
            setAuthStep('login');
          } else {
            sendOtp(storedEmail);
            setAuthStep('otp');
          }
        })
        .catch(() => setAuthStep('email'));
    } else {
      setAuthStep('email');
    }
  };

  const handleReserveClick = async (e) => {
    e.preventDefault();
    setError('');

    if (!supabaseReady) {
      setError('Supabase is not configured. Please try again later.');
      return;
    }

    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    const phoneRegex = /^09\d{9}$/;
    if (!phoneRegex.test(phone)) {
      setError('Invalid Mobile Number! Must start with 09 and be exactly 11 digits.');
      return;
    }
    if (selectedSlots.length === 0) {
      setError('Please choose at least one available slot.');
      return;
    }

    if (isLoggedIn && userEmail) {
      await holdSlots();
      return;
    }

    setAuthModalOpen(true);
    setAuthError('');
    setAuthStep('check');
    const storedEmail = localStorage.getItem('rk_verified_email');
    if (storedEmail) {
      setAuthEmail(storedEmail);
      try {
        const res = await fetch('/api/auth/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: storedEmail }),
        });
        const data = await res.json();
        if (!res.ok) {
          setAuthError(data.error || 'Check failed.');
          setAuthStep('login');
          return;
        }
        if (data.hasPassword) {
          setAuthStep('login');
        } else {
          await sendOtp(storedEmail);
          setAuthStep('otp');
        }
      } catch (err) {
        console.error('Check error:', err);
        setAuthError('Unable to verify account. Please try again.');
        setAuthStep('login');
      }
    } else {
      setAuthStep('email');
    }
  };

  const sendOtp = async (email) => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.hasPassword) {
          setAuthError('This email already has a password. Please log in.');
          setAuthStep('login');
          return;
        }
        setAuthError(data.error || 'Failed to send OTP.');
        return;
      }
      setAuthCountdown(300);
      setAuthStep('otp');
    } catch (err) {
      console.error('Send OTP error:', err);
      setAuthError('Network error. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setAuthLoading(true);
    setAuthError('');
    if (authCountdown <= 0) {
      setAuthError('OTP expired. Request a new one.');
      setAuthLoading(false);
      return;
    }
    if (!/^\d{6}$/.test(authOtpInput)) {
      setAuthError('Please enter the 6-digit code.');
      setAuthLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, code: authOtpInput, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Verification failed.');
        setAuthLoading(false);
        return;
      }
      setAuthStep('setPassword');
      setAuthOtpInput('');
      setAuthError('');
    } catch (err) {
      console.error('Verify error:', err);
      setAuthError('Verification failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSetPassword = async () => {
    setAuthLoading(true);
    setAuthError('');
    if (authPassword.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      setAuthLoading(false);
      return;
    }
    if (authPassword !== authConfirmPassword) {
      setAuthError('Passwords do not match.');
      setAuthLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword, action: 'setPassword' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Failed to set password.');
        setAuthLoading(false);
        return;
      }
      if (selectedSlots.length > 0) {
        loginUserAndBook(authEmail);
      } else {
        loginUserOnly(authEmail);
      }
    } catch (err) {
      console.error('Set password error:', err);
      setAuthError('Failed to set password.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    if (!authPassword) {
      setAuthError('Please enter your password.');
      setAuthLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword, action: 'login' }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setAuthError('No password set. We\'ll send an OTP to set one.');
          await sendOtp(authEmail);
          return;
        }
        setAuthError(data.error || 'Login failed.');
        setAuthLoading(false);
        return;
      }
      if (selectedSlots.length > 0) {
        loginUserAndBook(authEmail);
      } else {
        loginUserOnly(authEmail);
      }
    } catch (err) {
      console.error('Login error:', err);
      setAuthError('Login failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  // --- Auto-cancel & back to slots ---
  const handleAutoCancel = async () => {
    try {
      await fetch('/api/bookings/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          date: selectedDate,
          slots: selectedSlots,
        }),
      });
    } catch (err) {
      console.error('Auto-cancel error:', err);
    }
    setError('Payment time expired. Your slots have been released.');
    setStep(1);
    setPaymentDeadline(null);
    setPendingBookingIds([]);
    fetchDateAvailability();
  };

  const handleBackToSlots = async () => {
    setLoading(true);
    try {
      await fetch('/api/bookings/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          date: selectedDate,
          slots: selectedSlots,
        }),
      });
    } catch (err) {
      console.error('Back to slots error:', err);
    } finally {
      setLoading(false);
      setStep(1);
      setPaymentDeadline(null);
      setPendingBookingIds([]);
      setError('');
      fetchDateAvailability();
    }
  };

  // --- Receipt upload ---
  const handleReceiptUpload = async (e) => {
    e.preventDefault();
    setError('');
    if (!file) {
      setError('Please select a receipt screenshot.');
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Only JPG, PNG, and WebP images are allowed.');
      return;
    }
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File too large. Maximum size is 5MB.');
      return;
    }
    if (!/^\d{4}$/.test(lastFourDigits)) {
      setError('Account number details must be exactly the last 4 digits.');
      return;
    }
    setLoading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const cleanSender = senderName.replace(/[^a-zA-Z0-9]/g, '') || 'user';
      const cleanDate = selectedDate.replace(/-/g, '');
      const targetPathName = `receipt-${cleanDate}-${cleanSender}-${lastFourDigits}-${Date.now()}.${fileExt}`;

      if (!supabase) {
        setError('Supabase not configured.');
        setLoading(false);
        return;
      }

      const { error: uploadError } = await supabase.storage.from('Receipts').upload(targetPathName, file);
      if (uploadError) {
        console.error('Receipt upload error:', uploadError);
        setError('Failed to upload receipt. Please try again.');
        setLoading(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('Receipts').getPublicUrl(targetPathName);
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ receipt_url: urlData.publicUrl })
        .eq('booking_date', selectedDate)
        .eq('client_email', userEmail)
        .in('time_slot', selectedSlots);

      if (updateError) {
        console.error('Receipt URL update error:', updateError);
        setError('Failed to link receipt to booking. Please contact support.');
        setLoading(false);
        return;
      }

      localStorage.setItem('rk_user_name', name);
      localStorage.setItem('rk_user_phone', phone);
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
    setPaymentDeadline(null);
    setTimeLeft(0);
    setPendingBookingIds([]);
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
    fetchDateAvailability();
  };

  const handleLogout = () => {
    localStorage.removeItem('rk_verified_email');
    localStorage.removeItem('rk_user_logged_in');
    setUserEmail('');
    setIsLoggedIn(false);
    setSelectedSlots([]);
    setName('');
    setPhone('');
    setSenderName('');
    setLastFourDigits('');
    setFile(null);
    setStep(1);
    setError('');
    setPendingBookingIds([]);
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
  };

  // --- Calendar helpers ---
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const today = useMemo(() => new Date(), []);
  const twoWeeksFromNow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d;
  }, []);

  const isDateSelectable = useCallback((dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const t = new Date(today.toISOString().split('T')[0] + 'T00:00:00');
    const max = new Date(twoWeeksFromNow.toISOString().split('T')[0] + 'T00:00:00');
    return d >= t && d <= max;
  }, [today, twoWeeksFromNow]);

  const isToday = useCallback((dateStr) => {
    return dateStr === new Date().toISOString().split('T')[0];
  }, []);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({ day, dateStr, selectable: isDateSelectable(dateStr), isToday: isToday(dateStr) });
    }
    return days;
  }, [currentMonth, isDateSelectable, isToday]);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const toggleSlot = (slot) => {
    setError('');
    setSelectedSlots(prev => {
      if (prev.includes(slot)) return prev.filter(s => s !== slot);
      return [...prev, slot];
    });
  };

  const totalPrice = selectedSlots.length * HOURLY_RATE;

  const formatCountdown = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // --- STYLES ---
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
    infoBanner: { padding: '12px 16px', backgroundColor: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '12px', color: '#38bdf8', fontSize: '13px', fontWeight: 500, marginBottom: '16px' },
    successBanner: { padding: '12px 16px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '12px', color: '#34d399', fontSize: '13px', fontWeight: 500, marginBottom: '16px' },
    warningBanner: { padding: '12px 16px', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '12px', color: '#fbbf24', fontSize: '13px', fontWeight: 500, marginBottom: '16px', lineHeight: 1.6 },
    countdownBanner: { padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', color: '#f87171', fontSize: '14px', fontWeight: 700, marginBottom: '16px', textAlign: 'center' },
    countdownNumber: { fontSize: '20px', fontFamily: 'monospace' },
    formGroup: { marginBottom: '20px' },
    label: { display: 'block', fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' },
    input: { width: '100%', backgroundColor: BLACK, border: `1px solid ${BORDER}`, padding: '14px 16px', borderRadius: '14px', color: '#ffffff', fontSize: '14px', outline: 'none', boxSizing: 'border-box', transition: 'all 0.2s' },
    hint: { fontSize: '11px', color: MUTED, marginTop: '6px' },
    backBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px', color: TEXT_SEC, backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '12px 0', marginTop: '16px', fontWeight: 600, transition: 'color 0.2s', width: '100%' },
    backBtnHover: { color: MUSTARD },
    calendarWrap: { marginBottom: '20px' },
    calendarHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
    calendarMonth: { fontSize: '16px', fontWeight: '700', color: '#ffffff' },
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
    legendRow: { display: 'flex', gap: '16px', marginBottom: '12px', marginTop: '4px', flexWrap: 'wrap' },
    legendItem: { fontSize: '12px', color: TEXT_SEC, display: 'flex', alignItems: 'center', gap: '6px' },
    legendDot: (color, border) => ({ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, border: border || 'none' }),
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px', marginBottom: '8px' },
    slotBtn: { padding: '12px 4px', borderRadius: '12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: '1px solid', textAlign: 'center', transition: 'all 0.15s ease', fontFamily: 'inherit', position: 'relative' },
    slotOpen: { backgroundColor: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#10b981' },
    slotOpenHover: { backgroundColor: 'rgba(16, 185, 129, 0.2)', borderColor: '#10b981', boxShadow: '0 0 12px rgba(16, 185, 129, 0.3)' },
    slotSelected: { backgroundColor: MUSTARD, borderColor: MUSTARD_LIGHT, color: BLACK, boxShadow: `0 0 20px ${MUSTARD_GLOW}, 0 0 40px rgba(212, 175, 55, 0.2)` },
    slotTaken: { backgroundColor: BLACK, borderColor: BORDER, color: '#555555', cursor: 'not-allowed', textDecoration: 'line-through' },
    slotPending: { backgroundColor: 'rgba(249, 115, 22, 0.1)', borderColor: 'rgba(249, 115, 22, 0.5)', color: '#f97316', cursor: 'not-allowed' },
    btnPrimary: { width: '100%', padding: '16px', backgroundColor: MUSTARD, color: BLACK, border: 'none', borderRadius: '14px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', boxShadow: `0 4px 20px rgba(212, 175, 55, 0.25)`, transition: 'all 0.2s', fontFamily: 'inherit' },
    btnPrimaryHover: { backgroundColor: MUSTARD_LIGHT, boxShadow: `0 4px 30px rgba(212, 175, 55, 0.45), 0 0 60px rgba(212, 175, 55, 0.15)` },
    btnSecondary: { width: '100%', padding: '16px', backgroundColor: '#2a2a2a', color: '#ffffff', border: 'none', borderRadius: '14px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit' },
    btnSecondaryHover: { backgroundColor: '#3a3a3a' },
    btnOutline: { width: '100%', padding: '14px', backgroundColor: 'transparent', color: TEXT_SEC, border: `1px solid ${BORDER}`, borderRadius: '14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit' },
    btnOutlineHover: { borderColor: MUSTARD, color: MUSTARD },
    paymentBox: { backgroundColor: BLACK, border: `1px solid ${BORDER}`, padding: '24px', borderRadius: '16px', textAlign: 'center', marginBottom: '20px' },
    qrImage: { width: '100%', maxWidth: '180px', height: 'auto', borderRadius: '12px', border: `2px solid ${BORDER}` },
    fileRow: { display: 'flex', gap: '12px', marginBottom: '16px' },
    fileCol: { flex: 1 },
    fileName: { fontSize: '12px', color: MUSTARD, marginTop: '8px', fontWeight: '600' },
    successWrap: { textAlign: 'center', padding: '40px 0' },
    successIcon: { width: '64px', height: '64px', backgroundColor: 'rgba(212, 175, 55, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '28px', color: MUSTARD },
    successTitle: { fontSize: '22px', fontWeight: 800, margin: '0 0 8px 0' },
    successText: { color: TEXT_SEC, fontSize: '14px', lineHeight: 1.6, margin: '0 0 24px 0', maxWidth: '320px', marginLeft: 'auto', marginRight: 'auto' },
    footer: { textAlign: 'center', marginTop: '48px', paddingBottom: '24px', borderTop: `1px solid ${BORDER}`, paddingTop: '24px' },
    footerText: { fontSize: '12px', color: '#555555' },
    fadeIn: { animation: 'fadeIn 0.3s ease-out' },
    fileInput: { color: MUTED, fontSize: '13px', marginTop: '4px', width: '100%' },
    verifiedBadge: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '6px 12px', borderRadius: '20px' },
    modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    modalCard: { backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '24px', padding: '32px', maxWidth: '420px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)', position: 'relative' },
    modalHeader: { textAlign: 'center', marginBottom: '24px' },
    modalIcon: { fontSize: '40px', marginBottom: '12px' },
    modalTitle: { fontSize: '20px', fontWeight: 800, margin: '0 0 8px' },
    modalSub: { fontSize: '13px', color: TEXT_SEC, margin: 0 },
    closeBtn: { position: 'absolute', top: '16px', right: '20px', backgroundColor: 'transparent', border: 'none', color: MUTED, fontSize: '24px', cursor: 'pointer', lineHeight: 1, padding: '4px' },
    otpBox: { backgroundColor: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '16px', padding: '20px', marginBottom: '20px', textAlign: 'center' },
    otpTimer: { fontSize: '12px', color: MUTED },
  };

  // --- JSX ---
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {isLoggedIn && userEmail && (
                <div style={s.verifiedBadge}>
                  <span>✓</span> {userEmail}
                </div>
              )}
              <div style={s.badge}>Talisay City</div>
              {isLoggedIn && userEmail ? (
                <>
                  <Link href="/dashboard" style={{ ...s.btnOutline, width: 'auto', padding: '6px 12px', fontSize: '11px', textDecoration: 'none' }}>
                    📋 My Bookings
                  </Link>
                  <button style={{ ...s.btnOutline, width: 'auto', padding: '6px 12px', fontSize: '11px' }} onClick={handleLogout}>
                    Logout
                  </button>
                </>
              ) : (
                <button
                  style={{ ...s.btnOutline, width: 'auto', padding: '6px 12px', fontSize: '11px' }}
                  onClick={handleLoginClick}
                >
                  Log In
                </button>
              )}
            </div>
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
              <div style={s.featureItem}>
                <div style={s.featureIcon}>🔑</div>
                <span>Login to auto-fill your details</span>
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
                    ⚠️ Supabase not configured. Please check your environment variables.
                  </div>
                )}

                {error && <div style={{ ...s.errorBanner, ...s.fadeIn }}>{error}</div>}

                {supabaseReady && !isLoggedIn && (
                  <div style={{ ...s.infoBanner, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🔑</span>
                    <span>Click "Log In" above or "Reserve & Pay" to authenticate.</span>
                  </div>
                )}

                {isLoggedIn && (name || phone) && (
                  <div style={{ ...s.successBanner, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>✅</span> Logged in as {userEmail}. Details pre-filled.
                  </div>
                )}

                {step === 1 && supabaseReady && (
                  <form onSubmit={handleReserveClick}>
                    <div style={s.fadeIn}>
                      <div style={s.calendarWrap}>
                        <div style={s.calendarHeader}>
                          <div style={s.calendarMonth}>{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</div>
                          <div style={s.calendarNav}>
                            <button type="button" style={s.calendarNavBtn} onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                              onMouseEnter={e => { e.target.style.borderColor = MUSTARD; e.target.style.color = MUSTARD; }}
                              onMouseLeave={e => { e.target.style.borderColor = BORDER; e.target.style.color = TEXT_SEC; }}>‹</button>
                            <button type="button" style={s.calendarNavBtn} onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                              onMouseEnter={e => { e.target.style.borderColor = MUSTARD; e.target.style.color = MUSTARD; }}
                              onMouseLeave={e => { e.target.style.borderColor = BORDER; e.target.style.color = TEXT_SEC; }}>›</button>
                          </div>
                        </div>
                        <div style={s.calendarGrid}>
                          {dayNames.map(d => <div key={d} style={s.calendarDayName}>{d}</div>)}
                          {calendarDays.map((day, i) => {
                            if (!day) return <div key={i} style={s.calendarDayEmpty} />;
                            const isSelected = selectedDate === day.dateStr;
                            const isToday = day.isToday;
                            let dayStyle = { ...s.calendarDay };
                            if (!day.selectable) dayStyle = { ...dayStyle, ...s.calendarDayDisabled };
                            else if (isSelected) dayStyle = { ...dayStyle, ...s.calendarDaySelected };
                            else dayStyle = { ...dayStyle, ...s.calendarDaySelectable };
                            return (
                              <button type="button" key={i} disabled={!day.selectable}
                                onClick={() => { setSelectedDate(day.dateStr); setSelectedSlots([]); setError(''); }}
                                style={dayStyle}
                                onMouseEnter={e => { if (day.selectable && !isSelected) { e.target.style.borderColor = MUSTARD; e.target.style.boxShadow = `0 0 12px ${MUSTARD_GLOW}`; }}}
                                onMouseLeave={e => { if (day.selectable && !isSelected) { e.target.style.borderColor = BORDER; e.target.style.boxShadow = 'none'; }}}>
                                <span style={{ color: isSelected ? BLACK : isToday ? MUSTARD : undefined, fontWeight: isToday || isSelected ? '800' : '600' }}>{day.day}</span>
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
                            <span style={s.legendItem}><span style={s.legendDot('#10b981')}></span> Open</span>
                            <span style={s.legendItem}><span style={s.legendDot('rgba(249, 115, 22, 0.3)', '1px solid #f97316')}></span> Pending Review</span>
                            <span style={s.legendItem}><span style={s.legendDot(BLACK, `1px solid ${BORDER}`)}></span> Booked</span>
                            <span style={s.legendItem}><span style={s.legendDot(MUSTARD, `2px solid ${MUSTARD_LIGHT}`)}></span> Selected</span>
                          </div>

                          <div style={s.grid}>
                            {availableShifts.map(slot => {
                              const isTaken = bookedSlots.includes(slot);
                              const isPending = pendingSlots.includes(slot);
                              const isSelected = selectedSlots.includes(slot);
                              let btnStyle = { ...s.slotBtn };
                              if (isTaken) btnStyle = { ...btnStyle, ...s.slotTaken };
                              else if (isPending) btnStyle = { ...btnStyle, ...s.slotPending };
                              else if (isSelected) btnStyle = { ...btnStyle, ...s.slotSelected };
                              else btnStyle = { ...btnStyle, ...s.slotOpen };

                              return (
                                <button type="button" key={slot} disabled={isTaken || isPending}
                                  onClick={() => toggleSlot(slot)}
                                  style={btnStyle}
                                  onMouseEnter={e => { if (!isTaken && !isPending && !isSelected) { e.target.style.backgroundColor = s.slotOpenHover.backgroundColor; e.target.style.borderColor = s.slotOpenHover.borderColor; e.target.style.boxShadow = s.slotOpenHover.boxShadow; }}}
                                  onMouseLeave={e => { if (!isTaken && !isPending && !isSelected) { e.target.style.backgroundColor = s.slotOpen.backgroundColor; e.target.style.borderColor = s.slotOpen.borderColor; e.target.style.boxShadow = 'none'; }}}>
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
                                <p style={s.hint}>Must start with 09 and be 11 digits. Used for contact only.</p>
                              </div>
                              <button type="submit" disabled={loading || !supabaseReady} style={s.btnPrimary} onMouseEnter={e => !loading && Object.assign(e.target.style, s.btnPrimaryHover)} onMouseLeave={e => !loading && Object.assign(e.target.style, { backgroundColor: MUSTARD, boxShadow: s.btnPrimary.boxShadow })}>
                                {loading ? 'Reserving...' : `Reserve ${selectedSlots.length} Slot${selectedSlots.length > 1 ? 's' : ''} & Pay`}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </form>
                )}

                {!supabaseReady && step === 1 && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: MUTED }}>
                    <p>Please configure Supabase to book a court.</p>
                    <p style={{ fontSize: '12px', marginTop: '8px' }}>
                      Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
                    </p>
                  </div>
                )}

                {step === 2 && (
                  <div style={s.fadeIn}>
                    {timeLeft > 0 && (
                      <div style={{ ...s.countdownBanner, ...s.fadeIn }}>
                        ⏱️ Complete payment in{' '}
                        <span style={s.countdownNumber}>
                          {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                        </span>
                        {' '}or slots will be released
                      </div>
                    )}
                    <div style={{ ...s.warningBanner, marginBottom: '20px' }}>
                      <strong>⏳ Your slots are reserved! Complete payment to confirm.</strong><br /><br />
                      Once approved, no-shows will have <strong>no refund</strong> unless due to weather conditions.<br /><br />
                      <strong>No cancellations</strong> — but you can contact admin for rescheduling at least 1 hour before your slot. Thank you!
                    </div>
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
                        <input type="file" accept="image/jpeg,image/png,image/webp" required style={s.fileInput} onChange={e => { setFile(e.target.files[0]); setError(''); }} />
                        {file && <p style={s.fileName}>✓ {file.name}</p>}
                      </div>
                      <button type="submit" disabled={loading} style={s.btnPrimary} onMouseEnter={e => !loading && Object.assign(e.target.style, s.btnPrimaryHover)} onMouseLeave={e => !loading && Object.assign(e.target.style, { backgroundColor: MUSTARD, boxShadow: s.btnPrimary.boxShadow })}>
                        {loading ? 'Verifying...' : 'Submit Receipt'}
                      </button>

                      <button type="button" style={s.backBtn} onClick={handleBackToSlots}
                        onMouseEnter={e => Object.assign(e.target.style, s.backBtnHover)}
                        onMouseLeave={e => Object.assign(e.target.style, { color: TEXT_SEC })}>
                        ← Back to slot selection
                      </button>
                    </form>
                  </div>
                )}

                {step === 3 && (
                  <div style={{ ...s.successWrap, ...s.fadeIn }}>
                    <div style={s.successIcon}>✓</div>
                    <h3 style={s.successTitle}>Reservation Confirmed</h3>
                    <p style={s.successText}>
                      {selectedSlots.length} slot{selectedSlots.length > 1 ? 's' : ''} reserved for ₱{totalPrice.toLocaleString()}. We'll verify your receipt and confirm shortly.
                    </p>
                    <div style={{ ...s.warningBanner, textAlign: 'left', maxWidth: '320px', margin: '0 auto 24px' }}>
                      <strong>📋 Important Reminders:</strong><br /><br />
                      • Your booking is <strong>pending review</strong><br />
                      • No-shows = <strong>no refund</strong> (weather exempt)<br />
                      • No cancellations — <strong>reschedule only</strong><br />
                      • Contact admin <strong>1 hour before</strong> for rescheds<br />
                      • Bring your receipt screenshot as proof
                    </div>
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

      {/* Auth Modal */}
      {authModalOpen && (
        <div style={s.modalOverlay} onClick={() => setAuthModalOpen(false)}>
          <div style={s.modalCard} onClick={e => e.stopPropagation()}>
            <button style={s.closeBtn} onClick={() => setAuthModalOpen(false)}>✕</button>

            {authStep === 'email' && (
              <>
                <div style={s.modalHeader}>
                  <div style={s.modalIcon}>📧</div>
                  <h3 style={s.modalTitle}>Enter Your Email</h3>
                  <p style={s.modalSub}>We'll check if you have an account.</p>
                </div>
                {authError && <div style={{ ...s.errorBanner, marginBottom: '16px' }}>{authError}</div>}
                <div style={s.formGroup}>
                  <label style={s.label}>Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    style={s.input}
                    value={authEmail}
                    onChange={e => setAuthEmail(e.target.value)}
                    onFocus={e => e.target.style.borderColor = MUSTARD}
                    onBlur={e => e.target.style.borderColor = BORDER}
                  />
                </div>
                <button
                  style={s.btnPrimary}
                  onClick={async () => {
                    if (!authEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail)) {
                      setAuthError('Please enter a valid email address.');
                      return;
                    }
                    setAuthLoading(true);
                    setAuthError('');
                    try {
                      const res = await fetch('/api/auth/check', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: authEmail }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        setAuthError(data.error || 'Check failed.');
                        setAuthLoading(false);
                        return;
                      }
                      if (data.hasPassword) {
                        setAuthStep('login');
                      } else {
                        await sendOtp(authEmail);
                        setAuthStep('otp');
                      }
                    } catch (err) {
                      setAuthError('Network error. Please try again.');
                    } finally {
                      setAuthLoading(false);
                    }
                  }}
                  disabled={authLoading}
                >
                  {authLoading ? 'Checking...' : 'Continue'}
                </button>
                <button style={{ ...s.btnOutline, marginTop: '12px' }} onClick={() => setAuthModalOpen(false)}>Cancel</button>
              </>
            )}

            {authStep === 'login' && (
              <>
                <div style={s.modalHeader}>
                  <div style={s.modalIcon}>🔑</div>
                  <h3 style={s.modalTitle}>Log In</h3>
                  <p style={s.modalSub}>Enter your password for <strong>{authEmail}</strong></p>
                </div>
                {authError && <div style={{ ...s.errorBanner, marginBottom: '16px' }}>{authError}</div>}
                <div style={s.formGroup}>
                  <label style={s.label}>Password</label>
                  <input
                    type="password"
                    required
                    placeholder="Enter your password"
                    style={s.input}
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    onFocus={e => e.target.style.borderColor = MUSTARD}
                    onBlur={e => e.target.style.borderColor = BORDER}
                  />
                </div>
                <button
                  style={s.btnPrimary}
                  onClick={handleLogin}
                  disabled={authLoading}
                >
                  {authLoading ? 'Logging in...' : 'Log In'}
                </button>
                <button
                  style={{ ...s.btnOutline, marginTop: '12px' }}
                  onClick={async () => {
                    setAuthError('');
                    await sendOtp(authEmail);
                    setAuthStep('otp');
                  }}
                >
                  Forgot password? Set with OTP
                </button>
                <button style={{ ...s.btnOutline, marginTop: '8px' }} onClick={() => { setAuthStep('email'); setAuthError(''); setAuthPassword(''); }}>← Use different email</button>
                <button style={{ ...s.btnOutline, marginTop: '8px', borderColor: 'transparent' }} onClick={() => setAuthModalOpen(false)}>Cancel</button>
              </>
            )}

            {authStep === 'otp' && (
              <>
                <div style={s.modalHeader}>
                  <div style={s.modalIcon}>📬</div>
                  <h3 style={s.modalTitle}>Verify Your Email</h3>
                  <p style={s.modalSub}>We sent a 6-digit code to <strong>{authEmail}</strong></p>
                </div>
                {authError && <div style={{ ...s.errorBanner, marginBottom: '16px' }}>{authError}</div>}
                <div style={s.otpBox}>
                  <div style={s.otpTimer}>Expires in {formatCountdown(authCountdown)}</div>
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Enter 6-Digit Code</label>
                  <input
                    type="text"
                    required
                    placeholder="123456"
                    maxLength={6}
                    style={{ ...s.input, textAlign: 'center', fontSize: '24px', letterSpacing: '8px', fontFamily: 'monospace' }}
                    value={authOtpInput}
                    onChange={e => setAuthOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onFocus={e => e.target.style.borderColor = MUSTARD}
                    onBlur={e => e.target.style.borderColor = BORDER}
                  />
                </div>
                <button
                  style={s.btnPrimary}
                  onClick={handleVerifyOtp}
                  disabled={authLoading || authCountdown <= 0}
                >
                  {authLoading ? 'Verifying...' : 'Verify'}
                </button>
                <button
                  style={{ ...s.btnOutline, marginTop: '12px' }}
                  onClick={() => {
                    setAuthError('');
                    sendOtp(authEmail);
                  }}
                  disabled={authCountdown > 0}
                >
                  {authCountdown > 0 ? `Wait ${formatCountdown(authCountdown)}` : 'Resend OTP'}
                </button>
                <button style={{ ...s.btnOutline, marginTop: '8px' }} onClick={() => { setAuthStep('email'); setAuthError(''); setAuthOtpInput(''); }}>← Use different email</button>
              </>
            )}

            {authStep === 'setPassword' && (
              <>
                <div style={s.modalHeader}>
                  <div style={s.modalIcon}>🔐</div>
                  <h3 style={s.modalTitle}>Set Your Password</h3>
                  <p style={s.modalSub}>Create a password for <strong>{authEmail}</strong></p>
                </div>
                {authError && <div style={{ ...s.errorBanner, marginBottom: '16px' }}>{authError}</div>}
                <div style={s.formGroup}>
                  <label style={s.label}>Password (min 6 characters)</label>
                  <input
                    type="password"
                    required
                    placeholder="Min 6 characters"
                    style={s.input}
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    onFocus={e => e.target.style.borderColor = MUSTARD}
                    onBlur={e => e.target.style.borderColor = BORDER}
                  />
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Confirm Password</label>
                  <input
                    type="password"
                    required
                    placeholder="Re-enter your password"
                    style={s.input}
                    value={authConfirmPassword}
                    onChange={e => setAuthConfirmPassword(e.target.value)}
                    onFocus={e => e.target.style.borderColor = MUSTARD}
                    onBlur={e => e.target.style.borderColor = BORDER}
                  />
                </div>
                <button
                  style={s.btnPrimary}
                  onClick={handleSetPassword}
                  disabled={authLoading}
                >
                  {authLoading ? 'Setting...' : 'Set Password & Book'}
                </button>
                <button style={{ ...s.btnOutline, marginTop: '12px' }} onClick={() => { setAuthStep('email'); setAuthError(''); setAuthPassword(''); setAuthConfirmPassword(''); }}>← Back</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}