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

function generateOtp() {
  return Math.floor(100000 + randomBytes(3).readUIntBE(0, 3) % 900000).toString();
}

export async function POST(request) {
  try {
    const { email, phone } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    // Check if email is blocked or still valid (30 days)
    const { data: existing } = await supabase
      .from('verified_emails')
      .select('verified_until, is_blocked')
      .eq('email', email)
      .single();

    if (existing) {
      if (existing.is_blocked) {
        return NextResponse.json(
          { error: 'Unable to send code. Please contact support.' },
          { status: 403 }
        );
      }
      
      // Still valid? Skip OTP entirely
      if (existing.verified_until && new Date(existing.verified_until) > new Date()) {
        // Silently update phone for anti-spam tracking
        if (phone) {
          await supabase
            .from('verified_emails')
            .update({ phone })
            .eq('email', email);
        }
        return NextResponse.json({ success: true, skipOtp: true });
      }
    }

    // Rate limit: 1 send per 60 seconds per email
    const { data: recent } = await supabase
      .from('email_otps')
      .select('created_at')
      .eq('email', email)
      .gt('created_at', new Date(Date.now() - 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (recent && recent.length > 0) {
      return NextResponse.json(
        { error: 'Please wait 60 seconds before requesting a new code.' },
        { status: 429 }
      );
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await supabase.from('email_otps').delete().eq('email', email);

    const { error: insertError } = await supabase
      .from('email_otps')
      .insert({ email, code, expires_at: expiresAt });

    if (insertError) {
      console.error('OTP insert error:', insertError);
      return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rex Kapehan <onboarding@resend.dev>',
        to: email,
        subject: 'Your Rex Kapehan Verification Code',
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#0a0a0a">
            <h2 style="color:#D4AF37;margin-top:0">Rex Kapehan</h2>
            <p>Your verification code is:</p>
            <div style="font-size:36px;font-weight:800;letter-spacing:10px;background:#f5f5f5;padding:20px;border-radius:12px;text-align:center;margin:20px 0">
              ${code}
            </div>
            <p style="color:#666;font-size:14px;line-height:1.5">
              This code expires in <strong>5 minutes</strong>.<br>
              Do not share it with anyone.
            </p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
            <p style="color:#999;font-size:12px">
              Talisay City Pickleball Court Reservation
            </p>
          </div>
        `,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend error:', errText);
      return NextResponse.json(
        { error: 'Failed to send email. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Send OTP error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}