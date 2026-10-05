import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { email, date, slots } = await request.json();

    if (!email || !date || !slots?.length) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Legacy clients called this on page unload/expiry. Do not delete a hold
    // based only on browser state: payment may already have succeeded while
    // the webhook is still being delivered. The reconciler releases it safely.
    return NextResponse.json({ success: true, cleanupDeferred: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}