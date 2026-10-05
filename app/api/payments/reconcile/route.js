import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendPaymentConfirmationEmails, getHourlyRate } from '../../_lib/payment-emails';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const PAYMENT_SETTLEMENT_GRACE_MS = 15 * 60 * 1000;

// Reconciles pending bookings against recent PayMongo payments.
// bookingIds === null means "all pending bookings" (used by cron).
async function reconcile(bookingIds) {
  // Load pending bookings before releasing expired holds. A payment can settle
  // at the end of the QR window while its webhook is still in flight.
  let query = supabase.from('bookings').select(
    'id, status, payment_reference, expected_amount, client_name, client_email, client_phone, booking_date, time_slot, window_expires_at'
  );
  if (bookingIds && bookingIds.length > 0) {
    query = query.in('id', bookingIds);
  } else {
    query = query.eq('status', 'pending_review');
  }

  const { data: bookings, error } = await query;
  if (error) {
    console.error('Reconcile load error:', error);
    return { confirmed: [], expired: false, error: 'Failed to load bookings' };
  }

  const all = bookings || [];

  // Requested bookings no longer exist → their slots were released.
  if (bookingIds && bookingIds.length > 0 && all.length === 0) {
    return { confirmed: [], expired: true };
  }

  const alreadyConfirmed = all.filter((b) => b.status === 'confirmed').map((b) => b.id);
  const pending = all.filter((b) => b.status === 'pending_review');

  // Fetch payments before cleaning up expired holds. If PayMongo is unavailable,
  // leave the holds in place so a transient API failure cannot erase a paid slot.
  let payments = [];
  let paymentLookupSucceeded = false;
  if (PAYMONGO_SECRET_KEY && pending.length > 0) {
    try {
      const res = await fetch('https://api.paymongo.com/v1/payments?limit=50', {
        headers: {
          Authorization: `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64')}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Reconcile payments fetch failed:', JSON.stringify(data));
      } else {
        payments = data?.data || [];
        paymentLookupSucceeded = true;
      }
    } catch (err) {
      console.error('Reconcile payments fetch error:', err);
    }
  }

  // Match each pending booking to a paid payment by intent id or lane + amount.
  const confirmedRows = [];
  for (const b of pending) {
    const match = payments.find((p) => {
      const a = p?.attributes;
      if (!a || a.status !== 'paid') return false;
      const intentId = a.payment_intent_id;
      if (intentId && intentId === b.payment_reference) return true;
      if (a.amount !== b.expected_amount) return false;
      const codeId = a.source?.provider?.code_id || a.source?.code_id;
      return codeId && codeId === b.payment_reference;
    });
    if (match) confirmedRows.push(b);
  }

  // Confirm matches and fail visibly if the database rejects the update.
  if (confirmedRows.length > 0) {
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'confirmed', payment_status: 'paid', paid_at: new Date().toISOString() })
      .in('id', confirmedRows.map((r) => r.id))
      .eq('status', 'pending_review');

    if (updateError) {
      console.error('Reconcile booking confirmation error:', updateError);
      return { confirmed: alreadyConfirmed, expired: false };
    }

    const hourlyRate = await getHourlyRate();
    await sendPaymentConfirmationEmails(confirmedRows, hourlyRate);
  }

  // Only release expired holds after a successful PayMongo lookup and a grace
  // period. This protects payments that arrive near expiry or whose webhook is
  // delayed, while still allowing abandoned slots to become available again.
  const cleanupCutoff = new Date(Date.now() - PAYMENT_SETTLEMENT_GRACE_MS).toISOString();
  const expiredUnpaid = paymentLookupSucceeded
    ? pending.filter((b) => b.window_expires_at && b.window_expires_at < cleanupCutoff
        && !confirmedRows.some((confirmed) => confirmed.id === b.id))
    : [];

  if (expiredUnpaid.length > 0) {
    const { error: cleanupError } = await supabase
      .from('bookings')
      .delete()
      .in('id', expiredUnpaid.map((b) => b.id))
      .eq('status', 'pending_review');
    if (cleanupError) console.error('Expired booking cleanup error:', cleanupError);
  }

  return {
    confirmed: [...alreadyConfirmed, ...confirmedRows.map((r) => r.id)],
    expired: expiredUnpaid.length > 0 && bookingIds != null && alreadyConfirmed.length === 0
      && confirmedRows.length === 0,
  };
}

// Client polling: reconcile specific booking ids.
export async function POST(request) {
  let bookingIds;
  try {
    ({ bookingIds } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
    return NextResponse.json({ confirmed: [], expired: false });
  }
  const result = await reconcile(bookingIds);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ confirmed: result.confirmed, expired: result.expired });
}

// Cron: reconcile all pending bookings.
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const result = await reconcile(null);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ confirmed: result.confirmed, expired: result.expired });
}
