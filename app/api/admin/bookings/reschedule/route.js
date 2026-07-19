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
const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function verifyAdminToken(token) {
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

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
    const token = request.cookies.get('admin_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const isValid = await verifyAdminToken(token);
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingIds, newDate, newSlots } = await request.json();

    if (!bookingIds?.length || !newDate || !newSlots?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Fetch the current bookings
    const { data: bookings, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .in('id', bookingIds);

    if (fetchError || !bookings || bookings.length === 0) {
      return NextResponse.json({ error: 'Bookings not found' }, { status: 404 });
    }

    // Check if any of the new slots are taken (excluding these bookings)
    const { data: existing, error: checkError } = await supabase
      .from('bookings')
      .select('time_slot')
      .eq('booking_date', newDate)
      .in('time_slot', newSlots)
      .in('status', ['confirmed', 'pending_review'])
      .not('id', 'in', `(${bookingIds.join(',')})`);

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

    // Update the bookings
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        booking_date: newDate,
        time_slot: newSlots[0], // For simplicity, if multiple slots, we need to handle differently
      })
      .in('id', bookingIds);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json({ error: 'Failed to reschedule' }, { status: 500 });
    }

    // Send email notification
    const firstBooking = bookings[0];
    const subject = 'Rex Kapehan - Booking Rescheduled';
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#0a0a0a">
        <div style="background:#D4AF37;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="margin:0;color:#000;font-size:24px">🎾 Rex Kapehan</h1>
          <p style="margin:0;color:#000;font-weight:600">Booking Rescheduled</p>
        </div>
        <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
          <p>Dear <strong>${firstBooking.client_name}</strong>,</p>
          <p>Your booking has been <strong style="color:#D4AF37">rescheduled</strong>.</p>
          <div style="background:#f5f5f5;padding:16px;border-radius:12px;margin:16px 0">
            <p style="margin:4px 0;color:#ef4444"><s>❌ Old: ${firstBooking.booking_date} at ${firstBooking.time_slot}</s></p>
            <p style="margin:4px 0;color:#10b981">✅ New: ${newDate} at ${newSlots.join(', ')}</p>
          </div>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
          <p style="color:#999;font-size:12px;margin:0">Rex Kapehan • Talisay City Pickleball Court</p>
        </div>
      </div>
    `;

    await sendEmail(firstBooking.client_email, subject, html);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Reschedule error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}