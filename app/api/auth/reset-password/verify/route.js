import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, scryptSync } from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export async function POST(request) {
  try {
    const { token, newPassword } = await request.json();

    if (!token || !newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Token and password (min 6 characters) required' },
        { status: 400 }
      );
    }

    // Find user with this token
    const { data: user, error: userError } = await supabase
      .from('verified_emails')
      .select('email, reset_token_expires_at, is_blocked')
      .eq('reset_token', token)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
    }

    if (user.is_blocked) {
      return NextResponse.json({ error: 'Account blocked. Contact support.' }, { status: 403 });
    }

    // Check if token expired
    if (new Date(user.reset_token_expires_at) < new Date()) {
      // Clear expired token
      await supabase
        .from('verified_emails')
        .update({ reset_token: null, reset_token_expires_at: null })
        .eq('email', user.email);
      return NextResponse.json({ error: 'Reset link expired. Please request a new one.' }, { status: 400 });
    }

    // Hash new password
    const passwordHash = hashPassword(newPassword);

    // Update password and clear token
    const { error: updateError } = await supabase
      .from('verified_emails')
      .update({
        password_hash: passwordHash,
        has_set_password: true,
        reset_token: null,
        reset_token_expires_at: null,
        verified_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('email', user.email);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Reset password verify error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}