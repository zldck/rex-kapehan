-- Run in the Supabase SQL Editor before deploying the webhook retry worker.
-- Events are written only by the server-side service role and retained for audit/retry.
create table if not exists public.paymongo_webhook_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text
);

create index if not exists paymongo_webhook_events_pending_idx
  on public.paymongo_webhook_events (next_attempt_at, received_at)
  where processed_at is null;

alter table public.paymongo_webhook_events enable row level security;
revoke all on public.paymongo_webhook_events from anon, authenticated;
grant all on public.paymongo_webhook_events to service_role;

-- Disable the older Supabase job that deleted all expired pending holds without
-- checking PayMongo. The API reconciler now verifies each Payment Intent first.
do $$
declare
  scheduled_job record;
begin
  if to_regclass('cron.job') is not null then
    for scheduled_job in
      select jobid from cron.job where jobname = 'release-expired-booking-holds'
    loop
      perform cron.unschedule(scheduled_job.jobid);
    end loop;
  end if;
end
$$;
