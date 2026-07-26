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

function normalizeSlot(slot) {
  if (!slot) return 'ALL';
  return slot;
}

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized - No token' }, { status: 401 });
    }

    const isValid = await verifyAdminToken(token);
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    let query = supabase
      .from('bookings')
      .select('*')
      .eq('status', 'closed')
      .is('deleted_at', null)
      .order('booking_date', { ascending: true })
      .order('time_slot', { ascending: true });

    if (date) {
      query = query.eq('booking_date', date);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Fetch closures error:', error);
      return NextResponse.json({ error: 'Failed to load closures' }, { status: 500 });
    }

    return NextResponse.json({ closures: data || [] });
  } catch (err) {
    console.error('Closures GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized - No token' }, { status: 401 });
    }

    const isValid = await verifyAdminToken(token);
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
    }

    const { date, slots = [], fullDay = false } = await request.json();

    if (!date) {
      return NextResponse.json({ error: 'Missing date' }, { status: 400 });
    }

    if (!fullDay && slots.length === 0) {
      return NextResponse.json({ error: 'Select at least one hour to close' }, { status: 400 });
    }

    const rows = fullDay
      ? [{
          client_name: 'SYSTEM',
          client_phone: '00000000000',
          client_email: 'system@closure',
          booking_date: date,
          time_slot: 'ALL',
          status: 'closed',
        }]
      : slots.map(slot => ({
          client_name: 'SYSTEM',
          client_phone: '00000000000',
          client_email: 'system@closure',
          booking_date: date,
          time_slot: normalizeSlot(slot),
          status: 'closed',
        }));

    const { data, error } = await supabase
      .from('bookings')
      .insert(rows)
      .select('*');

    if (error) {
      console.error('Create closures error:', error);
      return NextResponse.json({ error: 'Failed to create closure' }, { status: 500 });
    }

    return NextResponse.json({ success: true, closures: data || [] });
  } catch (err) {
    console.error('Closures POST error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized - No token' }, { status: 401 });
    }

    const isValid = await verifyAdminToken(token);
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
    }

    const { ids = [] } = await request.json();

    if (!ids.length) {
      return NextResponse.json({ error: 'Missing closure IDs' }, { status: 400 });
    }

    const { error } = await supabase
      .from('bookings')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('Delete closures error:', error);
      return NextResponse.json({ error: 'Failed to remove closure' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Closures DELETE error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
