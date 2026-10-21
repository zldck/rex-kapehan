import { NextResponse } from 'next/server';
import { retryPendingPaymongoEvents } from '../../_lib/paymongo-webhook-events';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const result = await retryPendingPaymongoEvents();
    return NextResponse.json(result);
  } catch (error) {
    console.error('PayMongo webhook retry job failed:', error);
    return NextResponse.json({ error: 'Webhook retry failed' }, { status: 500 });
  }
}
