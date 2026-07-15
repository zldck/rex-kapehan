import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

export async function POST(request) {
  try {
    const { ids, status, email, name, date, slots } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0 || !status || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Update bookings
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status })
      .in('id', ids);

    if (updateError) {
      console.error('Status update error:', updateError);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    // Send email notification
    const isApproved = status === 'confirmed';
    const statusLabel = isApproved ? 'Confirmed' : 'Declined';
    const statusColor = isApproved ? '#10b981' : '#ef4444';
    const subject = isApproved 
      ? '✅ Your Rex Kapehan Booking is Confirmed!'
      : '❌ Your Rex Kapehan Booking Update';

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rex Kapehan <onboarding@resend.dev>',
        to: email,
        subject,
        html: `
          <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0a0a0a;background:#fafafa">
            <div style="text-align:center;margin-bottom:24px">
              <h1 style="color:#D4AF37;font-size:28px;font-weight:800;margin:0;letter-spacing:-0.5px">REX KAPEHAN</h1>
              <p style="color:#888;font-size:13px;margin:4px 0 0">Talisay City Pickleball Court</p>
            </div>

            <div style="background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e5e5e5">
              <div style="text-align:center;margin-bottom:24px">
                <div style="width:56px;height:56px;border-radius:50%;background:${statusColor}15;color:${statusColor};font-size:28px;line-height:56px;margin:0 auto 12px">
                  ${isApproved ? '✓' : '✕'}
                </div>
                <h2 style="font-size:20px;font-weight:700;margin:0;color:${statusColor}">${statusLabel}</h2>
              </div>

              <div style="background:#f5f5f5;border-radius:12px;padding:16px;margin-bottom:20px">
                <p style="margin:0 0 8px;font-size:14px"><strong>Customer:</strong> ${name}</p>
                <p style="margin:0 0 8px;font-size:14px"><strong>Date:</strong> ${new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                <p style="margin:0;font-size:14px"><strong>Time:</strong> ${slots.join(', ')}</p>
              </div>

              ${isApproved ? `
                <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 16px">
                  Your booking has been <strong>approved</strong>! Please arrive 10 minutes early. Bring your receipt screenshot as proof of payment.
                </p>
                <div style="background:#10b98108;border:1px solid #10b98120;border-radius:10px;padding:14px;font-size:13px;color:#059669;line-height:1.5">
                  <strong>📍 Location:</strong> Anselmo Diaz St, Talisay City<br>
                  <strong>⏰ Arrive:</strong> 10 minutes before your slot
                </div>
              ` : `
                <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 16px">
                  We're sorry, but your booking request has been <strong>declined</strong>. This may be due to scheduling conflicts or maintenance.
                </p>
                <p style="font-size:13px;color:#666;margin:0">
                  You may book a different date/time through our website. No charges have been processed.
                </p>
              `}
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
      console.error('Resend email error:', errText);
      return NextResponse.json({ success: true, emailSent: false, warning: 'Status updated but email failed' });
    }

    return NextResponse.json({ success: true, emailSent: true });
  } catch (err) {
    console.error('Status API error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}