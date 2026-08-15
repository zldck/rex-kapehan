const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.ADMIN_EMAILS || 'muihilado@gmail.com';
const DEFAULT_HOURLY_RATE = 350;

// Import supabase for getting hourly rate
import { createClient } from '@supabase/supabase-js';

const supabaseForSettings = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

// --- Fetch current hourly rate from settings ---
export async function getHourlyRate() {
  try {
    const { data, error } = await supabaseForSettings
      .from('settings')
      .select('hourly_rate')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Fetch settings error:', error);
      return DEFAULT_HOURLY_RATE;
    }

    return data?.hourly_rate || DEFAULT_HOURLY_RATE;
  } catch (err) {
    console.error('Get hourly rate error:', err);
    return DEFAULT_HOURLY_RATE;
  }
}

const timeToMinutes = (slot) => {
  const [time, meridiem] = slot.split(' ');
  let [h, m] = time.split(':').map(Number);
  if (meridiem === 'PM' && h !== 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return h * 60 + m;
};

const minutesToSlot = (mins) => {
  let h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const meridiem = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, '0')} ${meridiem}`;
};

const formatSlotRange = (slots) => {
  if (!slots || slots.length === 0) return '';
  const mins = slots.map(timeToMinutes).sort((a, b) => a - b);
  const start = minutesToSlot(mins[0]);
  const end = minutesToSlot(mins[mins.length - 1] + 60);
  return start === end ? start : `${start} – ${end}`;
};

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rex Kapehan <no-reply@mail.rexkapehan.com>',
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error('Resend email error:', await res.text());
    }
    return res.ok;
  } catch (err) {
    console.error('Resend email error:', err);
    return false;
  }
}

// rows: array of booking objects with { id, client_name, client_email, client_phone, booking_date, time_slot }
export async function sendPaymentConfirmationEmails(rows, hourlyRate = DEFAULT_HOURLY_RATE) {
  if (!rows || rows.length === 0) return;

  const first = rows[0];
  const name = first.client_name;
  const email = first.client_email;
  const phone = first.client_phone;
  const date = first.booking_date;
  const slots = rows.map((r) => r.time_slot);
  const total = slots.length * hourlyRate;
  const receiptNo = `RK-${String(first.id).slice(0, 8).toUpperCase()}`;

  const prettyDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const userSubject = '✅ Your Rex Kapehan Booking is Confirmed!';
  const userHtml = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0a0a0a;background:#fafafa">
      <div style="text-align:center;margin-bottom:24px">
        <h1 style="color:#D4AF37;font-size:28px;font-weight:800;margin:0;letter-spacing:-0.5px">REX KAPEHAN</h1>
        <p style="color:#888;font-size:13px;margin:4px 0 0">Talisay City Pickleball Court</p>
      </div>
      <div style="background:#fff;border-radius:16px;padding:28px;border:1px solid #e5e5e5">
        <div style="text-align:center;margin-bottom:20px">
          <div style="width:56px;height:56px;border-radius:50%;background:#10b98115;color:#10b981;font-size:28px;line-height:56px;margin:0 auto 12px">✓</div>
          <h2 style="font-size:20px;font-weight:700;margin:0;color:#10b981">Payment Received — Booking Confirmed</h2>
          <p style="color:#888;font-size:13px;margin:6px 0 0">Receipt No: ${receiptNo}</p>
        </div>
        <div style="background:#f5f5f5;border-radius:12px;padding:16px;margin-bottom:16px">
          <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse">
            <tr><td style="padding:4px 0;color:#888">Customer</td><td style="padding:4px 0;text-align:right"><strong>${name}</strong></td></tr>
            <tr><td style="padding:4px 0;color:#888">Phone</td><td style="padding:4px 0;text-align:right">${phone}</td></tr>
            <tr><td style="padding:4px 0;color:#888">Date</td><td style="padding:4px 0;text-align:right">${prettyDate}</td></tr>
            <tr><td style="padding:4px 0;color:#888">Time</td><td style="padding:4px 0;text-align:right">${formatSlotRange(slots)}</td></tr>
            <tr><td style="padding:4px 0;color:#888">Payment method</td><td style="padding:4px 0;text-align:right">QR Ph</td></tr>
            <tr><td style="padding:8px 0 0;color:#888;border-top:1px solid #e5e5e5">Total paid</td><td style="padding:8px 0 0;text-align:right;border-top:1px solid #e5e5e5"><strong style="font-size:16px;color:#10b981">₱${total.toLocaleString()}</strong></td></tr>
          </table>
        </div>
        <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 12px">
          Please arrive <strong>10 minutes early</strong>. Keep this email as your proof of booking.
        </p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 14px;font-size:13px;color:#166534;line-height:1.6">
          • No-shows = <strong>no refund</strong> (weather exempt)<br/>
          • No cancellations — reschedule only (contact admin at least 1 hour before)
        </div>
      </div>
      <p style="text-align:center;font-size:12px;color:#aaa;margin-top:24px">📍 Anselmo Diaz St, Talisay City<br/>© 2026 Rex Kapehan</p>
    </div>
  `;

  const adminSubject = `💳 Payment Received — ${name} — ${date}`;
  const adminHtml = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0a0a0a">
      <h1 style="font-size:20px;margin:0 0 12px">New Paid Booking</h1>
      <table style="width:100%;font-size:14px;color:#333">
        <tr><td style="padding:4px 0;color:#888">Customer</td><td style="text-align:right"><strong>${name}</strong></td></tr>
        <tr><td style="padding:4px 0;color:#888">Phone</td><td style="text-align:right">${phone}</td></tr>
        <tr><td style="padding:4px 0;color:#888">Email</td><td style="text-align:right">${email}</td></tr>
        <tr><td style="padding:4px 0;color:#888">Date</td><td style="text-align:right">${date}</td></tr>
        <tr><td style="padding:4px 0;color:#888">Time</td><td style="text-align:right">${formatSlotRange(slots)} (${slots.join(', ')})</td></tr>
        <tr><td style="padding:4px 0;color:#888">Total</td><td style="text-align:right"><strong>₱${total.toLocaleString()}</strong></td></tr>
        <tr><td style="padding:4px 0;color:#888">Receipt No</td><td style="text-align:right">${receiptNo}</td></tr>
        <tr><td style="padding:4px 0;color:#888">Status</td><td style="text-align:right"><strong style="color:#10b981">Auto-confirmed ✅</strong></td></tr>
      </table>
    </div>
  `;

  await sendEmail(email, userSubject, userHtml);
  await sendEmail(ADMIN_EMAIL, adminSubject, adminHtml);
}
