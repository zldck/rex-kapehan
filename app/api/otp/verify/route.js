import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

export async function POST(request) {
  try {
    const { email, code, phone } = await request.json();
    if (!email || !code || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Valid email and 6-digit code required' }, { status: 400 });
    }

    // Check blocked status
    const { data: existing } = await supabase
      .from('verified_emails')
      .select('is_blocked')
      .eq('email', email)
      .single();

    if (existing?.is_blocked) {
      return NextResponse.json(
        { error: 'Unable to verify. Please contact support.' },
        { status: 403 }
      );
    }

    const { data: otpRow, error: fetchError } = await supabase
      .from('email_otps')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !otpRow) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 });
    }

    if (new Date(otpRow.expires_at) < new Date()) {
      await supabase.from('email_otps').delete().eq('id', otpRow.id);
      return NextResponse.json({ error: 'Code expired. Please request a new one.' }, { status: 401 });
    }

    if (otpRow.attempts >= 5) {
      await supabase.from('email_otps').delete().eq('id', otpRow.id);
      return NextResponse.json(
        { error: 'Too many failed attempts. Please request a new code.' },
        { status: 429 }
      );
    }

    if (otpRow.code !== code) {
      await supabase
        .from('email_otps')
        .update({ attempts: otpRow.attempts + 1 })
        .eq('id', otpRow.id);
      return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
    }

    await supabase.from('email_otps').delete().eq('id', otpRow.id);

    // Verified for 30 days
    const verifiedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: upsertError } = await supabase
      .from('verified_emails')
      .upsert({ 
        email, 
        verified_at: new Date().toISOString(),
        verified_until: verifiedUntil,
        ...(phone ? { phone } : {})
      }, { onConflict: 'email' });

    if (upsertError) {
      console.error('Verified email upsert error:', upsertError);
      return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}