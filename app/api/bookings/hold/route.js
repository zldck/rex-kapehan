import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getQrPool } from '../../_lib/qr-pool';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

const HOURLY_RATE = 10;
const PAYMENT_WINDOW_MS = 10 * 60 * 1000;

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

    // --- QR lane pool: each pending booking gets its own QR code. ---
    const totalCents = slots.length * HOURLY_RATE * 100;
    const nowIso = new Date().toISOString();

    // Release expired pending bookings so their lanes free up.
    await supabase
      .from('bookings')
      .delete()
      .eq('status', 'pending_review')
      .lt('window_expires_at', nowIso);

    const pool = getQrPool();
    if (pool.length === 0) {
      return NextResponse.json(
        { error: 'Payment service is not configured.' },
        { status: 500 }
      );
    }

    // Pick a free lane: a QR with no live pending booking.
    let chosen = null;
    for (const qr of pool) {
      const { data: busy } = await supabase
        .from('bookings')
        .select('id')
        .eq('status', 'pending_review')
        .eq('payment_reference', qr.id)
        .gt('window_expires_at', nowIso)
        .limit(1);
      if (!busy || busy.length === 0) {
        chosen = qr;
        break;
      }
    }

    if (!chosen) {
      return NextResponse.json(
        { error: 'All payment lanes are busy right now. Please try again in a few minutes.' },
        { status: 409 }
      );
    }

    const windowExpiresAt = new Date(Date.now() + PAYMENT_WINDOW_MS).toISOString();

    // --- Insert pending bookings (static QR Ph flow) ---
    const bookings = slots.map(slot => ({
      client_name: name.trim(),
      client_phone: phone,
      client_email: email,
      booking_date: date,
      time_slot: slot,
      status: 'pending_review',
      payment_status: 'awaiting_payment',
      payment_reference: chosen.id,
      expected_amount: totalCents,
      window_expires_at: windowExpiresAt,
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

    const bookingIds = inserted.map(row => row.id);

    return NextResponse.json({
      success: true,
      bookingIds,
      count: bookingIds.length,
      qrCode: chosen.id,
      qrImage: chosen.image,
      qrphId: chosen.id,
      expiresAt: windowExpiresAt,
    });
  } catch (err) {
    console.error('Hold slots error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}