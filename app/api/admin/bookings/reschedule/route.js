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

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

async function sendRescheduleEmail({ email, name, oldDate, oldSlots, newDate, newSlots }) {
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set, skipping reschedule email');
    return false;
  }

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Rex Kapehan <onboarding@resend.dev>',
      to: email,
      subject: '📅 Your Rex Kapehan Booking Has Been Rescheduled',
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0a0a0a;background:#fafafa">
          <div style="text-align:center;margin-bottom:24px">
            <h1 style="color:#D4AF37;font-size:28px;font-weight:800;margin:0;letter-spacing:-0.5px">REX KAPEHAN</h1>
            <p style="color:#888;font-size:13px;margin:4px 0 0">Talisay City Pickleball Court</p>
          </div>

          <div style="background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e5e5e5">
            <div style="text-align:center;margin-bottom:24px">
              <div style="width:56px;height:56px;border-radius:50%;background:#3b82f615;color:#3b82f6;font-size:28px;line-height:56px;margin:0 auto 12px">
                📅
              </div>
              <h2 style="font-size:20px;font-weight:700;margin:0;color:#3b82f6">Booking Rescheduled</h2>
            </div>

            <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 16px">
              Hi <strong>${name}</strong>, your booking has been rescheduled by our team. Here are your updated details:
            </p>

            <div style="background:#fef2f2;border-radius:12px;padding:16px;margin-bottom:12px;opacity:0.8">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:0.5px">Previous</p>
              <p style="margin:0 0 4px;font-size:14px;text-decoration:line-through;color:#888"><strong>Date:</strong> ${formatDate(oldDate)}</p>
              <p style="margin:0;font-size:14px;text-decoration:line-through;color:#888"><strong>Time:</strong> ${oldSlots.join(', ')}</p>
            </div>

            <div style="background:#ecfdf5;border-radius:12px;padding:16px;margin-bottom:20px;border:1px solid #10b98130">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.5px">New</p>
              <p style="margin:0 0 4px;font-size:14px"><strong>Date:</strong> ${formatDate(newDate)}</p>
              <p style="margin:0;font-size:14px"><strong>Time:</strong> ${newSlots.join(', ')}</p>
            </div>

            <div style="background:#3b82f608;border:1px solid #3b82f620;border-radius:10px;padding:14px;font-size:13px;color:#1d4ed8;line-height:1.5">
              <strong>📍 Location:</strong> Anselmo Diaz St, Talisay City<br>
              <strong>⏰ Arrive:</strong> 10 minutes before your slot
            </div>

            <p style="font-size:13px;color:#666;margin:16px 0 0">
              If this change doesn't work for you, please contact us on our Facebook page at least 1 hour before your slot.
            </p>
          </div>

          <p style="text-align:center;font-size:12px;color:#aaa;margin-top:24px">
            © 2026 Rex Kapehan • Talisay City<br>
            This is an automated message. Please do not reply.
          </p>
        </div>
      `,
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error('Resend reschedule email error:', errText);
    return false;
  }
  return true;
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

    // Map each booking id to its intended new slot (by request order)
    const newSlotById = new Map(bookingIds.map((id, index) => [id, newSlots[index]]));

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
      .is('deleted_at', null)
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

    // Update each booking with its corresponding new slot.
    // Moving the row in place automatically frees the previous slot.
    for (const booking of bookings) {
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          booking_date: newDate,
          time_slot: newSlotById.get(booking.id),
        })
        .eq('id', booking.id);

      if (updateError) {
        console.error('Update error:', updateError);
        return NextResponse.json({ error: 'Failed to reschedule' }, { status: 500 });
      }
    }

    // Notify each affected customer that their slot(s) moved.
    const byCustomer = new Map();
    for (const booking of bookings) {
      if (!booking.client_email) continue;
      const entry = byCustomer.get(booking.client_email) || {
        email: booking.client_email,
        name: booking.client_name,
        oldDate: booking.booking_date,
        oldSlots: [],
        newSlots: [],
      };
      entry.oldSlots.push(booking.time_slot);
      entry.newSlots.push(newSlotById.get(booking.id));
      byCustomer.set(booking.client_email, entry);
    }

    let emailsSent = 0;
    for (const entry of byCustomer.values()) {
      const ok = await sendRescheduleEmail({
        email: entry.email,
        name: entry.name,
        oldDate: entry.oldDate,
        oldSlots: entry.oldSlots,
        newDate,
        newSlots: entry.newSlots,
      });
      if (ok) emailsSent += 1;
    }

    return NextResponse.json({
      success: true,
      rescheduled: bookings.length,
      emailsSent,
    });
  } catch (err) {
    console.error('Reschedule error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
