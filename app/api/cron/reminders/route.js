import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// --- Supabase Client (Service Role for writes) ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

// --- Security: Verify cron secret ---
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request) {
  try {
    // 1. Check authorization
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      console.warn('Unauthorized cron attempt');
      return new NextResponse('Unauthorized', { status: 401 });
    }

    console.log('⏰ Cron job started: Sending booking reminders...');

    // 2. Calculate tomorrow's date (YYYY-MM-DD)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0]; // e.g. "2026-07-20"

    // 3. Fetch confirmed bookings for tomorrow that haven't received a reminder yet
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('booking_date', tomorrowStr)
      .eq('status', 'confirmed')
      .eq('reminder_sent', false)
      .order('time_slot', { ascending: true });

    if (error) {
      console.error('Cron error: Failed to fetch bookings', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!bookings || bookings.length === 0) {
      console.log(`✅ No reminders to send for ${tomorrowStr}`);
      return NextResponse.json({ success: true, message: 'No bookings to remind' });
    }

    console.log(`📨 Found ${bookings.length} booking(s) to remind for ${tomorrowStr}`);

    // 4. Group bookings by email (so a user gets one email with all their slots)
    const emailMap = {};
    bookings.forEach((bk) => {
      if (!emailMap[bk.client_email]) {
        emailMap[bk.client_email] = {
          name: bk.client_name,
          date: bk.booking_date,
          slots: [],
          ids: [],
        };
      }
      emailMap[bk.client_email].slots.push(bk.time_slot);
      emailMap[bk.client_email].ids.push(bk.id);
    });

    // 5. Send one email per user
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    let sentCount = 0;
    let errorCount = 0;

    for (const [email, data] of Object.entries(emailMap)) {
      const subject = `🔔 Rex Kapehan - Booking Reminder (Tomorrow)`;

      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#0a0a0a">
          <div style="text-align:center;margin-bottom:16px;">
            <img src="https://rexkapehan.com/logo.png" alt="Rex Kapehan" style="max-width:150px;height:auto;">
          </div>
          <div style="background:#D4AF37;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="margin:0;color:#000;font-size:24px">🎾 Rex Kapehan</h1>
            <p style="margin:0;color:#000;font-weight:600">Booking Reminder</p>
          </div>
          <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
            <p>Dear <strong>${data.name}</strong>,</p>
            <p>This is a friendly reminder about your booking <strong>tomorrow</strong>.</p>
            <div style="background:#f5f5f5;padding:16px;border-radius:12px;margin:16px 0">
              <p style="margin:4px 0"><strong>📅 Date:</strong> ${data.date}</p>
              <p style="margin:4px 0"><strong>⏰ Time(s):</strong> ${data.slots.join(', ')}</p>
              <p style="margin:4px 0"><strong>📍 Location:</strong> Anselmo Diaz St, Talisay City</p>
            </div>
            <div style="background:#f0fdf4;padding:12px 16px;border-radius:8px;border:1px solid #bbf7d0;margin:16px 0">
              <p style="margin:0;color:#166534;font-size:13px">
                💡 <strong>Tips:</strong><br>
                • Please arrive <strong>10 minutes early</strong>.<br>
                • Bring your receipt screenshot as proof of payment.<br>
                • Bring your own racket if you have one (rentals are available).<br>
                • Water and refreshments are available at the venue.
              </p>
            </div>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
            <p style="color:#666;font-size:12px;margin:0">
              For rescheduling or questions, reply to this email or message us on Facebook.
            </p>
            <p style="color:#999;font-size:12px;margin:8px 0 0 0">
              © Rex Kapehan • Talisay City Pickleball Court
            </p>
          </div>
        </div>
      `;

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Rex Kapehan <no-reply@mail.rexkapehan.com>',
            to: email,
            subject: subject,
            html: html,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error(`Failed to send reminder to ${email}:`, errText);
          errorCount++;
          // We don't update reminder_sent here, so it will retry next time.
        } else {
          console.log(`✅ Reminder sent to ${email} for ${data.slots.join(', ')}`);
          sentCount++;

          // 6. Mark bookings as "reminder_sent = true" only if email succeeded
          const { error: updateError } = await supabase
            .from('bookings')
            .update({ reminder_sent: true })
            .in('id', data.ids);

          if (updateError) {
            console.error('Failed to update reminder_sent flag:', updateError);
          }
        }
      } catch (err) {
        console.error(`Error sending reminder to ${email}:`, err);
        errorCount++;
      }
    }

    console.log(`🎯 Reminder job finished. Sent: ${sentCount}, Errors: ${errorCount}`);
    return NextResponse.json({
      success: true,
      sent: sentCount,
      errors: errorCount,
      total: bookings.length,
    });
  } catch (err) {
    console.error('Cron job fatal error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}