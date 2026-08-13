import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const HOURLY_RATE = 350;
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

    // --- Dynamic QR Ph via the Payment Intent API ---
    const totalCents = slots.length * HOURLY_RATE * 100;
    const nowIso = new Date().toISOString();

    // Release expired pending bookings so their slots free up.
    await supabase
      .from('bookings')
      .delete()
      .eq('status', 'pending_review')
      .lt('window_expires_at', nowIso);

    if (!PAYMONGO_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Payment service is not configured.' },
        { status: 500 }
      );
    }

    const auth = `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64')}`;

    // 1. Create a Payment Intent (exact amount baked into the QR).
    const piRes = await fetch('https://api.paymongo.com/v1/payment_intents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: totalCents,
            payment_method_allowed: ['qrph'],
            currency: 'PHP',
            description: `Rex Kapehan booking — ${date} (${slots.join(', ')})`,
          },
        },
      }),
    });
    const piData = await piRes.json();
    const paymentIntent = piData?.data;
    if (!piRes.ok || !paymentIntent?.id) {
      console.error('PaymentIntent create error:', JSON.stringify(piData));
      return NextResponse.json(
        { error: piData?.errors?.[0]?.detail || 'Failed to create payment' },
        { status: 502 }
      );
    }
    const clientKey = paymentIntent?.attributes?.client_key || null;

    // 2. Create a QR Ph payment method (10-minute expiry).
    const pmRes = await fetch('https://api.paymongo.com/v1/payment_methods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        data: { attributes: { type: 'qrph', expiry_seconds: 600 } },
      }),
    });
    const pmData = await pmRes.json();
    const paymentMethod = pmData?.data;
    if (!pmRes.ok || !paymentMethod?.id) {
      console.error('PaymentMethod create error:', JSON.stringify(pmData));
      return NextResponse.json(
        { error: pmData?.errors?.[0]?.detail || 'Failed to create QR code' },
        { status: 502 }
      );
    }

    // 3. Attach the payment method to the intent.
    const attachRes = await fetch(
      `https://api.paymongo.com/v1/payment_intents/${paymentIntent.id}/attach`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({
          data: {
            attributes: {
              payment_method: paymentMethod.id,
              ...(clientKey ? { client_key: clientKey } : {}),
            },
          },
        }),
      }
    );
    const attachData = await attachRes.json();
    const intent = attachData?.data;
    const qrImage = intent?.attributes?.next_action?.code?.image_url || null;
    if (!attachRes.ok || !qrImage) {
      console.error('Attach error:', JSON.stringify(attachData));
      return NextResponse.json(
        { error: attachData?.errors?.[0]?.detail || 'Failed to generate QR code' },
        { status: 502 }
      );
    }

    const windowExpiresAt = new Date(Date.now() + PAYMENT_WINDOW_MS).toISOString();

    // 4. Insert pending bookings linked to this payment intent.
    const bookings = slots.map(slot => ({
      client_name: name.trim(),
      client_phone: phone,
      client_email: email,
      booking_date: date,
      time_slot: slot,
      status: 'pending_review',
      payment_status: 'awaiting_payment',
      payment_reference: paymentIntent.id,
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
      qrCode: paymentIntent.id,
      qrImage,
      qrphId: paymentIntent.id,
      expiresAt: windowExpiresAt,
    });
  } catch (err) {
    console.error('Hold slots error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}