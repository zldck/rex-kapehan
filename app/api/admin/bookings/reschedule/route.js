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
const RESEND_API_KEY = process.env.RESEND_API_KEY;

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

async function sendRescheduleEmail(customerEmail, customerName, oldDate, oldSlots, newDate, newSlots) {
  if (!RESEND_API_KEY) {
    console.warn('Resend API key not configured');
    return false;
  }

  try {
    const formattedOldDate = new Date(oldDate + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    const formattedNewDate = new Date(newDate + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#0a0a0a">
        <div style="background:#D4AF37;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="margin:0;color:#000;font-size:24px">🎾 Rex Kapehan</h1>
          <p style="margin:0;color:#000;font-weight:600">Booking Rescheduled</p>
        </div>
        <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
          <p>Dear <strong>${customerName}</strong>,</p>
          <p>Your booking has been <strong style="color:#D4AF37">rescheduled</strong>.</p>
          
          <div style="background:#fef3c7;border-left:4px solid #D4AF37;padding:16px;margin:16px 0;border-radius:4px">
            <p style="margin:0 0 12px;font-weight:600;color:#92400e">Previous Booking:</p>
            <p style="margin:4px 0"><strong>📅 Date:</strong> ${formattedOldDate}</p>
            <p style="margin:4px 0"><strong>⏰ Time:</strong> ${oldSlots.join(', ')}</p>
          </div>

          <div style="text-align:center;margin:16px 0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;color:#D4AF37">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <polyline points="19 12 12 19 5 12"></polyline>
            </svg>
          </div>

          <div style="background:#f0fdf4;border-left:4px solid #10b981;padding:16px;margin:16px 0;border-radius:4px">
            <p style="margin:0 0 12px;font-weight:600;color:#166534">New Booking:</p>
            <p style="margin:4px 0"><strong>📅 Date:</strong> ${formattedNewDate}</p>
            <p style="margin:4px 0"><strong>⏰ Time:</strong> ${newSlots.join(', ')}</p>
          </div>

          <div style="background:#f5f5f5;padding:14px;border-radius:8px;margin:16px 0;font-size:13px;line-height:1.5">
            <strong>📍 Location:</strong> Anselmo Diaz St, Talisay City<br>
            <strong>ℹ️ Note:</strong> Your previous slot(s) are now released and available for other bookings.
          </div>

          <p style="font-size:14px;color:#666;margin-top:20px">
            If you have any questions about your rescheduled booking, please contact us through our Facebook page.
          </p>

          <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
          <p style="color:#999;font-size:12px;margin:0">Rex Kapehan • Talisay City Pickleball Court</p>
        </div>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rex Kapehan <no-reply@mail.rexkapehan.com>',
        to: customerEmail,
        subject: '🎾 Your Rex Kapehan Booking Has Been Rescheduled',
        html: html,
      }),
    });

    return res.ok;
  } catch (err) {
    console.error('Send reschedule email error:', err);
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
      client_email: booking.client_email,
      client_name: booking.client_name,
      old_booking_date: booking.booking_date,
      old_time_slot: booking.time_slot,
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

    // Group updates by customer email and send reschedule emails
    const emailGroups = {};
    updates.forEach(update => {
      if (!emailGroups[update.client_email]) {
        emailGroups[update.client_email] = {
          name: update.client_name,
          oldDate: null,
          oldSlots: [],
          newDate: newDate,
          newSlots: [],
        };
      }
      emailGroups[update.client_email].oldDate = update.old_booking_date;
      emailGroups[update.client_email].oldSlots.push(update.old_time_slot);
      emailGroups[update.client_email].newSlots.push(update.time_slot);
    });

    // Send emails
    for (const [email, data] of Object.entries(emailGroups)) {
      await sendRescheduleEmail(
        email,
        data.name,
        data.oldDate,
        data.oldSlots,
        data.newDate,
        data.newSlots
      );
    }

    return NextResponse.json({ success: true, rescheduled: updates.length });
  } catch (err) {
    console.error('Reschedule error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}