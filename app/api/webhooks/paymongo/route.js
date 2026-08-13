import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { sendPaymentConfirmationEmails } from '../../_lib/payment-emails';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

export async function POST(request) {
  const rawBody = await request.text();

  if (!PAYMONGO_WEBHOOK_SECRET) {
    console.error('PAYMONGO_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // --- Verify signature: HMAC-SHA256 of `${timestamp}.${body}` ---
  const sigHeader = request.headers.get('paymongo-signature') || '';
  const parts = {};
  sigHeader.split(',').forEach((p) => {
    const idx = p.indexOf('=');
    if (idx !== -1) parts[p.slice(0, idx).trim()] = p.slice(idx + 1).trim();
  });

  const timestamp = parts.t;
  const signature = parts.li;

  if (!timestamp || !signature) {
    console.warn('PayMongo webhook: missing signature parts');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const expected = createHmac('sha256', PAYMONGO_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  const isValid = sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);

  if (!isValid) {
    console.warn('PayMongo webhook: signature mismatch');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Reject stale events (replay protection)
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    console.warn('PayMongo webhook: stale timestamp');
    return NextResponse.json({ error: 'Stale event' }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const type = event?.data?.attributes?.type;
  const raw = event?.data?.attributes?.data || {};
  const inner = raw?.attributes || raw; // QR/payment payloads may be flat or wrapped
  const refId = inner?.id || null;
  const metadata = inner?.metadata || event?.data?.attributes?.metadata || {};
  let bookingIds = Array.isArray(metadata.booking_ids) ? metadata.booking_ids : [];

  console.log(`PayMongo webhook received: ${type}`, bookingIds);

  // Fallback: map by payment_reference (qr id / checkout session id)
  if (bookingIds.length === 0 && refId) {
    const { data: matched } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_reference', refId);
    bookingIds = matched?.map((r) => r.id) || [];
  }

  try {
    if ((type === 'payment.paid' || type === 'qr.paid') && bookingIds.length > 0) {
      const { data: rows } = await supabase
        .from('bookings')
        .select('id, client_name, client_email, client_phone, booking_date, time_slot')
        .in('id', bookingIds)
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

        await sendPaymentConfirmationEmails(rows);
      }
    } else if ((type === 'payment.failed' || type === 'qr.expired') && bookingIds.length > 0) {
      await supabase
        .from('bookings')
        .delete()
        .in('id', bookingIds)
        .eq('status', 'pending_review');
    } else if ((type === 'payment.refunded' || type === 'payment.refund.updated') && bookingIds.length > 0) {
      await supabase
        .from('bookings')
        .update({ status: 'cancelled', payment_status: 'refunded' })
        .in('id', bookingIds);
    } else {
      console.log(`PayMongo webhook: unhandled or no booking ids for ${type}`);
    }
  } catch (err) {
    console.error('PayMongo webhook processing error:', err);
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
