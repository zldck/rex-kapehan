-- Run this in the Supabase SQL Editor.
-- Deletes unpaid booking holds every minute after their 10-minute payment window.

create extension if not exists pg_cron;

-- Make this migration safe to run again without creating duplicate jobs.
select cron.unschedule(jobid)
from cron.job
where jobname = 'release-expired-booking-holds';

select cron.schedule(
  'release-expired-booking-holds',
  '* * * * *',
  $$
    delete from public.bookings
    where status = 'pending_review'
      and window_expires_at is not null
      and window_expires_at <= now();
  $$
);
