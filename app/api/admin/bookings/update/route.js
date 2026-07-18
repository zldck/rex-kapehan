import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// CHANGE THIS to your actual Facebook page URL
const FACEBOOK_PAGE_URL = 'https://www.facebook.com/rexkapehan';

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

// --- Helper: Send email via Resend ---
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

    if (!res.ok) {
      const errText = await res.text();
      console.error('Resend error:', errText);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email send error:', err);
    return false;
  }
}

export async function POST(request) {
  try {
    const { password, ids, status } = await request.json();

    // 1. Validate Admin
    if (!validateAdminPassword(password)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ids?.length || !status) {
      return NextResponse.json({ error: 'Missing booking IDs or status' }, { status: 400 });
    }

    if (!['confirmed', 'cancelled'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // 2. Fetch booking details before update
    const { data: bookings, error: fetchError } = await supabase
      .from('bookings')
      .select('id, client_name, client_email, booking_date, time_slot, status')
      .in('id', ids);

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch booking details' }, { status: 500 });
    }

    if (!bookings || bookings.length === 0) {
      return NextResponse.json({ error: 'No bookings found' }, { status: 404 });
    }

    // 3. Update the status in the database
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status })
      .in('id', ids);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json({ error: 'Failed to update bookings' }, { status: 500 });
    }

    // 4. Send email notifications (group by email)
    const emailMap = {};
    bookings.forEach((bk) => {
      if (!emailMap[bk.client_email]) {
        emailMap[bk.client_email] = {
          name: bk.client_name,
          date: bk.booking_date,
          slots: [],
        };
      }
      emailMap[bk.client_email].slots.push(bk.time_slot);
    });

    const isApproved = status === 'confirmed';
    const statusText = isApproved ? 'Confirmed' : 'Cancelled';
    const statusEmoji = isApproved ? '✅' : '❌';

    let emailSentCount = 0;

    // Send emails asynchronously
    const emailPromises = Object.entries(emailMap).map(async ([email, data]) => {
      const subject = `Rex Kapehan Booking ${statusText}`;

      let html = '';

      if (isApproved) {
        // --- APPROVAL EMAIL ---
        html = `
          <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#0a0a0a">
            <div style="background:#D4AF37;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="margin:0;color:#000;font-size:24px">🎾 Rex Kapehan</h1>
              <p style="margin:0;color:#000;font-weight:600">Pickleball Court Reservation</p>
            </div>
            <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
              <h2 style="color:#0a0a0a;margin-top:0">Booking Confirmed! ✅</h2>
              <p>Dear <strong>${data.name}</strong>,</p>
              <p>Great news! Your booking has been <strong style="color:#10b981">approved</strong> and confirmed.</p>
              <div style="background:#f5f5f5;padding:16px;border-radius:12px;margin:16px 0">
                <p style="margin:4px 0"><strong>📅 Date:</strong> ${data.date}</p>
                <p style="margin:4px 0"><strong>⏰ Time:</strong> ${data.slots.join(', ')}</p>
                <p style="margin:4px 0"><strong>📍 Location:</strong> Anselmo Diaz St, Talisay City</p>
              </div>
              <div style="background:#f0fdf4;padding:12px 16px;border-radius:8px;border:1px solid #bbf7d0;margin:16px 0">
                <p style="margin:0;color:#166534;font-size:13px">💡 Please arrive 10 minutes early. Bring your receipt screenshot as proof of payment.</p>
              </div>
              <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
              <p style="color:#666;font-size:12px;margin:0">
                Questions? Reply to this email or message us on our social pages.
              </p>
              <p style="color:#999;font-size:12px;margin:8px 0 0 0">
                © Rex Kapehan • Talisay City Pickleball Court
              </p>
            </div>
          </div>
        `;
      } else {
        // --- CANCELLATION EMAIL ---
        html = `
          <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#0a0a0a">
            <div style="background:#D4AF37;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="margin:0;color:#000;font-size:24px">🎾 Rex Kapehan</h1>
              <p style="margin:0;color:#000;font-weight:600">Pickleball Court Reservation</p>
            </div>
            <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
              <h2 style="color:#0a0a0a;margin-top:0">Booking Cancelled ❌</h2>
              <p>Dear <strong>${data.name}</strong>,</p>
              <p>Your booking for <strong>${data.date}</strong> at <strong>${data.slots.join(', ')}</strong> has been <strong style="color:#ef4444">cancelled</strong>.</p>
              <div style="background:#fef2f2;padding:16px;border-radius:12px;border:1px solid #fecaca;margin:16px 0">
                <p style="margin:0 0 8px 0;color:#991b1b;font-weight:600">📢 Important:</p>
                <ul style="margin:0;padding-left:20px;color:#991b1b;font-size:13px">
                  <li>If you have already paid, please contact us for a refund.</li>
                  <li>If you wish to reschedule, we're happy to help!</li>
                </ul>
              </div>
              <div style="background:#f5f5f5;padding:12px 16px;border-radius:8px;text-align:center;margin:16px 0">
                <p style="margin:0;font-size:13px;color:#333">
                  📱 Message us on Facebook:<br />
                  <a href="${FACEBOOK_PAGE_URL}" style="color:#D4AF37;font-weight:700;text-decoration:underline;font-size:16px">
                    facebook.com/rexkapehan
                  </a>
                </p>
                <p style="margin:8px 0 0 0;font-size:12px;color:#666">
                  We'll respond within 24 hours.
                </p>
              </div>
              <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
              <p style="color:#666;font-size:12px;margin:0">
                We apologize for any inconvenience. Thank you for your understanding.
              </p>
              <p style="color:#999;font-size:12px;margin:8px 0 0 0">
                © Rex Kapehan • Talisay City Pickleball Court
              </p>
            </div>
          </div>
        `;
      }

      const success = await sendEmail(email, subject, html);
      if (success) emailSentCount++;
    });

    // Wait for all emails to finish (fail silently)
    await Promise.allSettled(emailPromises);

    return NextResponse.json({
      success: true,
      updated: ids.length,
      emailsSent: emailSentCount,
    });
  } catch (err) {
    console.error('Admin update error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}