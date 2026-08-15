'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

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

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [adminViewDate, setAdminViewDate] = useState('');
  const [allBookings, setAllBookings] = useState([]);
  const [archivedBookings, setArchivedBookings] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showReceipt, setShowReceipt] = useState(null);
  const [pendingAlertDismissed, setPendingAlertDismissed] = useState(false);
  const [supabaseReady, setSupabaseReady] = useState(true);
  const [activeTab, setActiveTab] = useState('bookings');
  const [rememberMe, setRememberMe] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // --- Settings state ---
  const [hourlyRate, setHourlyRate] = useState(350);
  const [hourlyRateInput, setHourlyRateInput] = useState('350');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');

  // --- Closures state ---
  const [closures, setClosures] = useState([]);
  const [closuresLoading, setClosuresLoading] = useState(false);
  const [closureDates, setClosureDates] = useState([]);
  const [closureSlots, setClosureSlots] = useState([]);
  const [closureFullDay, setClosureFullDay] = useState(false);
  const [closureError, setClosureError] = useState('');
  const [closureSuccess, setClosureSuccess] = useState('');
  const [closureMonth, setClosureMonth] = useState(new Date());
  const [selectedClosureIds, setSelectedClosureIds] = useState([]); // For bulk reopen

  // --- Sound notification & pending count tracking ---
  const [previousPendingCount, setPreviousPendingCount] = useState(0);

  // --- Confirmation modal state ---
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    loading: false,
  });

  // --- Archive selection state ---
  const [selectedArchiveIds, setSelectedArchiveIds] = useState([]);

  // --- Reschedule state (same as before) ---
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleBookingIds, setRescheduleBookingIds] = useState([]);
  const [rescheduleCustomer, setRescheduleCustomer] = useState('');
  const [rescheduleOldDate, setRescheduleOldDate] = useState('');
  const [rescheduleOldSlots, setRescheduleOldSlots] = useState([]);
  const [rescheduleNewDate, setRescheduleNewDate] = useState('');
  const [rescheduleNewSlots, setRescheduleNewSlots] = useState([]);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleSuccess, setRescheduleSuccess] = useState('');
  const [rescheduleBookedSlots, setRescheduleBookedSlots] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const availableShifts = useMemo(() => [
    '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM',
    '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM'
  ], []);

  // --- Calendar helpers ---
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const today = new Date();
  const twoWeeksFromNow = new Date();
  twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);

  const isDateSelectable = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const t = new Date(today.toISOString().split('T')[0] + 'T00:00:00');
    const max = new Date(twoWeeksFromNow.toISOString().split('T')[0] + 'T00:00:00');
    return d >= t && d <= max;
  };

  const isToday = (dateStr) => dateStr === new Date().toISOString().split('T')[0];

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
  }, [currentMonth]);

  // --- Group closures by date for quick lookups ---
  const closuresByDate = useMemo(() => {
    const map = {};
    closures.forEach(c => {
      if (!map[c.booking_date]) map[c.booking_date] = { ids: [], slots: [], fullDay: false, slotToId: {} };
      map[c.booking_date].ids.push(c.id);
      map[c.booking_date].slots.push(c.time_slot);
      map[c.booking_date].slotToId[c.time_slot] = c.id;
      if (c.time_slot === 'ALL') map[c.booking_date].fullDay = true;
    });
    return map;
  }, [closures]);

  // --- Get union of already-closed slots across ALL selected dates ---
  const alreadyClosedSlots = useMemo(() => {
    if (closureDates.length === 0) return [];
    const allSlots = new Set();
    let anyFullDay = false;
    closureDates.forEach(date => {
      const entry = closuresByDate[date];
      if (!entry) return;
      if (entry.fullDay) { anyFullDay = true; return; }
      entry.slots.forEach(s => allSlots.add(s));
    });
    if (anyFullDay) return ['ALL'];
    return [...allSlots];
  }, [closureDates, closuresByDate]);

  // --- Closures calendar ---
  const closureCalendarDays = useMemo(() => {
    const year = closureMonth.getFullYear();
    const month = closureMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const closureInfo = closuresByDate[dateStr] || null;
      // For closures, any date (past or future) can be selected
      days.push({ day, dateStr, isToday: dateStr === new Date().toISOString().split('T')[0], closureInfo });
    }
    return days;
  }, [closureMonth, closuresByDate]);

  // --- Sound notification ---
  const playNotificationSound = () => {
    try {
      const audio = new Audio('/sound/ding.mp3');
      audio.volume = 0.5; // Set volume to 50%
      audio.play().catch(err => {
        console.warn('Failed to play notification sound:', err);
        // Fallback: try Web Audio API beep if mp3 fails
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          oscillator.frequency.value = 880;
          oscillator.type = 'sine';
          gainNode.gain.value = 0.3;
          oscillator.start();
          oscillator.stop(audioContext.currentTime + 0.15);
        } catch (_) { /* silent */ }
      });
    } catch (err) {
      console.error('Sound error:', err);
    }
  };

  // --- Confirm modal helpers ---
  const showConfirm = (title, message, onConfirm) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, loading: true }));
        onConfirm();
      },
      loading: false,
    });
  };

  const closeConfirm = () => {
    setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null, loading: false });
  };

  // --- Fetch bookings (active only) ---
  const fetchAdminBookings = useCallback(async () => {
    if (!isAuthenticated || !supabaseReady || !supabase) return;
    setLoading(true);
    setError('');

    try {
      let query = supabase
        .from('bookings')
        .select('*')
        .is('deleted_at', null)
        .neq('status', 'closed')
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
    } catch (err) {
      setError('Connection error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, supabaseReady, adminViewDate]);

  // --- Fetch archived bookings ---
  const fetchArchivedBookings = useCallback(async () => {
    if (!isAuthenticated || !supabaseReady || !supabase) return;
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
        .order('booking_date', { ascending: false });

      if (!error) {
        setArchivedBookings(data || []);
      }
    } catch (err) {
      console.error('Fetch archived error:', err);
    }
  }, [isAuthenticated, supabaseReady]);

  // --- Fetch users ---
  const fetchUsers = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setAllUsers(data.users || []);
    } catch (err) {
      console.error('Fetch users error:', err);
    }
  }, [isAuthenticated]);

  // --- Fetch closures ---
  const fetchClosures = useCallback(async () => {
    if (!isAuthenticated) return;
    setClosuresLoading(true);
    setClosureError('');
    try {
      const res = await fetch('/api/admin/closures');
      if (!res.ok) {
        if (res.status === 401) { setIsAuthenticated(false); return; }
        throw new Error('Failed to fetch closures');
      }
      const data = await res.json();
      setClosures(data.closures || []);
    } catch (err) {
      console.error('Fetch closures error:', err);
      setClosureError('Failed to load closures.');
    } finally {
      setClosuresLoading(false);
    }
  }, [isAuthenticated]);

  // --- Fetch current settings ---
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      setHourlyRate(data.hourly_rate || 350);
      setHourlyRateInput(String(data.hourly_rate || 350));
    } catch (err) {
      console.error('Fetch settings error:', err);
    }
  }, []);

  // --- Update settings ---
  const handleUpdateSettings = async (e) => {
    e.preventDefault();
    const newRate = parseInt(hourlyRateInput, 10);
    if (!newRate || newRate <= 0) {
      setSettingsError('Hourly rate must be greater than 0');
      return;
    }

    setSettingsLoading(true);
    setSettingsError('');
    setSettingsSuccess('');

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hourly_rate: newRate, currency: 'PHP' }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSettingsError(data.error || 'Failed to update settings');
        if (res.status === 401) setIsAuthenticated(false);
      } else {
        setHourlyRate(newRate);
        setSettingsSuccess(`✓ Hourly rate updated to ₱${newRate}`);
        setTimeout(() => setSettingsSuccess(''), 4000);
      }
    } catch (err) {
      console.error('Update settings error:', err);
      setSettingsError('Failed to update settings');
    } finally {
      setSettingsLoading(false);
    }
  };

  // --- Create closure (supports multiple dates) ---
  const handleCreateClosure = async () => {
    if (closureDates.length === 0) {
      setClosureError('Please select at least one date.');
      return;
    }
    if (!closureFullDay && closureSlots.length === 0) {
      setClosureError('Select at least one time slot or "Close Full Day".');
      return;
    }

    setClosuresLoading(true);
    setClosureError('');
    setClosureSuccess('');

    try {
      // Create closures for each selected date sequentially
      for (const date of closureDates) {
        const res = await fetch('/api/admin/closures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            slots: closureFullDay ? [] : closureSlots,
            fullDay: closureFullDay,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          if (res.status === 401) { setIsAuthenticated(false); return; }
          setClosureError(data.error || `Failed to close ${date}.`);
          return;
        }
      }

      setClosureSuccess(`Closed ${closureFullDay ? 'full day' : closureSlots.length + ' slot(s)'} on ${closureDates.length} date${closureDates.length > 1 ? 's' : ''}.`);
      setClosureDates([]);
      setClosureSlots([]);
      setClosureFullDay(false);
      fetchClosures();
      fetchAdminBookings();
      setTimeout(() => setClosureSuccess(''), 4000);
    } catch (err) {
      console.error('Create closure error:', err);
      setClosureError('Failed to create closure.');
    } finally {
      setClosuresLoading(false);
    }
  };

  // --- Reopen a single slot (instant, no confirm) ---
  const handleReopenSlot = async (date, slot) => {
    const entry = closuresByDate[date];
    if (!entry) return;

    let idsToDelete = [];
    if (slot === 'ALL') {
      // Explicitly reopening a full-day closure
      idsToDelete = entry.ids;
    } else {
      // Reopen specific slot by its exact ID
      const slotId = entry.slotToId[slot];
      if (!slotId) return;
      idsToDelete = [slotId];
    }

    setClosuresLoading(true);
    setClosureError('');
    setClosureSuccess('');

    try {
      const res = await fetch('/api/admin/closures', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) { setIsAuthenticated(false); return; }
        setClosureError(data.error || 'Failed to reopen slot.');
      } else {
        setClosureSuccess(`Reopened ${slot === 'ALL' ? 'full day' : slot} on ${date}.`);
        fetchClosures();
        fetchAdminBookings();
        setTimeout(() => setClosureSuccess(''), 3000);
      }
    } catch (err) {
      console.error('Reopen slot error:', err);
      setClosureError('Failed to reopen slot.');
    } finally {
      setClosuresLoading(false);
    }
  };

  // --- Reopen all closures on selected dates (bulk, with confirm) ---
  const handleReopenSelectedDates = () => {
    const allIds = [];
    closureDates.forEach(date => {
      const entry = closuresByDate[date];
      if (entry) allIds.push(...entry.ids);
    });

    if (allIds.length === 0) {
      setClosureError('No closures to reopen on selected dates.');
      return;
    }

    showConfirm(
      '🔓 Reopen Selected Dates',
      `Reopen ALL closures on ${closureDates.length} date${closureDates.length > 1 ? 's' : ''}? This will make ${allIds.length} slot${allIds.length > 1 ? 's' : ''} available.`,
      async () => {
        setClosuresLoading(true);
        setClosureError('');
        try {
          const res = await fetch('/api/admin/closures', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: allIds }),
          });

          const data = await res.json();

          if (!res.ok) {
            if (res.status === 401) { setIsAuthenticated(false); return; }
            setClosureError(data.error || 'Failed to remove closures.');
          } else {
            setClosureSuccess(`Reopened ${closureDates.length} date${closureDates.length > 1 ? 's' : ''} — ${allIds.length} slot${allIds.length > 1 ? 's' : ''} now available.`);
            setClosureDates([]);
            fetchClosures();
            fetchAdminBookings();
            setTimeout(() => setClosureSuccess(''), 4000);
          }
        } catch (err) {
          console.error('Reopen selected error:', err);
          setClosureError('Failed to reopen selected dates.');
        } finally {
          setClosuresLoading(false);
          closeConfirm();
        }
      }
    );
  };

  // --- Remove closure (bulk) ---
  const handleRemoveClosure = async (ids) => {
    showConfirm(
      'Remove Closure',
      `Reopen ${ids.length} slot(s)? This will make them available for booking again.`,
      async () => {
        setClosuresLoading(true);
        setClosureError('');
        try {
          const res = await fetch('/api/admin/closures', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          });

          const data = await res.json();

          if (!res.ok) {
            if (res.status === 401) { setIsAuthenticated(false); return; }
            setClosureError(data.error || 'Failed to remove closure.');
          } else {
            setClosureSuccess('Closure removed. Slots are now available.');
            fetchClosures();
            fetchAdminBookings();
            setTimeout(() => setClosureSuccess(''), 4000);
          }
        } catch (err) {
          console.error('Remove closure error:', err);
          setClosureError('Failed to remove closure.');
        } finally {
          setClosuresLoading(false);
          closeConfirm();
        }
      }
    );
  };

  // --- Bulk reopen closures ---
  const handleBulkReopenClosures = (ids) => {
    if (ids.length === 0) {
      setClosureError('No closures selected.');
      return;
    }

    showConfirm(
      '🔓 Bulk Reopen',
      `Reopen ${ids.length} closure${ids.length > 1 ? 's' : ''}? All selected slots will become available for booking.`,
      async () => {
        setClosuresLoading(true);
        setClosureError('');
        try {
          const res = await fetch('/api/admin/closures', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          });

          const data = await res.json();

          if (!res.ok) {
            if (res.status === 401) { setIsAuthenticated(false); return; }
            setClosureError(data.error || 'Failed to bulk reopen closures.');
          } else {
            setClosureSuccess(`✓ Reopened ${ids.length} closure${ids.length > 1 ? 's' : ''}. Slots are now available.`);
            setSelectedClosureIds([]);
            fetchClosures();
            fetchAdminBookings();
            setTimeout(() => setClosureSuccess(''), 4000);
          }
        } catch (err) {
          console.error('Bulk reopen error:', err);
          setClosureError('Failed to bulk reopen closures.');
        } finally {
          setClosuresLoading(false);
          closeConfirm();
        }
      }
    );
  };

  // --- Toggle closure slot ---
  const toggleClosureSlot = (slot) => {
    setClosureSlots(prev => {
      if (prev.includes(slot)) return prev.filter(s => s !== slot);
      return [...prev, slot];
    });
  };

  // --- Toggle block user ---
  const handleToggleBlock = async (email, currentBlocked) => {
    showConfirm(
      currentBlocked ? 'Unblock User' : 'Block User',
      currentBlocked
        ? `Are you sure you want to unblock ${email}? They will be able to book again.`
        : `Are you sure you want to block ${email}? They will not be able to book.`,
      async () => {
        setLoading(true);
        setError('');
        setSuccess('');
        try {
          const res = await fetch('/api/admin/users/block', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, block: !currentBlocked }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || 'Failed to update user');
          } else {
            setSuccess(`User ${currentBlocked ? 'unblocked' : 'blocked'} successfully.`);
            fetchUsers();
          }
        } catch (err) {
          setError('Failed to update user');
          console.error(err);
        } finally {
          setLoading(false);
          closeConfirm();
        }
      }
    );
  };

  // --- Open reschedule modal ---
  const openRescheduleModal = (bookingIds, customerName, oldDate, oldSlots) => {
    setRescheduleBookingIds(bookingIds);
    setRescheduleCustomer(customerName);
    setRescheduleOldDate(oldDate);
    setRescheduleOldSlots(oldSlots);
    setRescheduleNewDate('');
    setRescheduleNewSlots([]);
    setRescheduleError('');
    setRescheduleSuccess('');
    setRescheduleBookedSlots([]);
    setCurrentMonth(new Date());
    setShowRescheduleModal(true);
  };

  // --- Toggle slot selection for reschedule ---
  const toggleRescheduleSlot = (slot) => {
    setRescheduleNewSlots(prev => {
      if (prev.includes(slot)) return prev.filter(s => s !== slot);
      return [...prev, slot];
    });
  };

  // --- Fetch available slots for reschedule ---
  useEffect(() => {
    if (!rescheduleNewDate || !showRescheduleModal || rescheduleBookingIds.length === 0) return;
    const fetchSlots = async () => {
      try {
        const { data, error } = await supabase
          .from('bookings')
          .select('time_slot')
          .eq('booking_date', rescheduleNewDate)
          .in('status', ['confirmed', 'pending_review'])
          .is('deleted_at', null)
          .not('id', 'in', `(${rescheduleBookingIds.map(id => `'${id}'`).join(',')})`);

        if (error) {
          console.error('Fetch slots error:', error);
        } else if (data) {
          setRescheduleBookedSlots(data.map(item => item.time_slot));
        }
      } catch (err) {
        console.error('Fetch slots error:', err);
      }
    };
    fetchSlots();
  }, [rescheduleNewDate, showRescheduleModal, rescheduleBookingIds]);

  // --- Handle reschedule ---
  const handleReschedule = async () => {
    if (!rescheduleNewDate || rescheduleNewSlots.length === 0) {
      setRescheduleError('Please select a new date and at least one time slot.');
      return;
    }

    setRescheduleLoading(true);
    setRescheduleError('');
    setRescheduleSuccess('');

    try {
      const res = await fetch('/api/admin/bookings/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingIds: rescheduleBookingIds,
          newDate: rescheduleNewDate,
          newSlots: rescheduleNewSlots,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRescheduleError(data.error || 'Failed to reschedule.');
        if (res.status === 401) {
          setIsAuthenticated(false);
        }
      } else {
        setRescheduleSuccess('Booking rescheduled successfully!');
        setTimeout(() => setShowRescheduleModal(false), 1500);
        fetchAdminBookings();
        fetchArchivedBookings();
        fetchUsers();
      }
    } catch (err) {
      console.error('Reschedule error:', err);
      setRescheduleError('Failed to reschedule.');
    } finally {
      setRescheduleLoading(false);
    }
  };

  // --- Force release (hard delete, no email) ---
  const handleForceRelease = async (ids, customerName) => {
    showConfirm(
      '🔓 Force Release',
      `Hard-delete ${ids.length} pending slot(s) for ${customerName}? No email will be sent. Slot becomes available immediately.`,
      async () => {
        setLoading(true);
        try {
          const res = await fetch('/api/admin/bookings/force-release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || 'Failed to release.');
            if (res.status === 401) setIsAuthenticated(false);
          } else {
            setSuccess(`🔓 ${ids.length} slot(s) force-released.`);
            fetchAdminBookings();
            fetchUsers();
          }
        } catch (err) {
          console.error('Force release error:', err);
          setError('Failed to release.');
        } finally {
          setLoading(false);
          closeConfirm();
        }
      }
    );
  };

  // --- Soft delete (move to archive) ---
  const handleSoftDelete = async (ids, customerName) => {
    showConfirm(
      'Archive Booking',
      `Move ${ids.length} slot(s) for ${customerName} to archive? You can restore them later.`,
      async () => {
        setLoading(true);
        try {
          const res = await fetch('/api/admin/bookings/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          });

          const data = await res.json();

          if (!res.ok) {
            setError(data.error || 'Failed to archive.');
            if (res.status === 401) setIsAuthenticated(false);
          } else {
            setSuccess(`Archived ${ids.length} reservation(s).`);
            fetchAdminBookings();
            fetchArchivedBookings();
            fetchUsers();
          }
        } catch (err) {
          console.error('Archive error:', err);
          setError('Failed to archive.');
        } finally {
          setLoading(false);
          closeConfirm();
        }
      }
    );
  };

  // --- Restore from archive ---
  const handleRestore = async (ids) => {
    showConfirm(
      'Restore Booking',
      `Restore ${ids.length} booking(s) from archive?`,
      async () => {
        setLoading(true);
        try {
          const { error } = await supabase
            .from('bookings')
            .update({ deleted_at: null })
            .in('id', ids);

          if (error) {
            setError('Failed to restore.');
          } else {
            setSuccess(`Restored ${ids.length} booking(s).`);
            fetchAdminBookings();
            fetchArchivedBookings();
          }
        } catch (err) {
          setError('Failed to restore.');
        } finally {
          setLoading(false);
          closeConfirm();
        }
      }
    );
  };

  // --- Permanent delete from archive ---
  const handlePermanentDelete = async (ids) => {
    showConfirm(
      '⚠️ Permanent Delete',
      `This will permanently delete ${ids.length} booking(s). This action cannot be undone. Are you sure?`,
      async () => {
        setLoading(true);
        try {
          const res = await fetch('/api/admin/bookings/permanent-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          });

          const data = await res.json();

          if (!res.ok) {
            setError(data.error || 'Failed to permanently delete.');
            if (res.status === 401) setIsAuthenticated(false);
          } else {
            setSuccess(`Permanently deleted ${ids.length} booking(s).`);
            fetchArchivedBookings();
          }
        } catch (err) {
          console.error('Permanent delete error:', err);
          setError('Failed to permanently delete.');
        } finally {
          setLoading(false);
          closeConfirm();
        }
      }
    );
  };

  // --- Empty archive ---
  const handleEmptyArchive = async () => {
    const ids = archivedBookings.map(b => b.id);
    if (ids.length === 0) {
      setError('Archive is already empty.');
      return;
    }
    showConfirm(
      '⚠️ Empty Archive',
      `This will permanently delete ALL ${ids.length} archived bookings. This cannot be undone. Are you sure?`,
      async () => {
        setLoading(true);
        try {
          const res = await fetch('/api/admin/bookings/permanent-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          });

          const data = await res.json();

          if (!res.ok) {
            setError(data.error || 'Failed to empty archive.');
            if (res.status === 401) setIsAuthenticated(false);
          } else {
            setSuccess(`Archive emptied (${ids.length} bookings permanently deleted).`);
            fetchArchivedBookings();
          }
        } catch (err) {
          console.error('Empty archive error:', err);
          setError('Failed to empty archive.');
        } finally {
          setLoading(false);
          closeConfirm();
        }
      }
    );
  };

  // --- Update status (approve/cancel) ---
  const handleUpdateStatus = async (ids, newStatus) => {
    const actionText = newStatus === 'confirmed' ? 'approve' : 'cancel';
    showConfirm(
      `${newStatus === 'confirmed' ? 'Approve' : 'Cancel'} Booking`,
      `Are you sure you want to ${actionText} this booking?`,
      async () => {
        setLoading(true);
        setError('');
        setSuccess('');

        try {
          const res = await fetch('/api/admin/bookings/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, status: newStatus }),
          });

          const data = await res.json();

          if (!res.ok) {
            setError(data.error || 'Update failed.');
            if (res.status === 401) setIsAuthenticated(false);
          } else {
            setSuccess(`Booking ${newStatus} successfully.`);
            fetchAdminBookings();
            fetchArchivedBookings();
            fetchUsers();
          }
        } catch (err) {
          console.error('Update error:', err);
          setError('Update failed.');
        } finally {
          setLoading(false);
          closeConfirm();
        }
      }
    );
  };

  // --- Auto-refresh & detection ---
  const totalPending = useMemo(() => allBookings.filter(b => b.status === 'pending_review').length, [allBookings]);

  useEffect(() => {
    if (totalPending > previousPendingCount && previousPendingCount > 0) {
      playNotificationSound();
      setSuccess('🔔 New booking pending approval!');
      setTimeout(() => setSuccess(''), 5000);
    }
    setPreviousPendingCount(totalPending);
  }, [totalPending, previousPendingCount]);

  useEffect(() => {
    if (!isAuthenticated || !autoRefresh || !supabaseReady) return;
    const interval = setInterval(() => {
      Promise.all([fetchAdminBookings(), fetchArchivedBookings(), fetchUsers(), fetchClosures(), fetchSettings()]);
    }, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated, autoRefresh, supabaseReady, fetchAdminBookings, fetchArchivedBookings, fetchUsers, fetchClosures, fetchSettings]);

  // --- Auth check ---
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/admin/auth/login');
        const data = await res.json();
        if (data.authenticated) {
          setIsAuthenticated(true);
          Promise.all([fetchAdminBookings(), fetchArchivedBookings(), fetchUsers(), fetchClosures(), fetchSettings()]);
          return;
        }

        const userEmail = typeof window !== 'undefined' ? localStorage.getItem('rk_verified_email') : null;
        if (userEmail) {
          setAuthLoading(true);
          const loginRes = await fetch('/api/admin/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail, remember: true }),
          });
          const loginData = await loginRes.json();
          if (loginRes.ok && loginData.success) {
            setIsAuthenticated(true);
            Promise.all([fetchAdminBookings(), fetchArchivedBookings(), fetchUsers(), fetchClosures(), fetchSettings()]);
          } else {
            setError(loginData.error || 'Access denied. Admin only.');
          }
          setAuthLoading(false);
        }
      } catch (_) { /* ignore */ }
    };
    checkAuth();
  }, []);

  // --- Login (password fallback) ---
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setAuthLoading(true);

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput, remember: rememberMe }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setIsAuthenticated(true);
        Promise.all([fetchAdminBookings(), fetchArchivedBookings(), fetchUsers(), fetchClosures()]);
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

  // --- Logout ---
  const handleLogout = async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    setIsAuthenticated(false);
    setAllBookings([]);
    setArchivedBookings([]);
    setAllUsers([]);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard!');
    setTimeout(() => setSuccess(''), 2000);
  };

  // --- Group active bookings ---
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
          ids: [],
          created_at: bk.created_at,
        };
      }
      groups[key].slots.push(bk.time_slot);
      groups[key].ids.push(bk.id);
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

  // --- Group archived bookings ---
  const groupedArchived = useMemo(() => {
    const groups = {};
    archivedBookings.forEach(bk => {
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
          ids: [],
          deleted_at: bk.deleted_at,
        };
      }
      groups[key].slots.push(bk.time_slot);
      groups[key].ids.push(bk.id);
    });
    return Object.values(groups).sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : -1));
  }, [archivedBookings]);

  // --- Stats ---
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

  // --- Filtered active bookings ---
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

  // --- Filtered archived bookings ---
  const filteredArchived = useMemo(() => {
    return groupedArchived.filter(bk => {
      const search = searchTerm.toLowerCase();
      return (
        bk.client_name.toLowerCase().includes(search) ||
        bk.client_phone.includes(search) ||
        bk.slots.some(s => s.toLowerCase().includes(search)) ||
        bk.booking_date.includes(search)
      );
    });
  }, [groupedArchived, searchTerm]);

  // --- Filtered users ---
  const filteredUsers = useMemo(() => {
    return allUsers.filter(user => {
      const search = searchTerm.toLowerCase();
      return (
        user.email?.toLowerCase().includes(search) ||
        user.name?.toLowerCase().includes(search) ||
        user.phone?.includes(search)
      );
    });
  }, [allUsers, searchTerm]);

  const statusConfig = {
    confirmed: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', label: 'Confirmed' },
    pending_review: { color: MUSTARD, bg: 'rgba(212, 175, 55, 0.1)', label: 'Pending' },
    cancelled: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', label: 'Cancelled' },
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

  const s = {
    wrapper: { minHeight: '100vh', backgroundColor: BLACK, color: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '0 0 40px 0' },
    nav: { borderBottom: '1px solid ' + BORDER, backgroundColor: 'rgba(10,10,10,0.9)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 },
    navInner: { maxWidth: '1200px', margin: '0 auto', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' },
    brand: { fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 800, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '2px' },
    brandRex: { color: MUSTARD },
    brandKapehan: { color: '#ffffff', textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' },
    badge: { fontSize: '10px', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '4px 10px', borderRadius: '20px', fontWeight: 600 },
    navBadge: { fontSize: '10px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', gap: '6px' },
    authWrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    authCard: { width: '100%', maxWidth: '380px', backgroundColor: CARD, border: '1px solid ' + BORDER, borderRadius: '24px', padding: '40px', boxSizing: 'border-box' },
    authTitle: { fontSize: '24px', fontWeight: 800, textAlign: 'center', margin: '0 0 8px 0' },
    authSub: { fontSize: '13px', color: TEXT_SEC, textAlign: 'center', margin: '0 0 32px 0' },
    input: { width: '100%', backgroundColor: BLACK, border: '1px solid ' + BORDER, padding: '12px 14px', borderRadius: '14px', color: '#ffffff', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' },
    btnPrimary: { width: '100%', padding: '14px', backgroundColor: MUSTARD, color: BLACK, border: 'none', borderRadius: '14px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' },
    btnPrimaryHover: { backgroundColor: '#E5C158' },
    container: { maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' },
    headerTitle: { fontSize: 'clamp(24px, 4vw, 28px)', fontWeight: 800, margin: 0 },
    headerSub: { fontSize: '14px', color: TEXT_SEC, margin: '4px 0 0 0' },
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' },
    statCard: { backgroundColor: CARD, border: '1px solid ' + BORDER, borderRadius: '16px', padding: '16px', position: 'relative', overflow: 'hidden' },
    statLabel: { fontSize: '10px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' },
    statValue: { fontSize: 'clamp(24px, 4vw, 28px)', fontWeight: 800, color: '#ffffff' },
    statValueGreen: { color: '#10b981' },
    statValueOrange: { color: MUSTARD },
    statValueRed: { color: '#ef4444' },
    statPulse: { position: 'absolute', top: '12px', right: '12px', width: '8px', height: '8px', backgroundColor: '#ef4444', borderRadius: '50%', animation: 'pulse 2s infinite' },
    tabBar: { display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: `1px solid ${BORDER}`, paddingBottom: '8px', flexWrap: 'wrap' },
    tabBtn: (active) => ({ padding: '8px 16px', borderRadius: '10px', fontSize: 'clamp(13px, 2vw, 14px)', fontWeight: 600, cursor: 'pointer', border: 'none', backgroundColor: active ? MUSTARD : 'transparent', color: active ? BLACK : TEXT_SEC, transition: 'all 0.2s' }),
    pendingAlert: { backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '16px', padding: '16px 20px', marginBottom: '20px' },
    pendingAlertHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' },
    pendingAlertTitle: { fontSize: 'clamp(13px, 2vw, 14px)', fontWeight: 700, color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' },
    pendingAlertDismiss: { fontSize: '12px', color: MUTED, backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px' },
    pendingDateRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: 'clamp(12px, 1.8vw, 13px)', color: TEXT_SEC, flexWrap: 'wrap' },
    pendingDateDot: { width: '6px', height: '6px', backgroundColor: '#ef4444', borderRadius: '50%' },
    pendingDateLink: { color: MUSTARD, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' },
    pendingDateCount: { marginLeft: 'auto', fontSize: '12px', color: MUTED },
    toolbar: { display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '20px', padding: '14px', backgroundColor: CARD, border: '1px solid ' + BORDER, borderRadius: '16px' },
    toolbarGroup: { display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 auto', flexWrap: 'wrap' },
    searchInput: { flex: 1, minWidth: '160px', backgroundColor: BLACK, border: '1px solid ' + BORDER, padding: '10px 14px', borderRadius: '10px', color: '#ffffff', fontSize: '13px', outline: 'none' },
    dateInput: { backgroundColor: BLACK, border: '1px solid ' + BORDER, padding: '10px 14px', borderRadius: '10px', color: '#ffffff', fontSize: '13px', outline: 'none' },
    select: { backgroundColor: BLACK, border: '1px solid ' + BORDER, padding: '10px 14px', borderRadius: '10px', color: '#ffffff', fontSize: '13px', outline: 'none', cursor: 'pointer' },
    toggle: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: TEXT_SEC, cursor: 'pointer', userSelect: 'none' },
    toggleDot: (active) => ({ width: '32px', height: '18px', borderRadius: '10px', backgroundColor: active ? MUSTARD : BORDER, position: 'relative', transition: 'all 0.2s' }),
    toggleKnob: (active) => ({ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: '#ffffff', position: 'absolute', top: '2px', left: active ? '16px' : '2px', transition: 'all 0.2s' }),
    quickFilterBtn: (active) => ({ padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', border: '1px solid', transition: 'all 0.15s', backgroundColor: active ? MUSTARD : 'transparent', color: active ? BLACK : TEXT_SEC, borderColor: active ? MUSTARD : BORDER }),
    allDatesBtn: (active) => ({ padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', border: '1px solid', transition: 'all 0.15s', backgroundColor: active ? 'rgba(212, 175, 55, 0.15)' : 'transparent', color: active ? MUSTARD : TEXT_SEC, borderColor: active ? MUSTARD : BORDER }),
    alert: (type) => ({ padding: '12px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 500, marginBottom: '16px', border: '1px solid', backgroundColor: type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: type === 'error' ? '#f87171' : '#34d399', borderColor: type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)' }),
    tableWrap: { backgroundColor: CARD, border: '1px solid ' + BORDER, borderRadius: '16px', overflowX: 'auto', overflowY: 'hidden' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
    th: { textAlign: 'left', padding: '10px 14px', color: MUTED, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid ' + BORDER, backgroundColor: BLACK },
    td: { padding: '10px 14px', borderBottom: '1px solid ' + BORDER, color: '#e2e8f0', verticalAlign: 'middle' },
    rowHover: { transition: 'background 0.15s' },
    rowPending: { backgroundColor: 'rgba(212, 175, 55, 0.03)' },
    cardList: { display: 'flex', flexDirection: 'column', gap: '12px' },
    card: { backgroundColor: CARD, border: '1px solid ' + BORDER, borderRadius: '16px', padding: '16px' },
    cardPending: { borderColor: 'rgba(212, 175, 55, 0.3)', backgroundColor: 'rgba(212, 175, 55, 0.03)' },
    cardRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' },
    statusPill: (status) => ({ fontSize: '10px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px', color: statusConfig[status]?.color || TEXT_SEC, backgroundColor: statusConfig[status]?.bg || 'rgba(148, 163, 184, 0.1)' }),
    cardInfo: { marginBottom: '10px' },
    cardInfoRow: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: TEXT_SEC, marginBottom: '4px', flexWrap: 'wrap' },
    cardInfoLabel: { color: MUTED, fontWeight: 600 },
    cardActions: { display: 'flex', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid ' + BORDER, flexWrap: 'wrap' },
    btnSm: { padding: '6px 12px', borderRadius: '8px', fontSize: '10px', fontWeight: 700, cursor: 'pointer', border: 'none', transition: 'all 0.15s' },
    btnApprove: { backgroundColor: MUSTARD, color: BLACK },
    btnApproveHover: { backgroundColor: '#E5C158' },
    btnCancel: { backgroundColor: '#2a2a2a', color: '#ffffff' },
    btnCancelHover: { backgroundColor: '#3a3a3a' },
    btnDelete: { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' },
    btnDeleteHover: { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
    btnReschedule: { backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.2)' },
    btnRescheduleHover: { backgroundColor: 'rgba(59, 130, 246, 0.25)' },
    btnRestore: { backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' },
    btnRestoreHover: { backgroundColor: 'rgba(16, 185, 129, 0.25)' },
    btnPermanentDelete: { backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' },
    btnPermanentDeleteHover: { backgroundColor: 'rgba(239, 68, 68, 0.25)' },
    btnGhost: { backgroundColor: 'transparent', color: MUSTARD, border: '1px solid ' + BORDER, padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' },
    btnGhostHover: { backgroundColor: 'rgba(212, 175, 55, 0.1)' },
    btnIcon: { backgroundColor: 'transparent', color: MUTED, border: '1px solid ' + BORDER, padding: '4px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
    btnIconHover: { backgroundColor: '#2a2a2a', color: '#ffffff' },
    modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' },
    modalCard: { backgroundColor: CARD, border: '1px solid ' + BORDER, borderRadius: '20px', padding: '20px', maxWidth: '550px', width: '100%', maxHeight: '90vh', overflow: 'auto' },
    modalImg: { width: '100%', borderRadius: '12px', marginBottom: '16px', border: '1px solid ' + BORDER },
    modalTitle: { fontSize: '16px', fontWeight: 700, marginBottom: '4px' },
    modalSub: { fontSize: '13px', color: TEXT_SEC, marginBottom: '16px' },
    modalRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid ' + BORDER, fontSize: '13px', flexWrap: 'wrap', gap: '4px' },
    modalLabel: { color: MUTED, fontWeight: 600 },
    modalValue: { color: '#ffffff' },
    btnSecondary: { width: '100%', padding: '12px', borderRadius: '14px', fontSize: '14px', fontWeight: 700, border: 'none', cursor: 'pointer', backgroundColor: '#2a2a2a', color: '#ffffff' },
    btnSecondaryHover: { backgroundColor: '#3a3a3a' },
    btnOutline: { padding: '8px 16px', backgroundColor: 'transparent', color: TEXT_SEC, border: `1px solid ${BORDER}`, borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit' },
    empty: { textAlign: 'center', padding: '40px 20px', color: MUTED },
    emptyIcon: { fontSize: '36px', marginBottom: '12px' },
    emptyTitle: { fontSize: '16px', fontWeight: 700, color: TEXT_SEC, marginBottom: '4px' },
    emptyText: { fontSize: '13px', color: '#555555' },
    slotTag: { display: 'inline-block', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(212, 175, 55, 0.1)', color: MUSTARD, border: '1px solid rgba(212, 175, 55, 0.2)', marginRight: '4px', marginBottom: '4px' },
    dateTag: { display: 'inline-block', fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)', marginBottom: '4px' },
    dateTagToday: { display: 'inline-block', fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', marginBottom: '4px' },
    dateTagPending: { display: 'inline-block', fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: '4px' },
    hideMobile: {},
    hideDesktop: {},
    rememberRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: TEXT_SEC, fontSize: '13px', cursor: 'pointer' },
    slotBtn: { padding: '10px 4px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', border: '1px solid', textAlign: 'center', transition: 'all 0.15s ease', fontFamily: 'inherit', position: 'relative', minHeight: '36px' },
    slotOpen: { backgroundColor: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#10b981' },
    slotSelected: { backgroundColor: MUSTARD, borderColor: MUSTARD_LIGHT, color: BLACK, boxShadow: `0 0 20px ${MUSTARD_GLOW}, 0 0 40px rgba(212, 175, 55, 0.2)` },
    slotTaken: { backgroundColor: BLACK, borderColor: BORDER, color: '#555555', cursor: 'not-allowed', textDecoration: 'line-through' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '6px', marginBottom: '6px' },
    calendarGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px', marginBottom: '12px' },
    calendarDayName: { textAlign: 'center', fontSize: '9px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', padding: '6px 0', letterSpacing: '0.5px' },
    calendarDay: { aspectRatio: '1', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 'clamp(11px, 1.8vw, 13px)', fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', transition: 'all 0.2s', position: 'relative', backgroundColor: 'transparent', color: TEXT_SEC, minHeight: 'clamp(32px, 5vw, 44px)' },
    calendarDaySelectable: { color: '#ffffff', backgroundColor: CARD, border: '1px solid #2a2a2a' },
    calendarDaySelected: { backgroundColor: MUSTARD, color: BLACK, border: '1px solid #E5C158', boxShadow: `0 0 20px ${MUSTARD_GLOW}` },
    calendarDayDisabled: { color: '#444444', cursor: 'not-allowed', border: '1px solid transparent' },
    calendarDayToday: { color: MUSTARD, fontWeight: '800' },
    calendarDayEmpty: { aspectRatio: '1' },
  };

  const responsiveStyles = `
    @media (max-width: 640px) {
      .hide-mobile { display: none !important; }
      .hide-desktop { display: block !important; }
      .stats-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 8px !important; }
      .stat-value { font-size: 20px !important; }
      .stat-card { padding: 12px !important; }
      .stat-label { font-size: 9px !important; }
      .toolbar { flex-direction: column !important; align-items: stretch !important; }
      .toolbar-group { flex: 1 1 100% !important; }
      .search-input { min-width: 100% !important; }
      .tab-bar { gap: 4px !important; }
      .tab-btn { padding: 6px 12px !important; font-size: 12px !important; }
      .nav-inner { padding: 12px 14px !important; }
      .brand { font-size: 16px !important; }
      .badge { font-size: 8px !important; padding: 2px 6px !important; }
      .nav-badge { font-size: 8px !important; padding: 2px 6px !important; }
      .btn-ghost { font-size: 9px !important; padding: 3px 8px !important; }
      .table-wrap { overflow-x: auto !important; }
      .table { font-size: 11px !important; }
      .th, .td { padding: 6px 8px !important; }
      .slot-btn { font-size: 10px !important; padding: 6px 2px !important; min-height: 30px !important; }
      .grid { grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)) !important; gap: 4px !important; }
      .card { padding: 12px !important; }
      .card-row { flex-direction: column !important; align-items: flex-start !important; }
      .card-actions { flex-wrap: wrap !important; }
      .btn-sm { font-size: 9px !important; padding: 4px 8px !important; }
      .modal-card { padding: 16px !important; max-width: 100% !important; margin: 10px !important; }
      .container { padding: 16px 12px !important; }
      .header-title { font-size: 20px !important; }
      .header-sub { font-size: 12px !important; }
      .pending-alert { padding: 12px 16px !important; }
      .pending-alert-title { font-size: 12px !important; }
      .pending-date-row { font-size: 11px !important; }
      .stat-pulse { width: 6px !important; height: 6px !important; top: 8px !important; right: 8px !important; }
      .calendar-day { font-size: 10px !important; min-height: 28px !important; }
    }
    @media (min-width: 641px) {
      .hide-mobile { display: block !important; }
      .hide-desktop { display: none !important; }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeOut {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(-8px); }
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(-8px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    @keyframes loadingBar {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(400%); }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .loading-bar {
      animation: loadingBar 1.5s ease-in-out infinite;
    }
    .modal-fade-in {
      animation: fadeIn 0.25s ease-out forwards;
    }
    .modal-fade-out {
      animation: fadeOut 0.25s ease-out forwards;
    }
  `;

  // --- AUTH SCREEN ---
  if (!isAuthenticated) {
    const userEmail = typeof window !== 'undefined' ? localStorage.getItem('rk_verified_email') : null;

    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: responsiveStyles }} />
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
              {authLoading ? (
                <>
                  <div style={{ fontSize: '40px', textAlign: 'center', marginBottom: '16px' }}>⏳</div>
                  <h2 style={s.authTitle}>Verifying...</h2>
                  <p style={s.authSub}>Checking admin access for {userEmail}</p>
                  <div style={{ textAlign: 'center', padding: '20px', color: MUTED }}>Please wait...</div>
                </>
              ) : !userEmail && !showPasswordForm ? (
                <>
                  <div style={{ fontSize: '40px', textAlign: 'center', marginBottom: '16px' }}>🔒</div>
                  <h2 style={s.authTitle}>Login Required</h2>
                  <p style={s.authSub}>You must be logged in to access the admin panel.</p>
                  {error && <div style={s.alert('error')}>{error}</div>}
                  <a href="/" style={{ ...s.btnPrimary, display: 'block', textAlign: 'center', textDecoration: 'none', marginBottom: '12px' }}
                    onMouseEnter={e => Object.assign(e.target.style, s.btnPrimaryHover)}
                    onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: MUSTARD })}
                  >
                    ← Back to Login
                  </a>
                  <button
                    style={{ ...s.btnSecondary, width: '100%' }}
                    onClick={() => setShowPasswordForm(true)}
                    onMouseEnter={e => Object.assign(e.target.style, s.btnSecondaryHover)}
                    onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: '#2a2a2a' })}
                  >
                    Manual Password Login
                  </button>
                </>
              ) : showPasswordForm ? (
                <>
                  <div style={{ fontSize: '40px', textAlign: 'center', marginBottom: '16px' }}>🔐</div>
                  <h2 style={s.authTitle}>Admin Terminal</h2>
                  <p style={s.authSub}>Password Authentication</p>
                  {error && <div style={s.alert('error')}>{error}</div>}
                  <form onSubmit={handleLogin}>
                    <input type="password" required placeholder="Enter password" style={s.input} value={passwordInput} onChange={e => { setPasswordInput(e.target.value); setError(''); }} onFocus={e => e.target.style.borderColor = MUSTARD} onBlur={e => e.target.style.borderColor = BORDER} />
                    <div style={s.rememberRow} onClick={() => setRememberMe(!rememberMe)}>
                      <input type="checkbox" checked={rememberMe} onChange={() => setRememberMe(!rememberMe)} style={{ accentColor: MUSTARD }} />
                      <span>Remember me on this device (30 days)</span>
                    </div>
                    <button type="submit" disabled={authLoading} style={s.btnPrimary} onMouseEnter={e => !authLoading && Object.assign(e.target.style, s.btnPrimaryHover)} onMouseLeave={e => !authLoading && Object.assign(e.target.style, { backgroundColor: MUSTARD })}>
                      {authLoading ? 'Authenticating...' : 'Authenticate'}
                    </button>
                  </form>
                  <button
                    style={{ ...s.btnSecondary, width: '100%', marginTop: '12px' }}
                    onClick={() => { setShowPasswordForm(false); setError(''); }}
                    onMouseEnter={e => Object.assign(e.target.style, s.btnSecondaryHover)}
                    onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: '#2a2a2a' })}
                  >
                    ← Back
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '40px', textAlign: 'center', marginBottom: '16px' }}>🚫</div>
                  <h2 style={s.authTitle}>Access Denied</h2>
                  <p style={s.authSub}>
                    {userEmail ? (
                      <><strong>{userEmail}</strong> is not an admin.</>
                    ) : (
                      'Admin access restricted to authorized users only.'
                    )}
                  </p>
                  {error && <div style={s.alert('error')}>{error}</div>}
                  <a href="/" style={{ ...s.btnPrimary, display: 'block', textAlign: 'center', textDecoration: 'none', marginBottom: '12px' }}
                    onMouseEnter={e => Object.assign(e.target.style, s.btnPrimaryHover)}
                    onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: MUSTARD })}
                  >
                    ← Back to Home
                  </a>
                  <button
                    style={{ ...s.btnSecondary, width: '100%' }}
                    onClick={() => setShowPasswordForm(true)}
                    onMouseEnter={e => Object.assign(e.target.style, s.btnSecondaryHover)}
                    onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: '#2a2a2a' })}
                  >
                    Manual Password Login
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // --- ADMIN DASHBOARD ---
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: responsiveStyles }} />

      <div style={s.wrapper}>
        <nav style={s.nav}>
          <div style={s.navInner}>
            <div style={s.brand}>
              <span style={s.brandRex}>REX</span>
              <span style={s.brandKapehan}>KAPEHAN</span>
              <span style={{ color: MUSTARD, marginLeft: '4px' }}>.admin</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {totalPending > 0 && (
                <div style={s.navBadge}>
                  <span style={{ width: '6px', height: '6px', backgroundColor: '#ef4444', borderRadius: '50%', animation: 'pulse 2s infinite' }}></span>
                  {totalPending} pending
                </div>
              )}
              <button style={{ ...s.btnGhost, borderColor: '#ef4444', color: '#ef4444' }} onMouseEnter={e => Object.assign(e.target.style, { backgroundColor: 'rgba(239, 68, 68, 0.1)' })} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'transparent' })} onClick={handleLogout}>
                Lock
              </button>
            </div>
          </div>
        </nav>

        {/* Loading bar — pulses when any data is being fetched */}
        {(loading || closuresLoading) && (
          <div style={{ height: '2px', width: '100%', backgroundColor: BORDER, overflow: 'hidden', position: 'fixed', top: 0, left: 0, zIndex: 100 }}>
            <div className="loading-bar" style={{ height: '100%', width: '25%', backgroundColor: MUSTARD, borderRadius: '1px' }}></div>
          </div>
        )}

        <div style={s.container}>
          <div style={s.header}>
            <div>
              <h1 style={s.headerTitle}>System Management Log</h1>
              <p style={s.headerSub}>Rex Kapehan Backend Operations Panel</p>
            </div>
          </div>

          {/* Stats */}
          <div style={s.statsGrid}>
            <div style={s.statCard}>
              <div style={s.statLabel}>Active Bookings</div>
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
              <div style={s.statLabel}>Registered Users</div>
              <div style={s.statValue}>{allUsers.length}</div>
            </div>
          </div>

          {/* Tabs */}
          <div style={s.tabBar}>
            <button
              style={s.tabBtn(activeTab === 'bookings')}
              onClick={() => { setActiveTab('bookings'); setSearchTerm(''); }}
            >
              📋 Active Bookings
            </button>
            <button
              style={s.tabBtn(activeTab === 'archive')}
              onClick={() => { setActiveTab('archive'); setSearchTerm(''); }}
            >
              🗂️ Archive ({archivedBookings.length})
            </button>
            <button
              style={s.tabBtn(activeTab === 'users')}
              onClick={() => { setActiveTab('users'); setSearchTerm(''); }}
            >
              👥 Users ({allUsers.length})
            </button>
            <button
              style={s.tabBtn(activeTab === 'closures')}
              onClick={() => { setActiveTab('closures'); setSearchTerm(''); setClosureError(''); setClosureSuccess(''); }}
            >
              🌧️ Closures ({closures.length})
            </button>
            <button
              style={s.tabBtn(activeTab === 'settings')}
              onClick={() => { setActiveTab('settings'); setSettingsError(''); setSettingsSuccess(''); fetchSettings(); }}
            >
              ⚙️ Settings
            </button>
          </div>

          {/* --- Active Bookings Tab --- */}
          {activeTab === 'bookings' && (
            <>
              {totalPending > 0 && !pendingAlertDismissed && (
                <div style={{ ...s.pendingAlert, animation: 'fadeIn 0.3s ease-out' }}>
                  <div style={s.pendingAlertHeader}>
                    <div style={s.pendingAlertTitle}>
                      <span>🔔</span>
                      {totalPending} pending approval{totalPending > 1 ? 's' : ''} across {pendingDates.length} date{pendingDates.length > 1 ? 's' : ''}
                    </div>
                    <button style={s.pendingAlertDismiss} onClick={() => setPendingAlertDismissed(true)}>Dismiss</button>
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
                    All Dates
                  </button>
                  <input type="date" style={s.dateInput} value={adminViewDate} onChange={e => setAdminViewDate(e.target.value)} />
                </div>
                <div style={s.toolbarGroup}>
                  <button style={s.quickFilterBtn(statusFilter === 'pending_review')} onClick={() => setStatusFilter(statusFilter === 'pending_review' ? 'all' : 'pending_review')}>Pending Only</button>
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

                {/* 🔔 Test Sound Button */}
                <button
                  style={{ ...s.btnSm, ...s.btnReschedule }}
                  onClick={playNotificationSound}
                  onMouseEnter={e => Object.assign(e.target.style, s.btnRescheduleHover)}
                  onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'rgba(59, 130, 246, 0.15)' })}
                >
                  🔔 Test Sound
                </button>
              </div>

              {error && <div style={{ ...s.alert('error'), animation: 'fadeIn 0.2s ease-out' }}>{error}</div>}
              {success && <div style={{ ...s.alert('success'), animation: 'fadeIn 0.2s ease-out' }}>{success}</div>}

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '20px' }}>
                  <span style={{ width: '18px', height: '18px', border: `2px solid ${BORDER}`, borderTopColor: MUSTARD, borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }}></span>
                  <span style={{ fontSize: '13px', color: MUSTARD }}>Loading bookings...</span>
                </div>
              )}

              {!loading && filteredBookings.length === 0 && (
                <div style={s.empty}>
                  <div style={s.emptyIcon}>📋</div>
                  <div style={s.emptyTitle}>No active reservations</div>
                  <div style={s.emptyText}>{searchTerm || statusFilter !== 'all' || adminViewDate ? 'Try adjusting your filters.' : 'No active bookings in the system.'}</div>
                </div>
              )}

              {/* Bookings Table — desktop only */}
              <div className="hide-mobile" style={s.tableWrap}>
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
                          <div style={{ marginBottom: '4px' }}>
                            {isToday(bk.booking_date) ? (
                              <span style={s.dateTagToday}>TODAY</span>
                            ) : bk.status === 'pending_review' ? (
                              <span style={s.dateTagPending}>{formatDate(bk.booking_date)}</span>
                            ) : (
                              <span style={s.dateTag}>{formatDate(bk.booking_date)}</span>
                            )}
                          </div>
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
                            <button style={s.btnGhost} onClick={() => setShowReceipt(bk)} onMouseEnter={e => Object.assign(e.target.style, s.btnGhostHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'transparent' })}>View</button>
                          ) : (<span style={{ color: '#555555', fontSize: '12px' }}>—</span>)}
                        </td>
                        <td style={s.td}>
                          <span style={{ fontSize: '12px', color: MUTED }}>{formatDateTime(bk.created_at)}</span>
                        </td>
                        <td style={{ ...s.td, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {bk.status !== 'confirmed' && (
                              <button style={{ ...s.btnSm, ...s.btnApprove }} onClick={() => handleUpdateStatus(bk.ids, 'confirmed')} onMouseEnter={e => Object.assign(e.target.style, s.btnApproveHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: MUSTARD })}>Approve</button>
                            )}
                            {bk.status !== 'cancelled' && (
                              <button style={{ ...s.btnSm, ...s.btnCancel }} onClick={() => handleUpdateStatus(bk.ids, 'cancelled')} onMouseEnter={e => Object.assign(e.target.style, s.btnCancelHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: '#2a2a2a' })}>Cancel</button>
                            )}
                            <button
                              style={{ ...s.btnSm, ...s.btnReschedule }}
                              onClick={() => openRescheduleModal(bk.ids, bk.client_name, bk.booking_date, bk.slots)}
                              onMouseEnter={e => Object.assign(e.target.style, s.btnRescheduleHover)}
                              onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'rgba(59, 130, 246, 0.15)' })}
                            >
                              Reschedule
                            </button>
                            <button
                              style={{ ...s.btnSm, ...s.btnDelete }}
                              onClick={() => handleSoftDelete(bk.ids, bk.client_name)}
                              onMouseEnter={e => Object.assign(e.target.style, s.btnDeleteHover)}
                              onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'rgba(239, 68, 68, 0.1)' })}
                            >
                              Archive
                            </button>
                            {bk.status === 'pending_review' && (
                              <button
                                style={{ ...s.btnSm, backgroundColor: 'rgba(249, 115, 22, 0.15)', color: '#f97316', border: '1px solid rgba(249, 115, 22, 0.3)' }}
                                onClick={() => handleForceRelease(bk.ids, bk.client_name)}
                                onMouseEnter={e => { e.target.style.backgroundColor = 'rgba(249, 115, 22, 0.25)'; }}
                                onMouseLeave={e => { e.target.style.backgroundColor = 'rgba(249, 115, 22, 0.15)'; }}
                              >
                                🔓 Release
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="hide-desktop" style={s.cardList}>
                {filteredBookings.map((bk) => (
                  <div key={bk.customerKey} style={{ ...s.card, ...(bk.status === 'pending_review' ? s.cardPending : {}), animation: 'slideIn 0.3s ease-out' }}>
                    <div style={s.cardRow}>
                      <div>
                        <div style={{ marginBottom: '4px' }}>
                          {isToday(bk.booking_date) ? (
                            <span style={s.dateTagToday}>TODAY</span>
                          ) : bk.status === 'pending_review' ? (
                            <span style={s.dateTagPending}>{formatDate(bk.booking_date)}</span>
                          ) : (
                            <span style={s.dateTag}>{formatDate(bk.booking_date)}</span>
                          )}
                        </div>
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
                        <button style={s.btnGhost} onClick={() => setShowReceipt(bk)} onMouseEnter={e => Object.assign(e.target.style, s.btnGhostHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'transparent' })}>View Receipt</button>
                      </div>
                    )}
                    <div style={s.cardActions}>
                      {bk.status !== 'confirmed' && (<button style={{ ...s.btnSm, ...s.btnApprove, flex: 1 }} onClick={() => handleUpdateStatus(bk.ids, 'confirmed')} onMouseEnter={e => Object.assign(e.target.style, s.btnApproveHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: MUSTARD })}>Approve</button>)}
                      {bk.status !== 'cancelled' && (<button style={{ ...s.btnSm, ...s.btnCancel, flex: 1 }} onClick={() => handleUpdateStatus(bk.ids, 'cancelled')} onMouseEnter={e => Object.assign(e.target.style, s.btnCancelHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: '#2a2a2a' })}>Cancel</button>)}
                      <button style={{ ...s.btnSm, ...s.btnReschedule, flex: 1 }} onClick={() => openRescheduleModal(bk.ids, bk.client_name, bk.booking_date, bk.slots)} onMouseEnter={e => Object.assign(e.target.style, s.btnRescheduleHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'rgba(59, 130, 246, 0.15)' })}>Reschedule</button>
                      <button style={{ ...s.btnSm, ...s.btnDelete, flex: 1 }} onClick={() => handleSoftDelete(bk.ids, bk.client_name)} onMouseEnter={e => Object.assign(e.target.style, s.btnDeleteHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'rgba(239, 68, 68, 0.1)' })}>Archive</button>
                      {bk.status === 'pending_review' && (
                        <button style={{ ...s.btnSm, backgroundColor: 'rgba(249, 115, 22, 0.15)', color: '#f97316', border: '1px solid rgba(249, 115, 22, 0.3)', flex: 1 }} onClick={() => handleForceRelease(bk.ids, bk.client_name)} onMouseEnter={e => { e.target.style.backgroundColor = 'rgba(249, 115, 22, 0.25)'; }} onMouseLeave={e => { e.target.style.backgroundColor = 'rgba(249, 115, 22, 0.15)'; }}>🔓 Release</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* --- Archive Tab --- */}
          {activeTab === 'archive' && (
            <>
              <div style={s.toolbar}>
                <div style={{ ...s.toolbarGroup, flex: '2 1 300px' }}>
                  <input type="text" placeholder="Search archived bookings..." style={s.searchInput} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onFocus={e => e.target.style.borderColor = MUSTARD} onBlur={e => e.target.style.borderColor = BORDER} />
                </div>
                <div style={s.toolbarGroup}>
                  <span style={{ color: MUTED, fontSize: '13px' }}>{archivedBookings.length} archived</span>
                </div>
                <div style={s.toolbarGroup}>
                  <button
                    style={{ ...s.btnSm, ...s.btnPermanentDelete }}
                    onClick={() => {
                      const ids = selectedArchiveIds.length > 0 ? selectedArchiveIds : archivedBookings.map(b => b.id);
                      if (ids.length === 0) { setError('No bookings selected.'); return; }
                      handlePermanentDelete(ids);
                    }}
                    onMouseEnter={e => Object.assign(e.target.style, s.btnPermanentDeleteHover)}
                    onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'rgba(239, 68, 68, 0.15)' })}
                  >
                    🗑️ Permanently Delete Selected
                  </button>
                  <button
                    style={{ ...s.btnSm, ...s.btnDelete }}
                    onClick={() => {
                      const ids = selectedArchiveIds.length > 0 ? selectedArchiveIds : archivedBookings.map(b => b.id);
                      if (ids.length === 0) { setError('No bookings selected.'); return; }
                      handleRestore(ids);
                    }}
                    onMouseEnter={e => Object.assign(e.target.style, s.btnRestoreHover)}
                    onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'rgba(16, 185, 129, 0.15)' })}
                  >
                    🔄 Restore Selected
                  </button>
                  <button
                    style={{ ...s.btnSm, ...s.btnPermanentDelete }}
                    onClick={handleEmptyArchive}
                    onMouseEnter={e => Object.assign(e.target.style, s.btnPermanentDeleteHover)}
                    onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'rgba(239, 68, 68, 0.15)' })}
                  >
                    🗑️ Empty Archive
                  </button>
                </div>
              </div>

              {error && <div style={s.alert('error')}>{error}</div>}
              {success && <div style={s.alert('success')}>{success}</div>}

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '20px' }}>
                  <span style={{ width: '18px', height: '18px', border: `2px solid ${BORDER}`, borderTopColor: MUSTARD, borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }}></span>
                  <span style={{ fontSize: '13px', color: MUSTARD }}>Loading archive...</span>
                </div>
              )}

              {!loading && filteredArchived.length === 0 && (
                <div style={s.empty}>
                  <div style={s.emptyIcon}>🗂️</div>
                  <div style={s.emptyTitle}>Archive is empty</div>
                  <div style={s.emptyText}>Deleted bookings will appear here.</div>
                </div>
              )}

              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={{ ...s.th, width: '30px' }}>
                        <input
                          type="checkbox"
                          checked={selectedArchiveIds.length === archivedBookings.length && archivedBookings.length > 0}
                          onChange={() => {
                            if (selectedArchiveIds.length === archivedBookings.length) {
                              setSelectedArchiveIds([]);
                            } else {
                              setSelectedArchiveIds(archivedBookings.map(b => b.id));
                            }
                          }}
                        />
                      </th>
                      <th style={s.th}>Date & Time</th>
                      <th style={s.th}>Customer</th>
                      <th style={s.th}>Phone</th>
                      <th style={s.th}>Status</th>
                      <th style={s.th}>Deleted At</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredArchived.map((bk) => (
                      <tr key={bk.customerKey} style={s.rowHover} onMouseEnter={e => e.currentTarget.style.backgroundColor = BLACK} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td style={s.td}>
                          <input
                            type="checkbox"
                            checked={selectedArchiveIds.some(id => bk.ids.includes(id))}
                            onChange={() => {
                              const allIds = bk.ids;
                              const allSelected = allIds.every(id => selectedArchiveIds.includes(id));
                              if (allSelected) {
                                setSelectedArchiveIds(prev => prev.filter(id => !allIds.includes(id)));
                              } else {
                                setSelectedArchiveIds(prev => [...prev, ...allIds.filter(id => !prev.includes(id))]);
                              }
                            }}
                          />
                        </td>
                        <td style={s.td}>
                          <div style={{ marginBottom: '4px' }}>
                            <span style={s.dateTag}>{formatDate(bk.booking_date)}</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '4px' }}>
                            {bk.slots.map(slot => (
                              <span key={slot} style={s.slotTag}>{slot}</span>
                            ))}
                          </div>
                        </td>
                        <td style={s.td}>{bk.client_name}</td>
                        <td style={s.td}>{bk.client_phone}</td>
                        <td style={s.td}>
                          <span style={s.statusPill(bk.status)}>{statusConfig[bk.status]?.label || bk.status}</span>
                        </td>
                        <td style={s.td}>
                          <span style={{ fontSize: '12px', color: MUTED }}>{formatDateTime(bk.deleted_at)}</span>
                        </td>
                        <td style={{ ...s.td, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button
                              style={{ ...s.btnSm, ...s.btnRestore }}
                              onClick={() => handleRestore(bk.ids)}
                              onMouseEnter={e => Object.assign(e.target.style, s.btnRestoreHover)}
                              onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'rgba(16, 185, 129, 0.15)' })}
                            >
                              Restore
                            </button>
                            <button
                              style={{ ...s.btnSm, ...s.btnPermanentDelete }}
                              onClick={() => handlePermanentDelete(bk.ids)}
                              onMouseEnter={e => Object.assign(e.target.style, s.btnPermanentDeleteHover)}
                              onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'rgba(239, 68, 68, 0.15)' })}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* --- Users Tab --- */}
          {activeTab === 'users' && (
            <>
              <div style={s.toolbar}>
                <div style={{ ...s.toolbarGroup, flex: '2 1 300px' }}>
                  <input type="text" placeholder="Search by name, email, or phone..." style={s.searchInput} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onFocus={e => e.target.style.borderColor = MUSTARD} onBlur={e => e.target.style.borderColor = BORDER} />
                </div>
                <div style={s.toolbarGroup}>
                  <span style={{ color: MUTED, fontSize: '13px' }}>{filteredUsers.length} users</span>
                </div>
              </div>

              {loading && filteredUsers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: MUTED }}>Loading users...</div>
              )}

              {!loading && filteredUsers.length === 0 && (
                <div style={s.empty}>
                  <div style={s.emptyIcon}>👤</div>
                  <div style={s.emptyTitle}>No users found</div>
                  <div style={s.emptyText}>{searchTerm ? 'Try a different search term.' : 'No registered users yet.'}</div>
                </div>
              )}

              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Name</th>
                      <th style={s.th}>Email</th>
                      <th style={s.th}>Phone</th>
                      <th style={s.th}>Bookings</th>
                      <th style={s.th}>Status</th>
                      <th style={s.th}>Last Login</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.email} style={s.rowHover} onMouseEnter={e => e.currentTarget.style.backgroundColor = BLACK} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td style={s.td}>
                          <strong>{user.name || '—'}</strong>
                        </td>
                        <td style={s.td}><span style={{ color: MUSTARD }}>{user.email}</span></td>
                        <td style={s.td}>{user.phone || '—'}</td>
                        <td style={s.td}>
                          <span style={{ color: '#10b981', fontWeight: 700 }}>{user.total_bookings || 0}</span>
                        </td>
                        <td style={s.td}>
                          {user.is_blocked ? (
                            <span style={{ color: '#ef4444', fontWeight: 700 }}>🚫 Blocked</span>
                          ) : (
                            <span style={{ color: '#10b981' }}>✅ Active</span>
                          )}
                        </td>
                        <td style={s.td}>
                          <span style={{ fontSize: '12px', color: MUTED }}>{user.last_login_at ? formatDateTime(user.last_login_at) : '—'}</span>
                        </td>
                        <td style={{ ...s.td, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              style={s.btnGhost}
                              onClick={() => setSelectedUser(user)}
                              onMouseEnter={e => Object.assign(e.target.style, s.btnGhostHover)}
                              onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: 'transparent' })}
                            >
                              View
                            </button>
                            <button
                              style={{
                                ...s.btnSm,
                                backgroundColor: user.is_blocked ? '#10b981' : '#ef4444',
                                color: '#fff',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                              onClick={() => handleToggleBlock(user.email, user.is_blocked)}
                              onMouseEnter={e => e.target.style.opacity = '0.8'}
                              onMouseLeave={e => e.target.style.opacity = '1'}
                            >
                              {user.is_blocked ? 'Unblock' : 'Block'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* --- Closures Tab --- */}
          {activeTab === 'closures' && (
            <>
              {/* Loading spinner overlay */}
              {closuresLoading && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '8px 0', marginBottom: '8px' }}>
                  <span style={{ width: '16px', height: '16px', border: `2px solid ${BORDER}`, borderTopColor: MUSTARD, borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }}></span>
                  <span style={{ fontSize: '12px', color: MUSTARD }}>Processing...</span>
                </div>
              )}
              <div style={{ ...s.card, marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px 0' }}>
                  🌧️ Close Slots for Weather / Holidays
                </h3>
                <p style={{ fontSize: '13px', color: TEXT_SEC, margin: '0 0 20px 0' }}>
                  Closed slots will not be available for booking. Users will see them as unavailable.
                </p>

                {closureError && <div style={s.alert('error')}>{closureError}</div>}
                {closureSuccess && <div style={s.alert('success')}>{closureSuccess}</div>}

                {/* Calendar */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: TEXT_SEC, display: 'block', marginBottom: '8px' }}>
                    Select Date{closureDates.length > 1 ? 's' : ''} — <span style={{ color: MUSTARD, fontWeight: 400 }}>click multiple dates</span>
                  </label>
                  {closureDates.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                      {[...closureDates].sort().map(date => (
                        <span key={date} style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', backgroundColor: MUSTARD, color: BLACK, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          {formatDate(date)}
                          <span style={{ cursor: 'pointer', fontWeight: 800, fontSize: '13px' }}
                            onClick={() => setClosureDates(prev => prev.filter(d => d !== date))}
                          >×</span>
                        </span>
                      ))}
                      {closureDates.length > 1 && (
                        <span style={{ fontSize: '10px', color: MUTED, padding: '4px 6px', cursor: 'pointer', textDecoration: 'underline' }}
                          onClick={() => { setClosureDates([]); setClosureSlots([]); setClosureFullDay(false); }}
                        >clear all</span>
                      )}
                    </div>
                  )}
                  <div style={{ backgroundColor: BLACK, borderRadius: '12px', padding: '12px', border: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                        {monthNames[closureMonth.getMonth()]} {closureMonth.getFullYear()}
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: CARD, border: `1px solid ${BORDER}`, color: TEXT_SEC, cursor: 'pointer', fontSize: '14px' }}
                          onClick={() => setClosureMonth(new Date(closureMonth.getFullYear(), closureMonth.getMonth() - 1, 1))}
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: CARD, border: `1px solid ${BORDER}`, color: TEXT_SEC, cursor: 'pointer', fontSize: '14px' }}
                          onClick={() => setClosureMonth(new Date(closureMonth.getFullYear(), closureMonth.getMonth() + 1, 1))}
                        >
                          ›
                        </button>
                      </div>
                    </div>
                    <div style={s.calendarGrid}>
                      {dayNames.map(d => <div key={d} style={s.calendarDayName}>{d}</div>)}
                      {closureCalendarDays.map((day, i) => {
                        if (!day) return <div key={i} style={s.calendarDayEmpty} />;
                        const isSelected = closureDates.includes(day.dateStr);
                        const hasClosure = !!day.closureInfo;
                        const isFullDayClosed = day.closureInfo?.fullDay;
                        const partialSlots = hasClosure && !isFullDayClosed ? day.closureInfo.slots.length : 0;
                        let dayStyle = { ...s.calendarDay, ...s.calendarDaySelectable };
                        if (isSelected) dayStyle = { ...dayStyle, ...s.calendarDaySelected };
                        if (isFullDayClosed && !isSelected) dayStyle = { ...dayStyle, borderColor: 'rgba(239, 68, 68, 0.5)', backgroundColor: 'rgba(239, 68, 68, 0.08)' };
                        if (hasClosure && !isFullDayClosed && !isSelected) dayStyle = { ...dayStyle, borderColor: 'rgba(249, 115, 22, 0.4)', backgroundColor: 'rgba(249, 115, 22, 0.05)' };
                        return (
                          <button
                            type="button"
                            key={i}
                            onClick={() => {
                              setClosureDates(prev =>
                                prev.includes(day.dateStr)
                                  ? prev.filter(d => d !== day.dateStr)
                                  : [...prev, day.dateStr]
                              );
                              setClosureError('');
                            }}
                            style={dayStyle}
                          >
                            <span style={{ color: isSelected ? BLACK : day.isToday ? MUSTARD : undefined, fontWeight: day.isToday || isSelected ? '800' : '600' }}>{day.day}</span>
                            {isFullDayClosed && (
                              <span style={{ fontSize: '8px', color: '#ef4444', lineHeight: 1 }}>🔒</span>
                            )}
                            {hasClosure && !isFullDayClosed && (
                              <span style={{ fontSize: '7px', color: '#f97316', lineHeight: 1, fontWeight: 700 }}>{partialSlots}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Calendar legend */}
                  <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '10px', color: MUTED, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'rgba(239, 68, 68, 0.5)' }}></span> Full day closed
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'rgba(249, 115, 22, 0.4)' }}></span> Partial slots closed
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: MUSTARD }}></span> Selected date
                    </span>
                  </div>
                </div>

                {/* Full day toggle */}
                {closureDates.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: TEXT_SEC }}>
                      <input
                        type="checkbox"
                        checked={closureFullDay}
                        onChange={(e) => { setClosureFullDay(e.target.checked); if (e.target.checked) setClosureSlots([]); }}
                        style={{ accentColor: MUSTARD, width: '16px', height: '16px' }}
                      />
                      <span style={{ fontWeight: closureFullDay ? 700 : 400, color: closureFullDay ? '#ef4444' : TEXT_SEC }}>
                        🔒 Close Full Day (all slots) on {closureDates.length} date{closureDates.length > 1 ? 's' : ''}
                      </span>
                    </label>
                  </div>
                )}

                {/* Slot selector */}
                {closureDates.length > 0 && !closureFullDay && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: TEXT_SEC, display: 'block', marginBottom: '8px' }}>
                      Select slots to close
                      {closureDates.length === 1 && (
                        <span style={{ color: '#ef4444', fontWeight: 400 }}> · Click red slots to reopen</span>
                      )}
                      {closureDates.length > 1 && (
                        <span style={{ color: MUSTARD, fontWeight: 400 }}> · Will apply to all {closureDates.length} dates</span>
                      )}
                    </label>
                    {/* Show alert if any selected date is fully closed */}
                    {alreadyClosedSlots.includes('ALL') && (
                      <div style={{ ...s.alert('error'), fontSize: '12px', padding: '8px 12px', marginBottom: '10px' }}>
                        ⚠️ Some selected dates are <strong>fully closed</strong>. Those will be skipped when adding new closures.
                      </div>
                    )}
                    <div style={s.grid}>
                      {availableShifts.map((slot) => {
                        const isSelected = closureSlots.includes(slot);
                        const isAlreadyClosed = alreadyClosedSlots.includes('ALL') || alreadyClosedSlots.includes(slot);
                        const canReopen = isAlreadyClosed && closureDates.length === 1;
                        let btnStyle = { ...s.slotBtn };
                        if (isSelected) {
                          btnStyle = { ...btnStyle, ...s.slotSelected };
                        } else if (isAlreadyClosed) {
                          btnStyle = { ...btnStyle, backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.5)', color: '#ef4444', cursor: canReopen ? 'pointer' : 'default', fontWeight: 700, opacity: canReopen ? 1 : 0.6 };
                        } else {
                          btnStyle = { ...btnStyle, ...s.slotOpen };
                        }
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => {
                              if (isAlreadyClosed && canReopen) {
                                handleReopenSlot(closureDates[0], slot);
                              } else if (!isAlreadyClosed) {
                                toggleClosureSlot(slot);
                              }
                            }}
                            style={btnStyle}
                            title={isAlreadyClosed
                              ? (canReopen ? 'Click to reopen this slot' : 'Already closed on some selected dates')
                              : isSelected ? 'Click to unselect' : 'Click to close this slot'}
                          >
                            {slot}
                            {isAlreadyClosed && canReopen && <span style={{ fontSize: '8px', display: 'block' }}>Tap to reopen</span>}
                            {isAlreadyClosed && !canReopen && <span style={{ fontSize: '8px', display: 'block' }}>Closed</span>}
                            {isSelected && !isAlreadyClosed && <span style={{ fontSize: '8px', display: 'block', color: '#000' }}>Close it</span>}
                          </button>
                        );
                      })}
                    </div>
                    {closureSlots.length > 0 && (
                      <div style={{ fontSize: '12px', color: MUSTARD, marginTop: '8px' }}>
                        {closureSlots.length} slot{closureSlots.length > 1 ? 's' : ''} selected · will close on {closureDates.length} date{closureDates.length > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                )}

                {/* Create button */}
                {closureDates.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      style={{ ...s.btnPrimary, marginBottom: '8px', flex: 1, minWidth: '200px' }}
                      onClick={handleCreateClosure}
                      disabled={closuresLoading || (!closureFullDay && closureSlots.length === 0)}
                      onMouseEnter={e => Object.assign(e.target.style, s.btnPrimaryHover)}
                      onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: MUSTARD })}
                    >
                      {closuresLoading ? 'Processing...' : closureFullDay
                        ? `🔒 Close Entire Day — ${closureDates.length} date${closureDates.length > 1 ? 's' : ''}`
                        : `🔒 Close ${closureSlots.length} Slot${closureSlots.length !== 1 ? 's' : ''} on ${closureDates.length} Date${closureDates.length > 1 ? 's' : ''}`}
                    </button>
                    {/* Reopen selected dates — only show if any selected date has closures */}
                    {(() => {
                      const reopenCount = closureDates.reduce((sum, date) => {
                        const entry = closuresByDate[date];
                        return sum + (entry ? entry.ids.length : 0);
                      }, 0);
                      if (reopenCount === 0) return null;
                      return (
                        <button
                          style={{ marginBottom: '8px', padding: '14px 20px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '14px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                          onClick={handleReopenSelectedDates}
                          disabled={closuresLoading}
                          onMouseEnter={e => e.target.style.backgroundColor = '#059669'}
                          onMouseLeave={e => e.target.style.backgroundColor = '#10b981'}
                        >
                          🔓 Reopen {reopenCount} Slot{reopenCount > 1 ? 's' : ''} on Selected
                        </button>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Existing closures list */}
              <div style={s.card}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px 0' }}>
                  📋 Current Closures
                </h3>
                <p style={{ fontSize: '13px', color: TEXT_SEC, margin: '0 0 16px 0' }}>
                  These slots are currently closed and unavailable for booking.
                  <span style={{ color: '#ef4444' }}> 🔒</span> = Full day &nbsp;
                  <span style={{ color: '#f97316' }}> ⏰</span> = Partial slots
                </p>

                {closuresLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '20px' }}>
                    <span style={{ width: '18px', height: '18px', border: `2px solid ${BORDER}`, borderTopColor: MUSTARD, borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }}></span>
                    <span style={{ fontSize: '13px', color: MUSTARD }}>Loading closures...</span>
                  </div>
                )}

                {!closuresLoading && closures.length === 0 && (
                  <div style={s.empty}>
                    <div style={s.emptyIcon}>✅</div>
                    <div style={s.emptyTitle}>No closures active</div>
                    <div style={s.emptyText}>All slots are currently open for booking.</div>
                  </div>
                )}

                {closures.length > 0 && (
                  <>
                    {/* Bulk reopen toolbar */}
                    {selectedClosureIds.length > 0 && (
                      <div style={{ ...s.toolbar, marginBottom: '12px', backgroundColor: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                        <div style={s.toolbarGroup}>
                          <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>
                            {selectedClosureIds.length} closure{selectedClosureIds.length > 1 ? 's' : ''} selected
                          </span>
                        </div>
                        <div style={s.toolbarGroup}>
                          <button
                            style={{ ...s.btnSm, backgroundColor: '#10b981', color: '#fff', border: 'none' }}
                            onClick={() => handleBulkReopenClosures(selectedClosureIds)}
                            onMouseEnter={e => e.target.style.opacity = '0.8'}
                            onMouseLeave={e => e.target.style.opacity = '1'}
                          >
                            🔓 Reopen Selected ({selectedClosureIds.length})
                          </button>
                          <button
                            style={{ ...s.btnSm, backgroundColor: '#2a2a2a', color: TEXT_SEC, border: `1px solid ${BORDER}` }}
                            onClick={() => setSelectedClosureIds([])}
                            onMouseEnter={e => e.target.style.backgroundColor = '#3a3a3a'}
                            onMouseLeave={e => e.target.style.backgroundColor = '#2a2a2a'}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    )}
                    <div style={{ ...s.tableWrap, borderRadius: '12px' }}>
                      <table style={s.table}>
                        <thead>
                          <tr>
                            <th style={{ ...s.th, width: '32px', textAlign: 'center', padding: '10px 6px' }}>
                              <input
                                type="checkbox"
                                checked={selectedClosureIds.length === closures.length && closures.length > 0}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setSelectedClosureIds(closures.map(c => c.id));
                                  } else {
                                    setSelectedClosureIds([]);
                                  }
                                }}
                                style={{ accentColor: MUSTARD, cursor: 'pointer' }}
                              />
                            </th>
                            <th style={s.th}>Date</th>
                            <th style={s.th}>Type</th>
                            <th style={s.th}>Slots Closed</th>
                            <th style={{ ...s.th, textAlign: 'center' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                        {(() => {
                          // Group closures by date
                          const grouped = {};
                          closures.forEach(c => {
                            if (!grouped[c.booking_date]) {
                              grouped[c.booking_date] = { ids: [], slots: [] };
                            }
                            grouped[c.booking_date].ids.push(c.id);
                            grouped[c.booking_date].slots.push(c.time_slot);
                          });
                          return Object.entries(grouped)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([date, group]) => {
                              const isFullDay = group.slots.includes('ALL');
                              const isPast = date < new Date().toISOString().split('T')[0];
                              return (
                                <tr key={date} style={{ ...s.rowHover, opacity: isPast ? 0.5 : 1 }}
                                  onMouseEnter={e => e.currentTarget.style.backgroundColor = BLACK}
                                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                  <td style={{ ...s.td, width: '32px', textAlign: 'center', padding: '10px 6px' }}>
                                    <input
                                      type="checkbox"
                                      checked={selectedClosureIds.includes(group.ids[0])}
                                      onChange={e => {
                                        if (e.target.checked) {
                                          setSelectedClosureIds(prev => [...new Set([...prev, ...group.ids])]);
                                        } else {
                                          setSelectedClosureIds(prev => prev.filter(id => !group.ids.includes(id)));
                                        }
                                      }}
                                      style={{ accentColor: MUSTARD, cursor: 'pointer' }}
                                    />
                                  </td>
                                  <td style={s.td}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={date === new Date().toISOString().split('T')[0] ? s.dateTagToday : s.dateTag}>
                                        {formatDate(date)}
                                      </span>
                                      {isPast && <span style={{ fontSize: '9px', color: MUTED }}>(past)</span>}
                                    </div>
                                  </td>
                                  <td style={s.td}>
                                    {isFullDay ? (
                                      <span style={{ ...s.statusPill('cancelled'), fontSize: '10px' }}>
                                        🔒 Full Day
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#f97316' }}>
                                        ⏰ {group.slots.length} slot{group.slots.length > 1 ? 's' : ''}
                                      </span>
                                    )}
                                  </td>
                                  <td style={s.td}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                      {isFullDay ? (
                                        <span style={{ color: MUTED, fontSize: '11px', fontStyle: 'italic' }}>All 12 slots unavailable</span>
                                      ) : (
                                        group.slots.map(slot => (
                                          <span key={slot} style={{ ...s.slotTag, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                                            {slot}
                                          </span>
                                        ))
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ ...s.td, textAlign: 'center' }}>
                                    <button
                                      style={{ ...s.btnSm, backgroundColor: '#10b981', color: '#fff', border: 'none' }}
                                      onClick={() => handleRemoveClosure(group.ids)}
                                      onMouseEnter={e => e.target.style.opacity = '0.8'}
                                      onMouseLeave={e => e.target.style.opacity = '1'}
                                      title={isFullDay ? 'Reopen entire day' : `Reopen ${group.slots.length} slot(s)`}
                                    >
                                      🔓 Reopen
                                    </button>
                                  </td>
                                </tr>
                              );
                            });
                        })()}
                      </tbody>
                    </table>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* --- Settings Tab --- */}
          {activeTab === 'settings' && (
            <>
              {settingsError && <div style={s.alert('error')}>{settingsError}</div>}
              {settingsSuccess && <div style={s.alert('success')}>{settingsSuccess}</div>}

              <div style={s.card}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px 0' }}>
                  ⚙️ Pricing Settings
                </h3>
                <p style={{ fontSize: '13px', color: TEXT_SEC, margin: '0 0 20px 0' }}>
                  Update the hourly rate for pickleball court reservations. This will apply to all new bookings immediately.
                </p>

                <form onSubmit={handleUpdateSettings}>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: TEXT_SEC, display: 'block', marginBottom: '8px' }}>
                      Hourly Rate (PHP)
                    </label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: MUSTARD, minWidth: '60px' }}>₱</div>
                      <input
                        type="number"
                        min="1"
                        max="99999"
                        value={hourlyRateInput}
                        onChange={e => setHourlyRateInput(e.target.value)}
                        onFocus={e => e.target.style.borderColor = MUSTARD}
                        onBlur={e => e.target.style.borderColor = BORDER}
                        style={{
                          ...s.input,
                          flex: 1,
                          fontSize: '18px',
                          fontWeight: 600,
                          letterSpacing: '0.5px',
                        }}
                        placeholder="350"
                      />
                      <div style={{ fontSize: '12px', color: MUTED }}>/hour</div>
                    </div>
                    <p style={{ fontSize: '11px', color: MUTED, margin: '8px 0 0 0' }}>
                      Current rate: <strong style={{ color: MUSTARD }}>₱{hourlyRate}/hour</strong>
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="submit"
                      disabled={settingsLoading}
                      style={s.btnPrimary}
                      onMouseEnter={e => !settingsLoading && Object.assign(e.target.style, s.btnPrimaryHover)}
                      onMouseLeave={e => !settingsLoading && Object.assign(e.target.style, { backgroundColor: MUSTARD })}
                    >
                      {settingsLoading ? '💾 Saving...' : '✓ Save Changes'}
                    </button>
                  </div>
                </form>

                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '20px', marginTop: '20px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 12px 0' }}>Info</h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: TEXT_SEC, lineHeight: 1.6 }}>
                    <li>Changes apply immediately to new bookings</li>
                    <li>Existing confirmed bookings retain their original rate</li>
                    <li>Use this to manage promos, seasonal rates, or testing</li>
                    <li>No code changes needed — fully dynamic</li>
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* --- Receipt Modal --- */}
      {showReceipt && (
        <div style={s.modalOverlay} onClick={() => setShowReceipt(null)}>
          <div style={s.modalCard} onClick={e => e.stopPropagation()}>
            <img src={showReceipt.receipt_url} alt="Receipt" style={s.modalImg} />
            <div style={s.modalTitle}>{showReceipt.client_name}</div>
            <div style={s.modalSub}>{showReceipt.slots.join(', ')} • {formatDate(showReceipt.booking_date)}</div>
            <button style={{ ...s.btnPrimary, marginBottom: '8px' }} onClick={() => window.open(showReceipt.receipt_url, '_blank')} onMouseEnter={e => Object.assign(e.target.style, s.btnPrimaryHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: MUSTARD })}>Open in New Tab</button>
            <button style={s.btnSecondary} onClick={() => setShowReceipt(null)} onMouseEnter={e => Object.assign(e.target.style, s.btnSecondaryHover)} onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: '#2a2a2a' })}>Close</button>
          </div>
        </div>
      )}

      {/* --- User Profile Modal --- */}
      {selectedUser && (
        <div style={s.modalOverlay} onClick={() => setSelectedUser(null)}>
          <div style={s.modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={s.modalTitle}>{selectedUser.name || 'User'}</div>
                <div style={s.modalSub}>{selectedUser.email}</div>
              </div>
              <button
                style={{ backgroundColor: 'transparent', border: 'none', color: MUTED, fontSize: '20px', cursor: 'pointer' }}
                onClick={() => setSelectedUser(null)}
              >
                ✕
              </button>
            </div>

            <div style={s.modalRow}>
              <span style={s.modalLabel}>Phone</span>
              <span style={s.modalValue}>{selectedUser.phone || '—'}</span>
            </div>
            <div style={s.modalRow}>
              <span style={s.modalLabel}>Address</span>
              <span style={s.modalValue}>{selectedUser.address || '—'}</span>
            </div>
            <div style={s.modalRow}>
              <span style={s.modalLabel}>Total Bookings</span>
              <span style={s.modalValue}>{selectedUser.total_bookings || 0}</span>
            </div>
            <div style={s.modalRow}>
              <span style={s.modalLabel}>Verified Until</span>
              <span style={s.modalValue}>
                {selectedUser.verified_until ? formatDateTime(selectedUser.verified_until) : '—'}
                {selectedUser.verified_until && new Date(selectedUser.verified_until) > new Date() && (
                  <span style={{ color: '#10b981', marginLeft: '8px' }}>✅ Active</span>
                )}
              </span>
            </div>
            <div style={s.modalRow}>
              <span style={s.modalLabel}>Last Login</span>
              <span style={s.modalValue}>{selectedUser.last_login_at ? formatDateTime(selectedUser.last_login_at) : '—'}</span>
            </div>
            <div style={s.modalRow}>
              <span style={s.modalLabel}>Registered</span>
              <span style={s.modalValue}>{selectedUser.created_at ? formatDateTime(selectedUser.created_at) : '—'}</span>
            </div>
            <div style={s.modalRow}>
              <span style={s.modalLabel}>Status</span>
              <span style={s.modalValue}>
                {selectedUser.is_blocked ? (
                  <span style={{ color: '#ef4444' }}>🚫 Blocked</span>
                ) : (
                  <span style={{ color: '#10b981' }}>✅ Active</span>
                )}
              </span>
            </div>

            <button
              style={{ ...s.btnSecondary, marginTop: '16px' }}
              onClick={() => setSelectedUser(null)}
              onMouseEnter={e => Object.assign(e.target.style, s.btnSecondaryHover)}
              onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: '#2a2a2a' })}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* --- Reschedule Modal --- */}
      {showRescheduleModal && (
        <div style={s.modalOverlay} onClick={() => setShowRescheduleModal(false)}>
          <div style={{ ...s.modalCard, maxWidth: '550px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={s.modalTitle}>Reschedule Booking</div>
                <div style={s.modalSub}>
                  {rescheduleCustomer} • {formatDate(rescheduleOldDate)} at {rescheduleOldSlots.join(', ')}
                </div>
              </div>
              <button
                style={{ backgroundColor: 'transparent', border: 'none', color: MUTED, fontSize: '20px', cursor: 'pointer' }}
                onClick={() => setShowRescheduleModal(false)}
              >
                ✕
              </button>
            </div>

            {rescheduleError && <div style={s.alert('error')}>{rescheduleError}</div>}
            {rescheduleSuccess && <div style={s.alert('success')}>{rescheduleSuccess}</div>}

            {/* Interactive Calendar */}
            <div style={{ marginBottom: '16px' }}>
              <label style={s.label}>Select New Date</label>
              <div style={{ backgroundColor: BLACK, borderRadius: '12px', padding: '12px', border: `1px solid ${BORDER}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                    {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: CARD, border: `1px solid ${BORDER}`, color: TEXT_SEC, cursor: 'pointer', fontSize: '14px' }}
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: CARD, border: `1px solid ${BORDER}`, color: TEXT_SEC, cursor: 'pointer', fontSize: '14px' }}
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                    >
                      ›
                    </button>
                  </div>
                </div>
                <div style={s.calendarGrid}>
                  {dayNames.map(d => <div key={d} style={s.calendarDayName}>{d}</div>)}
                  {calendarDays.map((day, i) => {
                    if (!day) return <div key={i} style={s.calendarDayEmpty} />;
                    const isSelected = rescheduleNewDate === day.dateStr;
                    let dayStyle = { ...s.calendarDay };
                    if (!day.selectable) dayStyle = { ...dayStyle, ...s.calendarDayDisabled };
                    else if (isSelected) dayStyle = { ...dayStyle, ...s.calendarDaySelected };
                    else dayStyle = { ...dayStyle, ...s.calendarDaySelectable };
                    return (
                      <button
                        type="button"
                        key={i}
                        disabled={!day.selectable}
                        onClick={() => { setRescheduleNewDate(day.dateStr); setRescheduleNewSlots([]); setRescheduleError(''); }}
                        style={dayStyle}
                      >
                        <span style={{ color: isSelected ? BLACK : day.isToday ? MUSTARD : undefined, fontWeight: day.isToday || isSelected ? '800' : '600' }}>{day.day}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Available slots with multi-select */}
            {rescheduleNewDate && (
              <div style={{ marginBottom: '16px' }}>
                <label style={s.label}>Select New Time Slot(s) – Click multiple</label>
                <div style={s.grid}>
                  {availableShifts.map((slot) => {
                    const isBooked = rescheduleBookedSlots.includes(slot);
                    const isSelected = rescheduleNewSlots.includes(slot);
                    let btnStyle = { ...s.slotBtn };
                    if (isBooked) btnStyle = { ...btnStyle, ...s.slotTaken };
                    else if (isSelected) btnStyle = { ...btnStyle, ...s.slotSelected };
                    else btnStyle = { ...btnStyle, ...s.slotOpen };
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={isBooked}
                        onClick={() => toggleRescheduleSlot(slot)}
                        style={btnStyle}
                      >
                        {slot}
                        {isSelected && <span style={{ fontSize: '8px', display: 'block', color: '#000' }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
                {rescheduleNewSlots.length > 0 && (
                  <div style={{ fontSize: '12px', color: MUSTARD, marginTop: '8px' }}>
                    {rescheduleNewSlots.length} slot{rescheduleNewSlots.length > 1 ? 's' : ''} selected
                  </div>
                )}
              </div>
            )}

            <button
              style={s.btnPrimary}
              onClick={handleReschedule}
              disabled={rescheduleLoading || !rescheduleNewDate || rescheduleNewSlots.length === 0}
              onMouseEnter={e => Object.assign(e.target.style, s.btnPrimaryHover)}
              onMouseLeave={e => Object.assign(e.target.style, { backgroundColor: MUSTARD })}
            >
              {rescheduleLoading ? 'Rescheduling...' : `Reschedule (${rescheduleNewSlots.length} slot${rescheduleNewSlots.length !== 1 ? 's' : ''})`}
            </button>
            <button
              style={{ ...s.btnOutline, marginTop: '12px', width: '100%', justifyContent: 'center' }}
              onClick={() => setShowRescheduleModal(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* --- Confirmation Modal --- */}
      {confirmModal.isOpen && (
        <div style={s.modalOverlay} onClick={() => { if (!confirmModal.loading) closeConfirm(); }}>
          <div style={{ ...s.modalCard, maxWidth: '420px', textAlign: 'center' }} className="modal-fade-in" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>
              {confirmModal.title.includes('Delete') || confirmModal.title.includes('Empty') ? '⚠️' :
               confirmModal.title.includes('Block') ? '🚫' : '💬'}
            </div>
            <div style={s.modalTitle}>{confirmModal.title}</div>
            <div style={{ ...s.modalSub, fontSize: '14px', lineHeight: 1.6, color: TEXT_SEC }}>
              {confirmModal.message}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button
                style={{ ...s.btnSecondary, flex: 1 }}
                onClick={closeConfirm}
                disabled={confirmModal.loading}
              >
                Cancel
              </button>
              <button
                style={{ ...s.btnPrimary, flex: 1 }}
                onClick={() => {
                  if (confirmModal.onConfirm) {
                    confirmModal.onConfirm();
                  }
                }}
                disabled={confirmModal.loading}
              >
                {confirmModal.loading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}