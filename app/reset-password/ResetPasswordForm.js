'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const MUSTARD = '#D4AF37';
const BLACK = '#0a0a0a';
const CARD = '#141414';
const BORDER = '#2a2a2a';
const MUTED = '#888888';
const TEXT_SEC = '#aaaaaa';

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState('request');

  useEffect(() => {
    if (token) {
      setStep('reset');
    }
  }, [token]);

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/reset-password/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send reset link.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
    } catch (err) {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/reset-password/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to reset password.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
      setTimeout(() => {
        router.push('/');
      }, 3000);
    } catch (err) {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  const styles = {
    wrapper: { minHeight: '100vh', backgroundColor: BLACK, color: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    card: { width: '100%', maxWidth: '400px', backgroundColor: CARD, border: `1px solid ${BORDER}`, borderRadius: '24px', padding: '40px' },
    title: { fontSize: '24px', fontWeight: 800, textAlign: 'center', margin: '0 0 8px 0' },
    sub: { fontSize: '13px', color: TEXT_SEC, textAlign: 'center', margin: '0 0 32px 0' },
    input: { width: '100%', backgroundColor: BLACK, border: `1px solid ${BORDER}`, padding: '14px 16px', borderRadius: '14px', color: '#ffffff', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' },
    btnPrimary: { width: '100%', padding: '14px', backgroundColor: MUSTARD, color: BLACK, border: 'none', borderRadius: '14px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' },
    btnPrimaryHover: { backgroundColor: '#E5C158' },
    btnOutline: { width: '100%', padding: '14px', backgroundColor: 'transparent', color: TEXT_SEC, border: `1px solid ${BORDER}`, borderRadius: '14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', marginTop: '12px' },
    errorBanner: { padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', color: '#f87171', fontSize: '13px', fontWeight: 500, marginBottom: '16px' },
    successBanner: { padding: '12px 16px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '12px', color: '#34d399', fontSize: '13px', fontWeight: 500, marginBottom: '16px' },
    brand: { fontSize: '22px', fontWeight: 800, textAlign: 'center', marginBottom: '24px' },
    brandRex: { color: MUSTARD },
    brandKapehan: { color: '#ffffff', textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 10px rgba(0,0,0,0.8)' },
    label: { display: 'block', fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' },
  };

  if (success) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.brand}>
            <span style={styles.brandRex}>REX</span>
            <span style={styles.brandKapehan}>KAPEHAN</span>
          </div>
          <div style={styles.successBanner}>
            {step === 'request' ? '✅ Reset link sent!' : '✅ Password reset successful!'}
          </div>
          <p style={{ textAlign: 'center', color: TEXT_SEC, fontSize: '14px', marginTop: '16px' }}>
            {step === 'request'
              ? 'Check your email for the reset link. It expires in 30 minutes.'
              : 'You can now log in with your new password.'}
          </p>
          <Link href="/" style={{ ...styles.btnPrimary, display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: '16px' }}>
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  if (step === 'reset') {
    if (!token) {
      return (
        <div style={styles.wrapper}>
          <div style={styles.card}>
            <div style={styles.brand}>
              <span style={styles.brandRex}>REX</span>
              <span style={styles.brandKapehan}>KAPEHAN</span>
            </div>
            <div style={styles.errorBanner}>❌ Invalid reset link. Please request a new one.</div>
            <Link href="/" style={{ ...styles.btnPrimary, display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Go to Login
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.brand}>
            <span style={styles.brandRex}>REX</span>
            <span style={styles.brandKapehan}>KAPEHAN</span>
          </div>
          <h1 style={styles.title}>Set New Password</h1>
          <p style={styles.sub}>Enter your new password below.</p>

          {error && <div style={styles.errorBanner}>{error}</div>}

          <form onSubmit={handleResetPassword}>
            <label style={styles.label}>New Password</label>
            <input
              type="password"
              required
              placeholder="Min 6 characters"
              style={styles.input}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
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

            <button
              type="submit"
              disabled={loading}
              style={styles.btnPrimary}
              onMouseEnter={e => !loading && Object.assign(e.target.style, styles.btnPrimaryHover)}
              onMouseLeave={e => !loading && Object.assign(e.target.style, { backgroundColor: MUSTARD })}
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <Link href="/" style={{ color: TEXT_SEC, fontSize: '12px', textDecoration: 'none' }}>
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <span style={styles.brandRex}>REX</span>
          <span style={styles.brandKapehan}>KAPEHAN</span>
        </div>
        <h1 style={styles.title}>Reset Password</h1>
        <p style={styles.sub}>Enter your email to receive a reset link.</p>

        {error && <div style={styles.errorBanner}>{error}</div>}

        <form onSubmit={handleRequestReset}>
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

          <button
            type="submit"
            disabled={loading}
            style={styles.btnPrimary}
            onMouseEnter={e => !loading && Object.assign(e.target.style, styles.btnPrimaryHover)}
            onMouseLeave={e => !loading && Object.assign(e.target.style, { backgroundColor: MUSTARD })}
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <Link href="/" style={{ color: TEXT_SEC, fontSize: '12px', textDecoration: 'none' }}>
            ← Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}