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
  if (!token) return false;
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload.role === 'admin';
  } catch (err) {
    console.error('JWT verify error:', err);
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
    // Get token from cookie
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {});
    const token = cookies['admin_token'];

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized - No token' }, { status: 401 });
    }

    const isValid = await verifyAdminToken(token);
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
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
      .in('id', ids);

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

    // Send email notification
    if (bookings && bookings.length > 0) {
      const isApproved = status === 'confirmed';
      const statusText = isApproved ? 'Confirmed' : 'Cancelled';
      
      for (const booking of bookings) {
        const subject = `Rex Kapehan Booking ${statusText}`;
        const html = isApproved ? `
          <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#0a0a0a">
            <div style="background:#D4AF37;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="margin:0;color:#000;font-size:24px">🎾 Rex Kapehan</h1>
              <p style="margin:0;color:#000;font-weight:600">Booking Confirmed!</p>
            </div>
            <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
              <p>Dear <strong>${booking.client_name}</strong>,</p>
              <p>Your booking has been <strong style="color:#10b981">confirmed</strong>.</p>
              <p><strong>Date:</strong> ${booking.booking_date}</p>
              <p><strong>Time:</strong> ${booking.time_slot}</p>
              <p><strong>Location:</strong> Anselmo Diaz St, Talisay City</p>
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
              <p>Dear <strong>${booking.client_name}</strong>,</p>
              <p>Your booking has been <strong style="color:#ef4444">cancelled</strong>.</p>
              <p><strong>Date:</strong> ${booking.booking_date}</p>
              <p><strong>Time:</strong> ${booking.time_slot}</p>
              <div style="background:#fef2f2;padding:12px 16px;border-radius:8px;border:1px solid #fecaca;margin:12px 0">
                <p style="margin:0;font-size:13px;color:#991b1b">If you have paid, please contact us for a refund.</p>
              </div>
              <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
              <p style="color:#999;font-size:12px;margin:0">Rex Kapehan • Talisay City Pickleball Court</p>
            </div>
          </div>
        `;
        await sendEmail(booking.client_email, subject, html);
      }
    }

    return NextResponse.json({ success: true, updated: ids.length });
  } catch (err) {
    console.error('Admin update error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}