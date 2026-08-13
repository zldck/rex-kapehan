import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendPaymentConfirmationEmails } from '../../_lib/payment-emails';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

// Reconciles pending bookings against recent PayMongo payments.
// bookingIds === null means "all pending bookings" (used by cron).
async function reconcile(bookingIds) {
  // 1. Load bookings.
  let query = supabase.from('bookings').select(
    'id, status, payment_reference, expected_amount, client_name, client_email, client_phone, booking_date, time_slot'
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

  // Already confirmed (e.g. by the webhook) → tell the client to move on.
  const alreadyConfirmed = all.filter((b) => b.status === 'confirmed').map((b) => b.id);
  if (alreadyConfirmed.length > 0) {
    return { confirmed: alreadyConfirmed, expired: false };
  }

  const pending = all.filter((b) => b.status === 'pending_review');
  if (pending.length === 0) {
    return { confirmed: [], expired: false };
  }

  if (!PAYMONGO_SECRET_KEY) {
    return { confirmed: [], expired: false };
  }

  // 2. Fetch recent payments from PayMongo.
  let payments = [];
  try {
    const res = await fetch('https://api.paymongo.com/v1/payments?limit=50', {
      headers: {
        Authorization: `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64')}`,
      },
    });
    const data = await res.json();
    payments = data?.data || [];
  } catch (err) {
    console.error('Reconcile payments fetch error:', err);
    return { confirmed: [], expired: false };
  }

  // 3. Match each pending booking to a paid payment by lane + amount.
  const confirmedRows = [];
  for (const b of pending) {
    const match = payments.find((p) => {
      const a = p?.attributes;
      if (!a || a.status !== 'paid' || a.amount !== b.expected_amount) return false;
      const codeId = a.source?.provider?.code_id || a.source?.code_id;
      return codeId && codeId === b.payment_reference;
    });
    if (match) confirmedRows.push(b);
  }

  // 4. Confirm matches.
  if (confirmedRows.length > 0) {
    await supabase
      .from('bookings')
      .update({ status: 'confirmed', payment_status: 'paid', paid_at: new Date().toISOString() })
      .in('id', confirmedRows.map((r) => r.id));

    await sendPaymentConfirmationEmails(confirmedRows);
  }

  return { confirmed: confirmedRows.map((r) => r.id), expired: false };
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
