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
    const { name, phone, email, date, slots } = await request.json();

    // Validate inputs
    if (!name?.trim() || !phone || !email || !date || !slots?.length) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if any slot is already taken (confirmed or pending_review)
    const { data: existing, error: checkError } = await supabase
      .from('bookings')
      .select('time_slot')
      .eq('booking_date', date)
      .in('time_slot', slots)
      .in('status', ['confirmed', 'pending_review']);

    if (checkError) {
      console.error('Availability check error:', checkError);
      return NextResponse.json(
        { error: 'Failed to check availability' },
        { status: 500 }
      );
    }

    if (existing && existing.length > 0) {
      const takenSlots = existing.map(row => row.time_slot);
      return NextResponse.json(
        { error: `Slots already taken: ${takenSlots.join(', ')}`, takenSlots },
        { status: 409 }
      );
    }

    // Insert pending bookings
    const bookings = slots.map(slot => ({
      client_name: name.trim(),
      client_phone: phone,
      client_email: email,
      booking_date: date,
      time_slot: slot,
      status: 'pending_review',
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('bookings')
      .insert(bookings)
      .select('id');

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to reserve slots' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      bookingIds: inserted.map(row => row.id),
      count: inserted.length,
    });
  } catch (err) {
    console.error('Hold slots error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// After inserting bookings, send admin notification
try {
  const adminEmail = process.env.ADMIN_EMAIL || 'your-email@gmail.com';
  const subject = '🔔 New Booking Pending Approval';
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#0a0a0a">
      <div style="background:#D4AF37;padding:16px 24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="margin:0;color:#000;font-size:24px">🎾 Rex Kapehan</h1>
        <p style="margin:0;color:#000;font-weight:600">New Booking Pending</p>
      </div>
      <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
        <p><strong>Customer:</strong> ${name}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Date:</strong> ${date}</p>
        <p><strong>Time(s):</strong> ${slots.join(', ')}</p>
        <div style="background:#fef3c7;padding:12px 16px;border-radius:8px;border:1px solid #fbbf24;margin:16px 0">
          <p style="margin:0;color:#92400e;font-size:13px">
            ⏳ ${slots.length} slot(s) pending review. Please approve or cancel in the admin panel.
          </p>
        </div>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin" style="background:#D4AF37;color:#000;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;margin-top:8px">
          Go to Admin
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
      to: process.env.ADMIN_EMAIL || 'your-email@gmail.com',
      subject: subject,
      html: html,
    }),
  });
} catch (_) { /* email failure shouldn't break booking */ }