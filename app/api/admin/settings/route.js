import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verify } from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

export async function GET(request) {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }

    // Return default settings if none exist
    const settings = data || {
      hourly_rate: 350,
      currency: 'PHP',
    };

    return NextResponse.json(settings, { status: 200 });
  } catch (err) {
    console.error('Get settings error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    // Check admin authentication via cookie
    const token = request.cookies.get('admin_token')?.value;
    const isValidAdmin = token && request.headers.get('accept') !== undefined; // Simple check

    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { hourly_rate, currency } = body;

    if (!hourly_rate || hourly_rate <= 0) {
      return NextResponse.json({ error: 'Invalid hourly rate' }, { status: 400 });
    }

    // Upsert settings (insert or update)
    const { data, error } = await supabase
      .from('settings')
      .upsert({ hourly_rate, currency: currency || 'PHP', updated_at: new Date().toISOString() }, {
        onConflict: 'id',
      })
      .select()
      .single();

    if (error) {
      console.error('Upsert error:', error);
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('Post settings error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
