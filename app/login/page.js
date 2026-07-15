'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

const MUSTARD = '#D4AF37';
const BLACK = '#0a0a0a';
const CARD = '#141414';
const BORDER = '#2a2a2a';
const MUTED = '#888888';
const TEXT_SEC = '#aaaaaa';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectFrom = searchParams.get('from') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'otp' | 'setPassword'
  const [otpInput, setOtpInput] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [emailForOtp, setEmailForOtp] = useState('');

  const styles = {
    wrapper: { minHeight: '100vh', backgroundColor: BLACK, color: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    card: { width: '100%', maxWidth: '400px', backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '24px', padding: '40px' },
    title: { fontSize: '24px', fontWeight: 800, textAlign: 'center', margin: '0 0 8px 0' },
    sub: { fontSize: '13px', color: TEXT_SEC, textAlign: 'center', margin: '0 0 32px 0' },
    input: { width: '100%', backgroundColor: BLACK, border: `1px solid ${BORDER}`, padding: '14px 16px', borderRadius: '14px', color: '#ffffff', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' },
    btnPrimary: { width: '100%', padding: '14px', backgroundColor: MUSTARD, color: BLACK, border: 'none', borderRadius: '14px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' },
    btnPrimaryHover: { backgroundColor: '#E5C158' },
    btnSecondary: { width: '100%', padding: '14px', backgroundColor: 'transparent', color: TEXT_SEC, border: `1px solid ${BORDER}`, borderRadius: '14px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', marginTop: '12px' },
    error: { padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', color: '#f87171', fontSize: '13px', fontWeight: 500, marginBottom: '16px' },
    success: { padding: '12px 16px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '12px', color: '#34d399', fontSize: '13px', fontWeight: 500, marginBottom: '16px' },
    label: { display: 'block', fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' },
    hint: { fontSize: '12px', color: MUTED, marginTop: '-8px', marginBottom: '16px' },
    brand: { fontSize: '22px', fontWeight: 800, textAlign: 'center', marginBottom: '24px' },
    brandRex: { color: MUSTARD, textShadow: '0 0 20px rgba(212, 175, 55, 0.3)' },
    brandKapehan: { color: '#ffffff', textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 10px rgba(0,0,0,0.8)' },
  };

  // --- OTP Timer Cleanup ---
  useEffect(() => {
    let timer;
    if (otpCountdown > 0) {
      timer = setTimeout(() => setOtpCountdown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [otpCountdown]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, action: 'login' }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          // User exists but has no password - send OTP
          setEmailForOtp(email);
          setMode('otp');
          await sendOtp(email);
          setLoading(false);
          return;
        }
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      // Login success
      localStorage.setItem('rk_verified_email', data.email);
      localStorage.setItem('rk_user_logged_in', 'true');
      setSuccess('Login successful! Redirecting...');
      setTimeout(() => {
        router.push(redirectFrom);
      }, 1000);
    } catch (err) {
      console.error('Login error:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async (emailToUse) => {
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToUse }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.hasPassword) {
          setError('This email has a password. Please log in directly.');
          setMode('login');
          return;
        }
        setError(data.error || 'Failed to send OTP');
        return;
      }

      setOtpCountdown(300);
      setSuccess('OTP sent to your email!');
    } catch (err) {
      console.error('Send OTP error:', err);
      setError('Failed to send OTP');
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (otpCountdown <= 0) {
      setError('OTP expired. Please request a new one.');
      setLoading(false);
      return;
    }

    if (!/^\d{6}$/.test(otpInput)) {
      setError('Please enter the 6-digit code.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailForOtp, code: otpInput }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Verification failed');
        setLoading(false);
        return;
      }

      // OTP verified - move to set password
      setMode('setPassword');
      setEmail(emailForOtp);
      setSuccess('Email verified! Please set your password.');
      setOtpInput('');
    } catch (err) {
      console.error('Verify error:', err);
      setError('Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, action: 'setPassword' }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to set password');
        setLoading(false);
        return;
      }

      // Password set - now log in
      localStorage.setItem('rk_verified_email', email);
      localStorage.setItem('rk_user_logged_in', 'true');
      setSuccess('Password set! Logging in...');
      setTimeout(() => {
        router.push(redirectFrom);
      }, 1000);
    } catch (err) {
      console.error('Set password error:', err);
      setError('Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  const formatCountdown = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // --- RENDER: Login Form ---
  if (mode === 'login') {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.brand}>
            <span style={styles.brandRex}>REX</span>
            <span style={styles.brandKapehan}>KAPEHAN</span>
          </div>
          <h1 style={styles.title}>Welcome Back</h1>
          <p style={styles.sub}>Log in to manage your bookings</p>

          {error && <div style={styles.error}>{error}</div>}
          {success && <div style={styles.success}>{success}</div>}

          <form onSubmit={handleLogin}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              required
              placeholder="you@example.com"
              style={styles.input}
              value={email}
              onChange={e => setEmail(e.target.value)}
              onFocus={e => e.target.style.borderColor = MUSTARD}
              onBlur={e => e.target.style.borderColor = BORDER}
            />

            <label style={styles.label}>Password</label>
            <input
              type="password"
              required
              placeholder="Enter your password"
              style={styles.input}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={e => e.target.style.borderColor = MUSTARD}
              onBlur={e => e.target.style.borderColor = BORDER}
            />

            <button
              type="submit"
              disabled={loading}
              style={styles.btnPrimary}
              onMouseEnter={e => !loading && Object.assign(e.target.style, styles.btnPrimaryHover)}
              onMouseLeave={e => !loading && Object.assign(e.target.style, { backgroundColor: MUSTARD })}
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <button
            style={styles.btnSecondary}
            onClick={() => {
              setMode('otp');
              setError('');
              setSuccess('');
              setEmailForOtp(email || '');
              if (email) sendOtp(email);
            }}
          >
            Don't have a password? Set one with OTP
          </button>

          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <Link href="/" style={{ color: TEXT_SEC, fontSize: '12px', textDecoration: 'none' }}>
              ← Back to Booking
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER: OTP Verification ---
  if (mode === 'otp') {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.brand}>
            <span style={styles.brandRex}>REX</span>
            <span style={styles.brandKapehan}>KAPEHAN</span>
          </div>
          <h1 style={styles.title}>Verify Your Email</h1>
          <p style={styles.sub}>
            We sent a 6-digit code to <strong>{emailForOtp}</strong>
          </p>

          {error && <div style={styles.error}>{error}</div>}
          {success && <div style={styles.success}>{success}</div>}

          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <span style={{ color: MUTED, fontSize: '13px' }}>
              Expires in: <strong style={{ color: '#ffffff' }}>{formatCountdown(otpCountdown)}</strong>
            </span>
          </div>

          <form onSubmit={handleVerifyOtp}>
            <label style={styles.label}>Enter 6-Digit Code</label>
            <input
              type="text"
              required
              placeholder="123456"
              maxLength={6}
              style={{ ...styles.input, textAlign: 'center', fontSize: '24px', letterSpacing: '8px', fontFamily: 'monospace' }}
              value={otpInput}
              onChange={e => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onFocus={e => e.target.style.borderColor = MUSTARD}
              onBlur={e => e.target.style.borderColor = BORDER}
            />

            <button
              type="submit"
              disabled={loading || otpCountdown <= 0}
              style={styles.btnPrimary}
              onMouseEnter={e => !loading && Object.assign(e.target.style, styles.btnPrimaryHover)}
              onMouseLeave={e => !loading && Object.assign(e.target.style, { backgroundColor: MUSTARD })}
            >
              {loading ? 'Verifying...' : 'Verify & Set Password'}
            </button>
          </form>

          <button
            style={styles.btnSecondary}
            onClick={() => {
              setError('');
              setSuccess('');
              sendOtp(emailForOtp);
            }}
            disabled={otpCountdown > 0}
          >
            {otpCountdown > 0 ? `Wait ${formatCountdown(otpCountdown)}` : 'Resend OTP'}
          </button>

          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <button
              style={{ color: TEXT_SEC, fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
            >
              ← Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER: Set Password ---
  if (mode === 'setPassword') {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.brand}>
            <span style={styles.brandRex}>REX</span>
            <span style={styles.brandKapehan}>KAPEHAN</span>
          </div>
          <h1 style={styles.title}>Set Your Password</h1>
          <p style={styles.sub}>
            Create a password for <strong>{email}</strong>
          </p>

          {error && <div style={styles.error}>{error}</div>}
          {success && <div style={styles.success}>{success}</div>}

          <form onSubmit={handleSetPassword}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              required
              placeholder="Min 6 characters"
              style={styles.input}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={e => e.target.style.borderColor = MUSTARD}
              onBlur={e => e.target.style.borderColor = BORDER}
            />

            <label style={styles.label}>Confirm Password</label>
            <input
              type="password"
              required
              placeholder="Re-enter your password"
              style={styles.input}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              onFocus={e => e.target.style.borderColor = MUSTARD}
              onBlur={e => e.target.style.borderColor = BORDER}
            />

            <p style={styles.hint}>Password must be at least 6 characters.</p>

            <button
              type="submit"
              disabled={loading}
              style={styles.btnPrimary}
              onMouseEnter={e => !loading && Object.assign(e.target.style, styles.btnPrimaryHover)}
              onMouseLeave={e => !loading && Object.assign(e.target.style, { backgroundColor: MUSTARD })}
            >
              {loading ? 'Setting password...' : 'Set Password & Login'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <button
              style={{ color: TEXT_SEC, fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
            >
              ← Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }
}