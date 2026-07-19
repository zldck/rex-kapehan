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
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isValid = await verifyAdminToken(token);
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ids, status } = await request.json();

    if (!ids?.length || !status) {
      return NextResponse.json({ error: 'Missing booking IDs or status' }, { status: 400 });
    }

    if (!['confirmed', 'cancelled'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Fetch booking details before update
    const { data: bookings, error: fetchError } = await supabase
      .from('bookings')
      .select('id, client_name, client_email, booking_date, time_slot')
      .in('id', ids)
      .is('deleted_at', null);

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch booking details' }, { status: 500 });
    }

    // Update the status
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status })
      .in('id', ids);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json({ error: 'Failed to update bookings' }, { status: 500 });
    }

    // Send email notification – grouped by customer email
    if (bookings && bookings.length > 0) {
      // Group by email
      const emailGroups = {};
      bookings.forEach(b => {
        if (!emailGroups[b.client_email]) {
          emailGroups[b.client_email] = {
            name: b.client_name,
            date: b.booking_date,
            slots: [],
          };
        }
        emailGroups[b.client_email].slots.push(b.time_slot);
      });

      const isApproved = status === 'confirmed';
      const statusText = isApproved ? 'Confirmed' : 'Cancelled';
      
      for (const [email, data] of Object.entries(emailGroups)) {
        const subject = `Rex Kapehan Booking ${statusText}`;
        const html = isApproved ? `
          <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#0a0a0a">
            <div style="background:#D4AF37;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="margin:0;color:#000;font-size:24px">🎾 Rex Kapehan</h1>
              <p style="margin:0;color:#000;font-weight:600">Booking Confirmed!</p>
            </div>
            <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
              <p>Dear <strong>${data.name}</strong>,</p>
              <p>Your booking has been <strong style="color:#10b981">approved and confirmed</strong>.</p>
              <div style="background:#f5f5f5;padding:16px;border-radius:12px;margin:16px 0">
                <p style="margin:4px 0"><strong>📅 Date:</strong> ${data.date}</p>
                <p style="margin:4px 0"><strong>⏰ Time:</strong> ${data.slots.join(', ')}</p>
                <p style="margin:4px 0"><strong>📍 Location:</strong> Anselmo Diaz St, Talisay City</p>
              </div>
              <div style="background:#f0fdf4;padding:12px 16px;border-radius:8px;border:1px solid #bbf7d0;margin:16px 0">
                <p style="margin:0;color:#166534;font-size:13px">✅ Your slots are verified. See you there!</p>
              </div>
              <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
              <p style="color:#999;font-size:12px;margin:0">Rex Kapehan • Talisay City Pickleball Court</p>
            </div>
          </div>
        ` : `
          <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#0a0a0a">
            <div style="background:#D4AF37;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="margin:0;color:#000;font-size:24px">🎾 Rex Kapehan</h1>
              <p style="margin:0;color:#000;font-weight:600">Booking Cancelled</p>
            </div>
            <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
              <p>Dear <strong>${data.name}</strong>,</p>
              <p>Your booking has been <strong style="color:#ef4444">cancelled</strong>.</p>
              <div style="background:#fef2f2;padding:12px 16px;border-radius:8px;border:1px solid #fecaca;margin:12px 0">
                <p style="margin:0;font-size:13px;color:#991b1b">If you have already paid or wish to reschedule, please contact our Facebook page.</p>
              </div>
              <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
              <p style="color:#999;font-size:12px;margin:0">Rex Kapehan • Talisay City Pickleball Court</p>
            </div>
          </div>
        `;
        await sendEmail(email, subject, html);
      }
    }

    return NextResponse.json({ success: true, updated: ids.length });
  } catch (err) {
    console.error('Admin update error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}