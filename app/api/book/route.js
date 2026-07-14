import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Create service role client with auth disabled (server-side only)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export async function POST(request) {
  if (!supabaseServiceKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY not set in environment');
    return NextResponse.json({ error: 'Server configuration error: missing service role key' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { name, phone, email, date, slots } = body;

    if (!name || !phone || !email || !date || !slots || !Array.isArray(slots) || slots.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify email is in verified_emails table
    const { data: verifiedData, error: verifyError } = await supabase
      .from('verified_emails')
      .select('email')
      .eq('email', email)
      .single();

    if (verifyError || !verifiedData) {
      console.error('Verification check failed:', verifyError);
      return NextResponse.json({ error: 'Email not verified. Please verify your email first.' }, { status: 403 });
    }

    // Check for duplicates
    const { data: duplicates } = await supabase
      .from('bookings')
      .select('time_slot')
      .eq('booking_date', date)
      .in('time_slot', slots)
      .in('status', ['confirmed', 'pending_review']);

    if (duplicates && duplicates.length > 0) {
      return NextResponse.json({ error: 'One or more slots were just taken.' }, { status: 409 });
    }

    // Insert bookings
    const bookingsToInsert = slots.map(slot => ({
      client_name: name,
      client_phone: phone,
      client_email: email,
      booking_date: date,
      time_slot: slot,
      status: 'pending_review'
    }));

    const { error: insertError } = await supabase.from('bookings').insert(bookingsToInsert);

    if (insertError) {
      console.error('Booking insert error:', insertError);
      return NextResponse.json({ error: 'Failed to reserve slots: ' + insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, slots: slots.length });
  } catch (err) {
    console.error('Booking API error:', err);
    return NextResponse.json({ error: 'Invalid request: ' + err.message }, { status: 400 });
  }
}