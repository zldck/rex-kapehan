import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

export async function POST(request) {
  try {
    const { email } = await request.json();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('verified_emails')
      .select('has_set_password, is_blocked')
      .eq('email', email)
      .single();

    if (error) {
      // User not found – treat as new
      return NextResponse.json({ exists: false, hasPassword: false });
    }

    if (data.is_blocked) {
      return NextResponse.json({ error: 'Account blocked' }, { status: 403 });
    }

    return NextResponse.json({ exists: true, hasPassword: data.has_set_password });
  } catch (err) {
    console.error('Check error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}