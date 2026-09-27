import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateDefaultAvailableSlots } from '../../../lib/booking-pricing';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const DEFAULT_AVAILABLE_SLOTS = generateDefaultAvailableSlots(false);

const normalizeAvailableSlots = (value) => {
  if (!value) return DEFAULT_AVAILABLE_SLOTS;

  const rawValues = Array.isArray(value) ? value : String(value).split(/\n|,/);
  const cleaned = [...new Set(rawValues
    .map((slot) => String(slot).trim())
    .filter(Boolean)
    .map((slot) => slot.replace(/\s+/g, ' ')))];

  return cleaned.length ? cleaned : DEFAULT_AVAILABLE_SLOTS;
};

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
      available_slots: DEFAULT_AVAILABLE_SLOTS,
      allow_half_hour_bookings: false,
    };

    const includeHalfHour = Boolean(settings.allow_half_hour_bookings);
    const mergedSlots = [...new Set([
      ...normalizeAvailableSlots(settings.available_slots),
      ...generateDefaultAvailableSlots(includeHalfHour),
    ])];

    return NextResponse.json({
      hourly_rate: settings.hourly_rate || 350,
      currency: settings.currency || 'PHP',
      available_slots: includeHalfHour ? mergedSlots : normalizeAvailableSlots(settings.available_slots),
      allow_half_hour_bookings: includeHalfHour,
    }, { status: 200 });
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
    const { hourly_rate, currency, available_slots, allow_half_hour_bookings } = body;

    if (!hourly_rate || hourly_rate <= 0) {
      return NextResponse.json({ error: 'Invalid hourly rate' }, { status: 400 });
    }

    const normalizedSlots = normalizeAvailableSlots(available_slots);
    const halfHourEnabled = Boolean(allow_half_hour_bookings);

    // Upsert settings (insert or update)
    const { data, error } = await supabase
      .from('settings')
      .upsert({
        hourly_rate,
        currency: currency || 'PHP',
        available_slots: normalizedSlots,
        allow_half_hour_bookings: halfHourEnabled,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id',
      })
      .select()
      .single();

    if (error) {
      console.error('Upsert error:', error);
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }

    return NextResponse.json({
      ...data,
      available_slots: normalizeAvailableSlots(data?.available_slots || normalizedSlots),
      allow_half_hour_bookings: Boolean(data?.allow_half_hour_bookings ?? halfHourEnabled),
    }, { status: 200 });
  } catch (err) {
    console.error('Post settings error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
