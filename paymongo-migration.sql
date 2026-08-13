-- Run this in the Supabase SQL Editor to add PayMongo payment columns.
-- Required BEFORE the new booking flow goes live.

alter table public.bookings
  add column if not exists payment_reference text,
  add column if not exists payment_status text default 'awaiting_payment',
  add column if not exists paid_at timestamptz;

create index if not exists bookings_payment_reference_idx
  on public.bookings (payment_reference);
