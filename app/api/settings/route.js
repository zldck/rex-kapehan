import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateDefaultAvailableSlots } from '../../lib/booking-pricing';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

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

// Public endpoint to fetch current settings (no auth required)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('hourly_rate, currency, available_slots, allow_half_hour_bookings')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Fetch settings error:', error);
      return NextResponse.json(
        { hourly_rate: 350, currency: 'PHP', available_slots: DEFAULT_AVAILABLE_SLOTS, allow_half_hour_bookings: false },
        { status: 200 }
      );
    }

    const settings = data || { hourly_rate: 350, currency: 'PHP', available_slots: DEFAULT_AVAILABLE_SLOTS, allow_half_hour_bookings: false };
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
    return NextResponse.json(
      { hourly_rate: 350, currency: 'PHP', available_slots: DEFAULT_AVAILABLE_SLOTS, allow_half_hour_bookings: false },
      { status: 200 }
    );
  }
}
