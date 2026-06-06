-- ═══════════════════════════════════════════════════════════
--  External-CRM webhooks (outbound)
--  Run in Supabase SQL Editor AFTER 003_reservations.sql
--
--  Design:
--    - inv_webhook_subscriptions: who wants what (per org)
--    - inv_webhook_events:        what happened (append-only log,
--                                  fed by route handlers + triggers)
--    - inv_webhook_deliveries:    fan-out attempts (one row per
--                                  (event × subscription) × attempt
--                                  group). status=pending|success|
--                                  failed|exhausted.
--
--  Event catalog (v1):
--    - reservation.created       payload = full Reservation row
--    - reservation.committed     payload = full Reservation row + invoice ref
--    - reservation.released      payload = full Reservation row + reason
--    - stock.low_stock           payload = { product_id, variant_id,
--                                            location_id, quantity, reserved,
--                                            low_stock_threshold }
--    - stock.out_of_stock        payload = same shape as low_stock,
--                                            quantity = 0
--
--  HMAC signature: hex(HMAC-SHA256(subscription.secret, body)).
--  Sent as X-Webnari-Signature on every POST.
--
--  Retry: 1 / 5 / 15 / 60 / 240 min (5 attempts total, then status='exhausted')
--  Compute in app code; this migration just stores `next_attempt_at`.
-- ═══════════════════════════════════════════════════════════

-- ── Subscriptions ───────────────────────────────────────────
create table if not exists inv_webhook_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  name        text not null,                   -- human-readable label
  url         text not null,                   -- target POST endpoint
  secret      text not null,                   -- HMAC-SHA256 key, plaintext
                                               -- (revealed only at create time)
  events      text[] not null default '{}',    -- subset of supported events;
                                               -- empty means "subscribe to all"
  is_active   boolean not null default true,
  created_by  uuid,
  last_delivered_at  timestamptz,
  last_failure_at    timestamptz,
  failure_streak     int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists inv_webhook_subscriptions_active
  on inv_webhook_subscriptions (org_id) where is_active = true;

create trigger touch_inv_webhook_subscriptions before update on inv_webhook_subscriptions
  for each row execute procedure touch_updated_at();

alter table inv_webhook_subscriptions enable row level security;

create policy "org_member_access" on inv_webhook_subscriptions for all using (
  org_id in (select org_id from inv_org_members where user_id = auth.uid() and status = 'active')
);


-- ── Events (append-only log of what happened) ───────────────
create table if not exists inv_webhook_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  event       text not null,                   -- e.g. 'reservation.committed'
  payload     jsonb not null default '{}',
  source      text,                            -- e.g. 'route_handler' / 'stock_trigger'
  created_at  timestamptz not null default now()
);

create index if not exists inv_webhook_events_org_created
  on inv_webhook_events (org_id, created_at desc);

create index if not exists inv_webhook_events_event_created
  on inv_webhook_events (event, created_at desc);

alter table inv_webhook_events enable row level security;

create policy "org_member_access" on inv_webhook_events for all using (
  org_id in (select org_id from inv_org_members where user_id = auth.uid() and status = 'active')
);


