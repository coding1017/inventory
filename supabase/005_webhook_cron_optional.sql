-- ═══════════════════════════════════════════════════════════
--  Optional pg_cron setup for the webhook delivery worker
--  Run in Supabase SQL Editor AFTER 004_webhooks.sql
--
--  WHY THIS IS OPTIONAL:
--    The primary deploy target is Vercel — vercel.json already wires
--    `/api/v1/external-crm/webhooks/deliver` to a 1-minute cron via
--    Vercel Cron. If the inventory app is deployed to Vercel and
--    CRON_SECRET is set as an env var, you do NOT need this migration.
--
--  WHEN YOU DO NEED IT:
--    - Deployed somewhere without a built-in cron (self-hosted,
--      Cloudflare Pages, Render, fly.io free tier, etc.)
--    - You want a second, redundant cron for safety
--    - You're on Vercel Hobby (cron limited to once/day) and need
--      minute-level granularity
--
--  WHAT IT DOES:
--    1. Enables pg_cron + pg_net Postgres extensions (idempotent).
--    2. Creates a single-row inv_webhook_cron_config table holding the
--       deploy URL + cron secret.
--    3. Schedules a 1-minute pg_cron job that calls
--       pg_net.http_post(url, body, headers).
--
--  OPERATOR ACTIONS REQUIRED:
--    1. Apply this migration.
--    2. Insert the config row:
--         insert into inv_webhook_cron_config (url, cron_secret)
--         values ('https://your-inventory-domain.com/api/v1/external-crm/webhooks/deliver',
--                 'whcron_<your-CRON_SECRET>');
--    3. Re-schedule the job after the row exists:
--         select cron.unschedule('inv-webhook-deliver');
--         select cron.schedule(
--           'inv-webhook-deliver',
--           '* * * * *',                       -- every minute
--           $$select inv_webhook_cron_tick()$$
--         );
--
--  HOW TO DISABLE:
--    select cron.unschedule('inv-webhook-deliver');
-- ═══════════════════════════════════════════════════════════

-- Enable required extensions. Both are part of Supabase by default but
-- may need explicit enabling.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;


-- ── Single-row config table ────────────────────────────────
create table if not exists inv_webhook_cron_config (
  id          int primary key default 1 check (id = 1),
  url         text not null,
  cron_secret text not null,
  is_enabled  boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- RLS: this table holds the cron secret in plaintext. Lock it down to
-- service-role only — no org-member access.
alter table inv_webhook_cron_config enable row level security;
-- (No policy granted: only service_role can read/write.)


-- ── The tick function ──────────────────────────────────────
-- Called by pg_cron every minute. Idempotent in the sense that
-- repeated firings are safe (the deliver endpoint itself is the lock).
create or replace function inv_webhook_cron_tick()
returns void language plpgsql security definer as $$
declare
  v_url    text;
  v_secret text;
begin
  select url, cron_secret into v_url, v_secret
  from inv_webhook_cron_config
  where id = 1 and is_enabled = true;

  if v_url is null then
    raise notice 'inv_webhook_cron_tick: config row missing or disabled — skipping';
    return;
  end if;

  -- pg_net.http_post returns a request_id. We fire-and-forget; the
  -- deliver endpoint logs its own activity into inv_webhook_deliveries.
  perform net.http_post(
    url     := v_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'X-Cron-Secret',  v_secret
    ),
    timeout_milliseconds := 30000
  );
end;
$$;


-- ── Schedule the job ───────────────────────────────────────
-- This will silently fail if pg_cron's "cron" schema isn't yet writable
-- (some Supabase plans need the extension toggled via the dashboard
-- "Database → Extensions" page before SQL access works). If you see an
-- error like 'cron.schedule does not exist', enable pg_cron from the
-- dashboard, then re-run just this block.
do $$
begin
  perform cron.unschedule('inv-webhook-deliver');
exception when others then null;
end $$;

select cron.schedule(
  'inv-webhook-deliver',
  '* * * * *',
  $$select inv_webhook_cron_tick()$$
);
