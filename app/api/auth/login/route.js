import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
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

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const derivedHash = scryptSync(password, salt, 64).toString('hex');
  return timingSafeEqual(Buffer.from(hash), Buffer.from(derivedHash));
}

export async function POST(request) {
  try {
    const { email, password, action } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    // Get user
    const { data: user, error: fetchError } = await supabase
      .from('verified_emails')
      .select('*')
      .eq('email', email)
      .single();

    if (fetchError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.is_blocked) {
      return NextResponse.json({ error: 'Account blocked' }, { status: 403 });
    }

    // --- ACTION: SET PASSWORD (after OTP verification) ---
    if (action === 'setPassword') {
      if (!password || password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
      }

      const passwordHash = hashPassword(password);

      const { error: updateError } = await supabase
        .from('verified_emails')
        .update({
          password_hash: passwordHash,
          has_set_password: true,
          verified_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          verified_at: new Date().toISOString(),
        })
        .eq('email', email);

      if (updateError) {
        console.error('Set password error:', updateError);
        return NextResponse.json({ error: 'Failed to set password' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Password set successfully' });
    }

    // --- ACTION: LOGIN ---
    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    if (!user.has_set_password || !user.password_hash) {
      return NextResponse.json(
        { error: 'No password set. Please use OTP to set one.' },
        { status: 409 }
      );
    }

    // Verify password
    try {
      const isValid = verifyPassword(password, user.password_hash);
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
      }
    } catch (err) {
      console.error('Password verification error:', err);
      return NextResponse.json({ error: 'Login failed' }, { status: 500 });
    }

    // Extend verification for 30 days
    await supabase
      .from('verified_emails')
      .update({
        verified_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        last_login_at: new Date().toISOString(),
      })
      .eq('email', email);

    return NextResponse.json({ success: true, email: user.email });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}