import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendPaymentConfirmationEmails, getHourlyRate } from '../../_lib/payment-emails';
import { isPaymentIntentPaid, isPaymentIntentSafelyReleasable } from '../../../lib/payment-intent-status';

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

  // Look up each Payment Intent directly. The global payments list is limited to
  // recent results and cannot safely prove that a missing payment is unpaid.
  let payments = [];
  const intentStatuses = new Map();
  const intentIds = [...new Set(pending
    .map((booking) => booking.payment_reference)
    .filter((reference) => typeof reference === 'string' && reference.startsWith('pi_')))];
  const authorization = PAYMONGO_SECRET_KEY
    ? `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64')}`
    : null;

  if (PAYMONGO_SECRET_KEY) {
    for (const intentId of intentIds) {
      try {
        const res = await fetch(`https://api.paymongo.com/v1/payment_intents/${encodeURIComponent(intentId)}`, {
          headers: { Authorization: authorization },
        });
        const data = await res.json();
        if (!res.ok) {
          console.error('Reconcile Payment Intent lookup failed:', intentId, JSON.stringify(data));
          continue;
        }
        const status = data?.data?.attributes?.status;
        if (typeof status === 'string') intentStatuses.set(intentId, status);
      } catch (err) {
        console.error('Reconcile Payment Intent lookup error:', intentId, err);
      }
    }
  }

  // Keep the legacy QR-lane fallback for records created by the older flow.
  const hasLegacyReferences = pending.some((booking) =>
    booking.payment_reference && !booking.payment_reference.startsWith('pi_')
  );
  if (PAYMONGO_SECRET_KEY && hasLegacyReferences) {
    try {
      const res = await fetch('https://api.paymongo.com/v1/payments?limit=50', {
        headers: {
          Authorization: authorization,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Reconcile payments fetch failed:', JSON.stringify(data));
      } else {
        payments = data?.data || [];
      }
    } catch (err) {
      console.error('Reconcile payments fetch error:', err);
    }
  }

  // Match each pending booking to a paid payment by intent id or lane + amount.
  const confirmedRows = [];
  for (const b of pending) {
    if (isPaymentIntentPaid(intentStatuses.get(b.payment_reference))) {
      confirmedRows.push(b);
      continue;
    }

    // Only use amount + QR lane matching for legacy static QR bookings. Never
    // infer a Payment Intent's result from a shared amount or a recent-list miss.
    if (typeof b.payment_reference === 'string' && b.payment_reference.startsWith('pi_')) continue;
    const match = payments.find((p) => {
      const a = p?.attributes;
      if (!a || a.status !== 'paid') return false;
      if (a.amount !== b.expected_amount) return false;
      const codeId = a.source?.provider?.code_id || a.source?.code_id;
      return codeId && codeId === b.payment_reference;
    });
    if (match) confirmedRows.push(b);
  }

  // Confirm matches and fail visibly if the database rejects the update.
  if (confirmedRows.length > 0) {
    const { data: updatedRows, error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'confirmed', payment_status: 'paid', paid_at: new Date().toISOString() })
      .in('id', confirmedRows.map((r) => r.id))
      .eq('status', 'pending_review')
      .select('id, client_name, client_email, client_phone, booking_date, time_slot');

    if (updateError) {
      console.error('Reconcile booking confirmation error:', updateError);
      return { confirmed: alreadyConfirmed, expired: false };
    }

    if (updatedRows?.length) {
      const hourlyRate = await getHourlyRate();
      await sendPaymentConfirmationEmails(updatedRows, hourlyRate);
    }
  }

  // Release only Payment Intents that PayMongo explicitly reports as canceled,
  // and only after the settlement grace period. A missing payment from the
  // recent-payments list is not evidence that the payment did not succeed.
  const cleanupCutoff = new Date(Date.now() - PAYMENT_SETTLEMENT_GRACE_MS).toISOString();
  const expiredUnpaid = pending.filter((b) =>
    b.payment_reference && isPaymentIntentSafelyReleasable(intentStatuses.get(b.payment_reference))
      && b.window_expires_at && b.window_expires_at < cleanupCutoff
      && !confirmedRows.some((confirmed) => confirmed.id === b.id)
  );

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
