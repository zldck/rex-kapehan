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

    // Check if email is blocked
    const { data: existing } = await supabase
      .from('verified_emails')
      .select('is_blocked')
      .eq('email', email)
      .single();

    if (existing?.is_blocked) {
      return NextResponse.json(
        { error: 'Unable to send login link. Please contact support.' },
        { status: 403 }
      );
    }

    // Rate limit: 1 link per 60 seconds per email
    const { data: recent } = await supabase
      .from('verified_emails')
      .select('magic_token_expires_at')
      .eq('email', email)
      .gt('magic_token_expires_at', new Date(Date.now() - 60 * 1000).toISOString())
      .limit(1);

    if (recent && recent.length > 0) {
      return NextResponse.json(
        { error: 'Please wait 60 seconds before requesting a new link.' },
        { status: 429 }
      );
    }

    // Generate token (32 bytes -> hex = 64 chars)
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Delete old tokens for this email
    await supabase
      .from('verified_emails')
      .update({ magic_token: null, magic_token_expires_at: null })
      .eq('email', email);

    // Upsert the token
    const { error: upsertError } = await supabase
      .from('verified_emails')
      .upsert({
        email,
        magic_token: token,
        magic_token_expires_at: expiresAt,
      }, { onConflict: 'email' });

    if (upsertError) {
      console.error('Upsert error:', upsertError);
      return NextResponse.json({ error: 'Failed to generate login link' }, { status: 500 });
    }

    // Send the email
    const loginLink = `${APP_URL}/dashboard?token=${token}`;

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#0a0a0a">
        <h2 style="color:#D4AF37;margin-top:0">Rex Kapehan</h2>
        <p>Click the button below to log in to your dashboard:</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${loginLink}" style="background:#D4AF37;color:#000;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">
            Log In to Dashboard
          </a>
        </div>
        <p style="color:#666;font-size:14px;line-height:1.5">
          This link expires in <strong>10 minutes</strong>.<br>
          If you didn't request this, ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#999;font-size:12px">Talisay City Pickleball Court Reservation</p>
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
        subject: 'Your Rex Kapehan Login Link',
        html: html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Resend error:', errText);
      return NextResponse.json(
        { error: 'Failed to send login link. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Magic link error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}