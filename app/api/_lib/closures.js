import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

export async function getClosuresForDate(date) {
  let query = supabase
    .from('closures')
    .select('id, booking_date, time_slot, created_at')
    .order('booking_date', { ascending: true })
    .order('time_slot', { ascending: true });

  if (date) query = query.eq('booking_date', date);

  return query;
}

export async function getClosedSlots(date, slots = []) {
  const candidates = [...new Set([...slots, 'ALL'])];
  const { data, error } = await supabase
    .from('closures')
    .select('time_slot')
    .eq('booking_date', date)
    .in('time_slot', candidates);

  return { data: data || [], error };
}

export async function saveClosures(rows) {
  return supabase
    .from('closures')
    .upsert(rows, {
      onConflict: 'booking_date, time_slot',
      ignoreDuplicates: true,
    });
}

export { supabase as closuresSupabase };
