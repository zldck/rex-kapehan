import { NextResponse, after } from 'next/server';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import {
  persistPaymongoEvent,
  processPaymongoEvent,
  processStoredPaymongoEvent,
} from '../../_lib/paymongo-webhook-events';

const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

export async function POST(request) {
  const rawBody = await request.text();

  if (!PAYMONGO_WEBHOOK_SECRET) {
    console.error('PAYMONGO_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // --- Verify signature. PayMongo signs HMAC-SHA256 of the raw body and puts
  //     the hex digest in the `paymongo-signature` header. Older endpoints used
  //     `t=...,li=<hmac of "t.body">`. We accept both. ---
  const sigHeader = (request.headers.get('paymongo-signature') || '').trim();
  if (!sigHeader) {
    console.warn('PayMongo webhook: missing signature header');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const safeEqual = (a, b) => {
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  };

  const bodyHmac = createHmac('sha256', PAYMONGO_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const parts = {};
  sigHeader.split(',').forEach((p) => {
    const idx = p.indexOf('=');
    if (idx !== -1) parts[p.slice(0, idx).trim()] = p.slice(idx + 1).trim();
  });
  const timestamp = parts.t;
  const signature = parts.li;

  // Current scheme: the header itself is the hex signature.
  let isValid = safeEqual(bodyHmac, sigHeader);

  // Some setups send `li=<hex>` (signature of the raw body).
  if (!isValid && signature) {
    isValid = safeEqual(bodyHmac, signature);
  }

  // Legacy scheme: HMAC-SHA256 of `${timestamp}.${rawBody}`, in `li`.
  if (!isValid && timestamp && signature) {
    const legacyHmac = createHmac('sha256', PAYMONGO_WEBHOOK_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    isValid = safeEqual(legacyHmac, signature);
  }

  if (!isValid) {
    console.warn('PayMongo webhook: signature mismatch');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Replay protection (only applies to the legacy `t=...` scheme). PayMongo
  // retries deliveries over minutes/hours, so a tight window would reject
  // legitimate retries. Signature verification above is the real gate; log only.
  if (timestamp && Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    console.warn('PayMongo webhook: stale timestamp (likely a retried delivery)');
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    // The signature verified against the raw body, so this is a PayMongo-side
    // anomaly. Acknowledge instead of erroring so the webhook is not disabled.
    console.error('PayMongo webhook: invalid JSON body');
    return NextResponse.json({ received: true, error: 'invalid_json' });
  }

  const attrs = event?.data?.attributes || event?.attributes || {};
  const eventId = event?.data?.id || event?.id || createHash('sha256').update(rawBody).digest('hex');
  const eventType = attrs?.type || 'unknown';
  const { error: persistError } = await persistPaymongoEvent({ eventId, eventType, event });
  const persisted = !persistError;

  if (persistError) {
    // Preserve the established 200 response policy to avoid disabling the
    // provider endpoint; reconciliation remains the fallback if storage is down.
    console.error('PayMongo webhook event could not be persisted; falling back to immediate processing:', persistError);
  }

  // Store first, acknowledge quickly, then process. The scheduled retry route
  // recovers events whose background processing fails after this response.
  after(async () => {
    try {
      if (persisted) await processStoredPaymongoEvent(eventId);
      else await processPaymongoEvent(event);
    } catch (err) {
      console.error('PayMongo webhook processing error:', eventId, err);
    }
  });

  return NextResponse.json({ received: true });
}
