import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { getClosuresForDate, closuresSupabase } from '../../_lib/closures';

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

    const { data, error } = await getClosuresForDate(date);

    if (error) {
      console.error('Fetch closures error:', error);
      return NextResponse.json(
        { error: `Failed to load closures: ${error.message || 'Database query failed.'}` },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json({ closures: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
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

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      return NextResponse.json({ error: 'Missing date' }, { status: 400 });
    }

    if (!Array.isArray(slots)) {
      return NextResponse.json({ error: 'Slots must be an array' }, { status: 400 });
    }

    const normalizedSlots = [...new Set(slots.map(slot => String(slot || '').trim()).filter(Boolean))];
    if (!fullDay && normalizedSlots.length === 0) {
      return NextResponse.json({ error: 'Select at least one hour to close' }, { status: 400 });
    }

    const rows = fullDay
      ? [{ booking_date: date, time_slot: 'ALL' }]
      : normalizedSlots.map(slot => ({
          booking_date: date,
          time_slot: slot,
        }));

    const { error } = await closuresSupabase
      .from('closures')
      .upsert(rows, { onConflict: 'booking_date, time_slot', ignoreDuplicates: true });

    if (error) {
      console.error('Create closures error:', { date, fullDay, slots, error });
      const diagnostics = [error.message, error.details, error.hint].filter(Boolean).join(' ');
      const code = error.code ? ` (${error.code})` : '';
      return NextResponse.json(
        { error: `Failed to create closure${code}: ${diagnostics || 'Database rejected the closure.'}` },
        { status: 500 }
      );
    }

    const { data, error: verifyError } = await closuresSupabase
      .from('closures')
      .select('id, booking_date, time_slot, created_at')
      .eq('booking_date', date)
      .in('time_slot', rows.map(row => row.time_slot));

    if (verifyError || (data || []).length !== rows.length) {
      console.error('Verify closures error:', { date, rows, verifyError, data });
      return NextResponse.json(
        { error: verifyError?.message || 'Closure could not be verified after saving.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, closures: data }, { headers: { 'Cache-Control': 'no-store' } });
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

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Missing closure IDs' }, { status: 400 });
    }

    const { data, error } = await closuresSupabase
      .from('closures')
      .delete()
      .in('id', ids)
      .select('id');

    if (error) {
      console.error('Delete closures error:', error);
      return NextResponse.json({ error: `Failed to remove closure: ${error.message || 'Database delete failed.'}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedIds: (data || []).map(row => row.id) });
  } catch (err) {
    console.error('Closures DELETE error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
