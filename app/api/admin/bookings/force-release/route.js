import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
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
  if (!token) return false;
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
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isValid = await verifyAdminToken(token);
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ids = [] } = await request.json();

    if (!ids.length) {
      return NextResponse.json({ error: 'Missing booking IDs' }, { status: 400 });
    }

    // Hard delete — no email, just remove from DB
    const { error } = await supabase
      .from('bookings')
      .delete()
      .in('id', ids)
      .eq('status', 'pending_review');

    if (error) {
      console.error('Force release error:', error);
      return NextResponse.json({ error: 'Failed to release slots' }, { status: 500 });
    }

    return NextResponse.json({ success: true, released: ids.length });
  } catch (err) {
    console.error('Force release error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