-- ── Deliveries (one row per (event × subscription) × attempt) ─
create table if not exists inv_webhook_deliveries (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  event_id         uuid not null references inv_webhook_events(id) on delete cascade,
  subscription_id  uuid not null references inv_webhook_subscriptions(id) on delete cascade,
  attempt          int not null default 1,
  status           text not null default 'pending'
                     check (status in ('pending', 'success', 'failed', 'exhausted')),
  response_code    int,
  response_body    text,                        -- truncated, max ~2KB recommended
  duration_ms      int,
  next_attempt_at  timestamptz not null default now(),
  delivered_at     timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists inv_webhook_deliveries_pending
  on inv_webhook_deliveries (next_attempt_at)
  where status = 'pending';

create index if not exists inv_webhook_deliveries_org_status
  on inv_webhook_deliveries (org_id, status, created_at desc);

create index if not exists inv_webhook_deliveries_event
  on inv_webhook_deliveries (event_id, attempt);

alter table inv_webhook_deliveries enable row level security;

create policy "org_member_access" on inv_webhook_deliveries for all using (
  org_id in (select org_id from inv_org_members where user_id = auth.uid() and status = 'active')
);


-- ═══════════════════════════════════════════════════════════
--  FUNCTIONS
-- ═══════════════════════════════════════════════════════════

-- Publish an event: writes the event row + fans out delivery rows for
-- every active subscription on this org that subscribes to either this
-- specific event OR all events ('' / empty array).
--
-- Returns the event_id. Safe to call from route handlers (synchronous
-- in the same transaction as the source mutation) OR from triggers.
create or replace function inv_publish_event(
  p_org_id  uuid,
  p_event   text,
  p_payload jsonb,
  p_source  text default null
) returns uuid language plpgsql security definer as $$
declare
  v_event_id uuid;
begin
  insert into inv_webhook_events (org_id, event, payload, source)
  values (p_org_id, p_event, p_payload, coalesce(p_source, 'route_handler'))
  returning id into v_event_id;

  -- Fan-out: one pending delivery per matching subscription.
  insert into inv_webhook_deliveries (org_id, event_id, subscription_id, next_attempt_at)
  select p_org_id, v_event_id, s.id, now()
    from inv_webhook_subscriptions s
   where s.org_id = p_org_id
     and s.is_active = true
     and (cardinality(s.events) = 0 or p_event = any(s.events));

  return v_event_id;
end;
$$;


-- Stock trigger — fires low_stock + out_of_stock events when quantity
-- crosses the threshold. Only fires on actual crossings (not on every
-- update) by comparing OLD vs NEW.
create or replace function inv_stock_threshold_publish()
returns trigger language plpgsql security definer as $$
declare
  v_threshold int;
  v_old_qty   int := coalesce(old.quantity, 0);
  v_new_qty   int := coalesce(new.quantity, 0);
begin
  -- Only consider downward crossings — going UP through the threshold
  -- (receive/return) isn't an "alert"-worthy event.
  if v_new_qty >= v_old_qty then
    return new;
  end if;

  select low_stock_threshold into v_threshold
    from inv_products
   where id = new.product_id;
  v_threshold := coalesce(v_threshold, 5);

  -- Out of stock: just crossed zero
  if v_old_qty > 0 and v_new_qty <= 0 then
    perform inv_publish_event(
      new.org_id,
      'stock.out_of_stock',
      jsonb_build_object(
        'product_id',         new.product_id,
        'variant_id',         new.variant_id,
        'location_id',        new.location_id,
        'quantity',           v_new_qty,
        'reserved',           new.reserved,
        'low_stock_threshold', v_threshold
      ),
      'stock_trigger'
    );
  -- Low stock: crossed the threshold but still above zero
  elsif v_old_qty > v_threshold and v_new_qty <= v_threshold and v_new_qty > 0 then
    perform inv_publish_event(
      new.org_id,
      'stock.low_stock',
      jsonb_build_object(
        'product_id',         new.product_id,
        'variant_id',         new.variant_id,
        'location_id',        new.location_id,
        'quantity',           v_new_qty,
        'reserved',           new.reserved,
        'low_stock_threshold', v_threshold
      ),
      'stock_trigger'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists inv_stock_threshold_publish_trg on inv_stock;
create trigger inv_stock_threshold_publish_trg
  after update of quantity on inv_stock
  for each row
  when (old.quantity is distinct from new.quantity)
  execute procedure inv_stock_threshold_publish();


-- Compute the next attempt time after a failure. Exponential backoff:
-- attempt 1 → 1 min, 2 → 5 min, 3 → 15 min, 4 → 60 min, 5 → 240 min.
-- After 5 failures, caller flips status to 'exhausted' instead.
create or replace function inv_webhook_backoff(p_attempt int)
returns interval language sql immutable as $$
  select case
    when p_attempt <= 1 then interval '1 minute'
    when p_attempt = 2  then interval '5 minutes'
    when p_attempt = 3  then interval '15 minutes'
    when p_attempt = 4  then interval '1 hour'
    else                     interval '4 hours'
  end;
$$;
