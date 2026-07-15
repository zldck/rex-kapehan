import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function validateAdminPassword(password) {
  if (!ADMIN_PASSWORD) return false;
  if (!password || typeof password !== 'string') return false;
  const a = Buffer.from(password);
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

export async function POST(request) {
  try {
    const { password, ids } = await request.json();

    if (!validateAdminPassword(password)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!ids?.length) {
      return NextResponse.json(
        { error: 'Missing booking IDs' },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabase
      .from('bookings')
      .delete()
      .in('id', ids);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete bookings' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error('Admin delete error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}