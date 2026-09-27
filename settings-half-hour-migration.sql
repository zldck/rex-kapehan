ALTER TABLE IF EXISTS public.settings
  ADD COLUMN IF NOT EXISTS allow_half_hour_bookings BOOLEAN NOT NULL DEFAULT false;

UPDATE public.settings
SET allow_half_hour_bookings = false
WHERE allow_half_hour_bookings IS NULL;

CREATE INDEX IF NOT EXISTS idx_settings_allow_half_hour
  ON public.settings (allow_half_hour_bookings);
