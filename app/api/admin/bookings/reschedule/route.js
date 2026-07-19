import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

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

async function sendEmail(to, subject, html) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rex Kapehan <no-reply@mail.rexkapehan.com>',
        to: to,
        subject: subject,
        html: html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    const { password, bookingId, newDate, newSlot } = await request.json();

    // 1. Validate Admin
    if (!validateAdminPassword(password)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!bookingId || !newDate || !newSlot) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 2. Fetch the current booking
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // 3. Check if the new slot is available (excluding this booking)
    const { data: existing, error: checkError } = await supabase
      .from('bookings')
      .select('id')
      .eq('booking_date', newDate)
      .eq('time_slot', newSlot)
      .in('status', ['confirmed', 'pending_review'])
      .neq('id', bookingId);

    if (checkError) {
      return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 });
    }

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: 'Slot already taken. Please choose another.' },
        { status: 409 }
      );
    }

    // 4. Update the booking
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        booking_date: newDate,
        time_slot: newSlot,
      })
      .eq('id', bookingId);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json({ error: 'Failed to reschedule' }, { status: 500 });
    }

    // 5. Send email notification
    const subject = 'Rex Kapehan - Booking Rescheduled';
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#0a0a0a">
        <div style="background:#D4AF37;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="margin:0;color:#000;font-size:24px">🎾 Rex Kapehan</h1>
          <p style="margin:0;color:#000;font-weight:600">Booking Rescheduled</p>
        </div>
        <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
          <p>Dear <strong>${booking.client_name}</strong>,</p>
          <p>Your booking has been <strong style="color:#D4AF37">rescheduled</strong>.</p>
          <div style="background:#f5f5f5;padding:16px;border-radius:12px;margin:16px 0">
            <p style="margin:4px 0;color:#ef4444"><s>❌ Old: ${booking.booking_date} at ${booking.time_slot}</s></p>
            <p style="margin:4px 0;color:#10b981">✅ New: ${newDate} at ${newSlot}</p>
            <p style="margin:4px 0"><strong>📍 Location:</strong> Anselmo Diaz St, Talisay City</p>
          </div>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
          <p style="color:#999;font-size:12px;margin:0">Rex Kapehan • Talisay City Pickleball Court</p>
        </div>
      </div>
    `;

    await sendEmail(booking.client_email, subject, html);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Reschedule error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}