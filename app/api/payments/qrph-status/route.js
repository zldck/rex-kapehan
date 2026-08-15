import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendPaymentConfirmationEmails, getHourlyRate } from '../../_lib/payment-emails';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;

export async function POST(request) {
  let qrphId;
  try {
    ({ qrphId } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (!qrphId) {
    return NextResponse.json({ error: 'Missing qrphId' }, { status: 400 });
  }

  if (!PAYMONGO_SECRET_KEY) {
    return NextResponse.json({ error: 'Payment service not configured' }, { status: 500 });
  }

  let qr;
  try {
    const res = await fetch(
      `https://api.paymongo.com/v3/qr/${qrphId}?qr_string=false&qr_image=false`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64')}`,
        },
      }
    );
    const data = await res.json();
    if (!res.ok) {
      console.error('QRPh status fetch error:', JSON.stringify(data));
      // Don't fail the poll — the QR may still be processing.
      return NextResponse.json({ status: 'pending' });
    }
    qr = data?.data;
  } catch (err) {
    console.error('QRPh status error:', err);
    return NextResponse.json({ status: 'pending' });
  }

  const status = qr?.status;

  if (status === 'paid') {
    const { data: rows } = await supabase
      .from('bookings')
      .select('id, client_name, client_email, client_phone, booking_date, time_slot')
      .eq('payment_reference', qrphId)
      .eq('status', 'pending_review');

    if (rows && rows.length > 0) {
      await supabase
        .from('bookings')
        .update({
          status: 'confirmed',
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .in('id', rows.map((r) => r.id));

      const hourlyRate = await getHourlyRate();
      await sendPaymentConfirmationEmails(rows, hourlyRate);
    }
    return NextResponse.json({ status: 'paid' });
  }

  if (status === 'expired' || status === 'failed' || status === 'voided') {
    await supabase
      .from('bookings')
      .delete()
      .eq('payment_reference', qrphId)
      .eq('status', 'pending_review');
    return NextResponse.json({ status: 'expired' });
  }

  return NextResponse.json({ status: 'pending', expiresAt: qr?.expires_at || null });
}
