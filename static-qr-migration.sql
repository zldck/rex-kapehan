-- Run this in the Supabase SQL Editor to support the static QR Ph lane flow.
-- Adds the columns used to match an incoming payment to a booking.

alter table public.bookings
  add column if not exists expected_amount bigint,
  add column if not exists window_expires_at timestamptz;

create index if not exists bookings_pending_amount_idx
  on public.bookings (status, expected_amount);

create index if not exists bookings_pending_lane_idx
  on public.bookings (status, payment_reference);
