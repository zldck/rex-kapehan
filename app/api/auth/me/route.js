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
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const { data: user, error } = await supabase
      .from('verified_emails')
      .select('email, verified_until, is_blocked')
      .eq('email', email)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.is_blocked) {
      return NextResponse.json({ error: 'Account blocked' }, { status: 403 });
    }

    const isVerified = user.verified_until && new Date(user.verified_until) > new Date();

    return NextResponse.json({
      email: user.email,
      isVerified: isVerified,
    });
  } catch (err) {
    console.error('Me endpoint error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}