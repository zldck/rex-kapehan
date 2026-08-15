import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

// Public endpoint to fetch current settings (no auth required)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('hourly_rate, currency')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Fetch settings error:', error);
      return NextResponse.json(
        { hourly_rate: 350, currency: 'PHP' },
        { status: 200 }
      );
    }

    // Return settings or defaults
    const settings = data || { hourly_rate: 350, currency: 'PHP' };
    return NextResponse.json(settings, { status: 200 });
  } catch (err) {
    console.error('Get settings error:', err);
    return NextResponse.json(
      { hourly_rate: 350, currency: 'PHP' },
      { status: 200 }
    );
  }
}
