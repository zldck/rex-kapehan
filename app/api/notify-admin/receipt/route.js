import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { name, phone, email, date, slots, senderName, lastFourDigits } = await request.json();

    const adminEmail = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || 'muihilado@gmail.com';

    const subject = `📎 Receipt Submitted — ${name} — ${date}`;

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#0a0a0a">
        <div style="background:#D4AF37;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="margin:0;color:#000;font-size:24px">🎾 Rex Kapehan</h1>
          <p style="margin:4px 0 0;color:#000;font-weight:600">Receipt Submitted — Pending Approval</p>
        </div>
        <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
          <p><strong>👤 Customer:</strong> ${name}</p>
          <p><strong>📱 Phone:</strong> ${phone}</p>
          <p><strong>📧 Email:</strong> ${email}</p>
          <p><strong>📅 Date:</strong> ${new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <p><strong>⏰ Time(s):</strong> ${slots.join(', ')}</p>
          <p><strong>💳 Sender:</strong> ${senderName}</p>
          <p><strong>🔢 Ref Digits:</strong> ${lastFourDigits}</p>
          <div style="background:#fef3c7;padding:12px 16px;border-radius:8px;border:1px solid #fbbf24;margin:16px 0">
            <p style="margin:0;color:#92400e;font-size:13px">
              📎 Receipt uploaded! ${slots.length} slot(s) pending review. Verify payment and approve.
            </p>
          </div>
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://www.rexkapehan.com'}/admin" style="background:#D4AF37;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;margin-top:8px">
            🔗 Go to Admin Panel
          </a>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
          <p style="color:#999;font-size:12px;margin:0">Rex Kapehan • Talisay City Pickleball Court</p>
        </div>
      </div>
    `;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rex Kapehan <no-reply@mail.rexkapehan.com>',
        to: adminEmail,
        subject,
        html,
      }),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Receipt notification error:', err);
    return NextResponse.json({ error: 'Notification failed' }, { status: 500 });
  }
}
