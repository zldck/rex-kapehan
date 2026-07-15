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
    const { email, date, slots } = await request.json();

    if (!email || !date || !slots?.length) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabase
      .from('bookings')
      .delete()
      .eq('booking_date', date)
      .eq('client_email', email)
      .in('time_slot', slots)
      .eq('status', 'pending_review');

    if (deleteError) {
      console.error('Cleanup delete error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to release slots' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Cleanup error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}