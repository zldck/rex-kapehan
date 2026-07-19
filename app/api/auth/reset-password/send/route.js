import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function POST(request) {
  try {
    const { email } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    // Check if user exists and has a password
    const { data: user, error: userError } = await supabase
      .from('verified_emails')
      .select('email, has_set_password, is_blocked')
      .eq('email', email)
      .single();

    if (userError || !user) {
      // Don't reveal that the user doesn't exist (security)
      return NextResponse.json({ success: true });
    }

    if (user.is_blocked) {
      return NextResponse.json({ error: 'Account blocked. Contact support.' }, { status: 403 });
    }

    if (!user.has_set_password) {
      return NextResponse.json(
        { error: 'No password set. Please use OTP to set one.' },
        { status: 409 }
      );
    }

    // Rate limit: 1 request per 5 minutes
    const { data: recent } = await supabase
      .from('verified_emails')
      .select('last_login_at')
      .eq('email', email)
      .gt('last_login_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .limit(1);

    if (recent && recent.length > 0) {
      return NextResponse.json(
        { error: 'Please wait 5 minutes before requesting another reset link.' },
        { status: 429 }
      );
    }

    // Generate reset token
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    // Store token in verified_emails table
    const { error: updateError } = await supabase
      .from('verified_emails')
      .update({
        reset_token: token,
        reset_token_expires_at: expiresAt,
      })
      .eq('email', email);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json({ error: 'Failed to generate reset link' }, { status: 500 });
    }

    // Send email
    const resetLink = `${APP_URL}/reset-password?token=${token}`;

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#0a0a0a">
        <div style="background:#D4AF37;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="margin:0;color:#000;font-size:24px">🎾 Rex Kapehan</h1>
          <p style="margin:0;color:#000;font-weight:600">Password Reset</p>
        </div>
        <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
          <p>We received a request to reset your password.</p>
          <p>Click the button below to set a new password:</p>
          <div style="text-align:center;margin:24px 0">
            <a href="${resetLink}" style="background:#D4AF37;color:#000;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">
              Reset Password
            </a>
          </div>
          <p style="color:#666;font-size:14px;line-height:1.5">
            This link expires in <strong>30 minutes</strong>.<br>
            If you didn't request this, ignore this email.
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="color:#999;font-size:12px">Rex Kapehan • Talisay City Pickleball Court</p>
        </div>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rex Kapehan <no-reply@mail.rexkapehan.com>',
        to: email,
        subject: 'Rex Kapehan - Reset Your Password',
        html: html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Resend error:', errText);
      return NextResponse.json(
        { error: 'Failed to send email. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Reset password send error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}