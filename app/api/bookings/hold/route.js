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
    const { name, phone, email, date, slots } = await request.json();

    if (!name?.trim() || !phone || !email || !date || !slots?.length) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // --- Check if email is blocked ---
    const { data: user, error: userError } = await supabase
      .from('verified_emails')
      .select('is_blocked')
      .eq('email', email)
      .single();

    if (!userError && user?.is_blocked === true) {
      return NextResponse.json(
        { error: 'Your account has been blocked. Please contact support.' },
        { status: 403 }
      );
    }

    // --- Check if any slot is already taken or closed ---
    const { data: existing, error: checkError } = await supabase
      .from('bookings')
      .select('time_slot')
      .eq('booking_date', date)
      .in('time_slot', slots)
      .in('status', ['confirmed', 'pending_review', 'closed']);

    if (checkError) {
      console.error('Availability check error:', checkError);
      return NextResponse.json(
        { error: 'Failed to check availability' },
        { status: 500 }
      );
    }

    if (existing && existing.length > 0) {
      const takenSlots = existing.map(row => row.time_slot);
      return NextResponse.json(
        { error: `Slots already taken: ${takenSlots.join(', ')}`, takenSlots },
        { status: 409 }
      );
    }

    // --- Check for full-day closure ---
    const { data: fullDayClosure, error: fullDayError } = await supabase
      .from('bookings')
      .select('id')
      .eq('booking_date', date)
      .eq('time_slot', 'ALL')
      .eq('status', 'closed')
      .maybeSingle();

    if (!fullDayError && fullDayClosure) {
      return NextResponse.json(
        { error: 'This date is fully closed for weather or holiday. No slots available.' },
        { status: 409 }
      );
    }

    // --- Clean up any previous pending bookings for this user+date ---
    await supabase
      .from('bookings')
      .delete()
      .eq('booking_date', date)
      .eq('client_email', email)
      .eq('status', 'pending_review');

    // --- Insert pending bookings ---
    const bookings = slots.map(slot => ({
      client_name: name.trim(),
      client_phone: phone,
      client_email: email,
      booking_date: date,
      time_slot: slot,
      status: 'pending_review',
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('bookings')
      .upsert(bookings, { onConflict: 'booking_date, time_slot' })
      .select('id');

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to reserve slots' },
        { status: 500 }
      );
    }

    // --- Send admin notification (moved to receipt submission) ---

    return NextResponse.json({
      success: true,
      bookingIds: inserted.map(row => row.id),
      count: inserted.length,
    });
  } catch (err) {
    console.error('Hold slots error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}