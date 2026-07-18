import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me-in-production';

async function verifyAdminToken(token) {
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    // Check admin auth via cookie
    const token = request.cookies.get('admin_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const isValid = await verifyAdminToken(token);
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, block } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('verified_emails')
      .update({ is_blocked: block })
      .eq('email', email);

    if (error) {
      console.error('Block update error:', error);
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }

    return NextResponse.json({ success: true, email, is_blocked: block });
  } catch (err) {
    console.error('Block error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}