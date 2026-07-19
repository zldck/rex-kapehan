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
      return NextResponse.json({ error: 'Unauthorized - No token' }, { status: 401 });
    }

    const isValid = await verifyAdminToken(token);
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
    }

    const { bookingIds, newDate, newSlots } = await request.json();

    if (!bookingIds?.length || !newDate || !newSlots?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (bookingIds.length !== newSlots.length) {
      return NextResponse.json(
        { error: 'Number of booking IDs must match number of new slots' },
        { status: 400 }
      );
    }

    // Fetch the current bookings
    const { data: bookings, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .in('id', bookingIds);

    if (fetchError || !bookings || bookings.length === 0) {
      return NextResponse.json({ error: 'Bookings not found' }, { status: 404 });
    }

    // Check if any of the new slots are taken (excluding current bookings)
    const { data: existing, error: checkError } = await supabase
      .from('bookings')
      .select('time_slot')
      .eq('booking_date', newDate)
      .in('time_slot', newSlots)
      .in('status', ['confirmed', 'pending_review'])
      .filter('id', 'not.in', `(${bookingIds.join(',')})`);

    if (checkError) {
      return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 });
    }

    if (existing && existing.length > 0) {
      const takenSlots = existing.map(row => row.time_slot);
      return NextResponse.json(
        { error: `Slot(s) already taken: ${takenSlots.join(', ')}` },
        { status: 409 }
      );
    }

    // Update each booking with its corresponding new slot
    const updates = bookings.map((booking, index) => ({
      id: booking.id,
      booking_date: newDate,
      time_slot: newSlots[index],
    }));

    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          booking_date: update.booking_date,
          time_slot: update.time_slot,
        })
        .eq('id', update.id);

      if (updateError) {
        console.error('Update error:', updateError);
        return NextResponse.json({ error: 'Failed to reschedule' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, rescheduled: updates.length });
  } catch (err) {
    console.error('Reschedule error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}