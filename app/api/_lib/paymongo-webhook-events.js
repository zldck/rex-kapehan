import { createClient } from '@supabase/supabase-js';
import { sendPaymentConfirmationEmails, getHourlyRate } from './payment-emails';
import { getQrPool } from './qr-pool';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

export async function persistPaymongoEvent({ eventId, eventType, event }) {
  return supabase
    .from('paymongo_webhook_events')
    .upsert({ event_id: eventId, event_type: eventType || 'unknown', payload: event }, {
      onConflict: 'event_id',
      ignoreDuplicates: true,
    });
}

export async function processPaymongoEvent(event) {
  const attrs = event?.data?.attributes || event?.attributes || {};
  const type = attrs?.type;
  const raw = attrs?.data || {};
  const inner = raw?.attributes || raw;
  const refId = raw?.id || inner?.id || null;
  const metadata = inner?.metadata || raw?.metadata || attrs?.metadata || {};
  let bookingIds = Array.isArray(metadata.booking_ids)
    ? metadata.booking_ids
    : (typeof metadata.booking_ids === 'string'
        ? metadata.booking_ids.split(',').filter(Boolean)
        : []);

  const intentId = inner?.payment_intent_id ?? raw?.payment_intent_id ?? null;
  const amount = inner?.amount ?? raw?.amount ?? null;
  const codeId =
    inner?.source?.provider?.code_id ??
    raw?.source?.provider?.code_id ??
    inner?.source?.code_id ??
    raw?.source?.code_id ??
    null;
  const lane = getQrPool().find((qr) => qr.id === codeId);

  if (type === 'payment.paid' && bookingIds.length === 0 && intentId) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_reference', intentId)
      .eq('status', 'pending_review');
    if (error) throw error;
    bookingIds = data?.map((row) => row.id) || [];
  }

  if (type === 'payment.paid' && bookingIds.length === 0 && lane && amount != null) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_reference', lane.id)
      .eq('expected_amount', amount)
      .eq('status', 'pending_review');
    if (error) throw error;
    bookingIds = data?.map((row) => row.id) || [];
  }

  if (bookingIds.length === 0 && refId) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_reference', refId);
    if (error) throw error;
    bookingIds = data?.map((row) => row.id) || [];
  }

  if ((type === 'payment.paid' || type === 'qr.paid') && bookingIds.length > 0) {
    const { data: pendingRows, error: selectError } = await supabase
      .from('bookings')
      .select('id')
      .in('id', bookingIds)
      .eq('status', 'pending_review');
    if (selectError) throw selectError;

    if (pendingRows?.length) {
      // Return only rows this delivery actually transitioned. Concurrent retries
      // therefore cannot send duplicate confirmation emails for the same rows.
      const { data: confirmedRows, error: updateError } = await supabase
        .from('bookings')
        .update({
          status: 'confirmed',
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .in('id', pendingRows.map((row) => row.id))
        .eq('status', 'pending_review')
        .select('id, client_name, client_email, client_phone, booking_date, time_slot');
      if (updateError) throw updateError;

      if (confirmedRows?.length) {
        const hourlyRate = await getHourlyRate();
        await sendPaymentConfirmationEmails(confirmedRows, hourlyRate);
      }
    } else {
      console.warn('PayMongo paid event had no pending booking rows', { type, intentId, refId, bookingIds });
    }
    return;
  }

  // Do not delete a booking hold from a failed/expired event: payment events can
  // arrive out of order. The reconciler releases a hold only after checking the
  // exact Payment Intent and its terminal status.
  if (type === 'payment.failed' || type === 'qr.expired') {
    console.info(`PayMongo ${type} received; booking hold retained pending reconciliation`, { intentId, refId });
    return;
  }

  if ((type === 'payment.refunded' || type === 'payment.refund.updated') && bookingIds.length > 0) {
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', payment_status: 'refunded' })
      .in('id', bookingIds);
    if (error) throw error;
    return;
  }

  console.info(`PayMongo webhook: unhandled or no booking ids for ${type}`);
}

export async function processStoredPaymongoEvent(eventId) {
  const { data: row, error: loadError } = await supabase
    .from('paymongo_webhook_events')
    .select('event_id, payload, attempt_count, processed_at')
    .eq('event_id', eventId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!row || row.processed_at) return { skipped: true };

  try {
    await processPaymongoEvent(row.payload);
  } catch (error) {
    const attemptCount = (row.attempt_count || 0) + 1;
    const retryMinutes = Math.min(2 ** Math.min(attemptCount, 5), 60);
    const { error: updateError } = await supabase
      .from('paymongo_webhook_events')
      .update({
        attempt_count: attemptCount,
        next_attempt_at: new Date(Date.now() + retryMinutes * 60 * 1000).toISOString(),
        last_error: String(error?.message || error).slice(0, 2000),
      })
      .eq('event_id', eventId)
      .is('processed_at', null);
    if (updateError) console.error('PayMongo webhook retry-state update failed:', updateError);
    throw error;
  }

  const { error: completeError } = await supabase
    .from('paymongo_webhook_events')
    .update({ processed_at: new Date().toISOString(), last_error: null })
    .eq('event_id', eventId)
    .is('processed_at', null);
  if (completeError) throw completeError;
  return { processed: true };
}

export async function retryPendingPaymongoEvents(limit = 25) {
  const { data: rows, error } = await supabase
    .from('paymongo_webhook_events')
    .select('event_id')
    .is('processed_at', null)
    .lte('next_attempt_at', new Date().toISOString())
    .order('received_at', { ascending: true })
    .limit(limit);
  if (error) throw error;

  const results = { processed: 0, failed: 0 };
  for (const row of rows || []) {
    try {
      const result = await processStoredPaymongoEvent(row.event_id);
      if (result.processed) results.processed += 1;
    } catch (err) {
      results.failed += 1;
      console.error('PayMongo webhook retry failed:', row.event_id, err);
    }
  }
  return results;
}