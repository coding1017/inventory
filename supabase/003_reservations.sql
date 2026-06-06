-- ═══════════════════════════════════════════════════════════
--  External-CRM reservations + rate-limiting
--  Run in Supabase SQL Editor AFTER 002_organizations.sql
--
--  This migration is purely additive:
--    - adds inv_reservations (new table)
--    - adds inv_api_key_usage (new table — 1-min sliding-window
--      rate limit counter)
--    - adds 4 wrapper functions that internally call the existing
--      inv_adjust_stock() — they DO NOT bypass it.
--
--  Semantic model (single source of truth — also documented in
--  INTEGRATION-EXTERNAL-CRM.md):
--    - "reserve N":  inv_stock.quantity  -= N
--                    inv_stock.reserved  += N
--                    movement: type='reserved', quantity=-N
--    - "commit":     inv_stock.quantity  unchanged (already dropped)
--                    inv_stock.reserved  -= N
--                    movement 1: type='unreserved', quantity=+N
--                    movement 2: type='sale',       quantity=-N
--                    (net stock change = 0; sale row exists for COGS)
--    - "release":    inv_stock.quantity  += N
--                    inv_stock.reserved  -= N
--                    movement: type='unreserved', quantity=+N
--
--  "Available to reserve" from a consumer's perspective:
--      = inv_stock.quantity
--    (because reservations have already deducted from quantity).
--  "Physical on hand" for human display:
--      = inv_stock.quantity + inv_stock.reserved
-- ═══════════════════════════════════════════════════════════

-- ── Reservations ────────────────────────────────────────────
create table if not exists inv_reservations (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null,
  product_id               uuid not null references inv_products(id) on delete restrict,
  variant_id               uuid references inv_product_variants(id) on delete restrict,
  location_id              uuid not null references inv_locations(id) on delete restrict,
  quantity                 int not null check (quantity > 0),
  status                   text not null default 'active'
                             check (status in ('active', 'committed', 'released', 'expired')),
  reference                text,                       -- consumer's quote_id / job_id / etc
  idempotency_key          text,                       -- consumer-supplied, unique per org
  notes                    text,
  reserve_movement_id      uuid references inv_movements(id),
  commit_unreserve_movement_id uuid references inv_movements(id),
  commit_sale_movement_id  uuid references inv_movements(id),
  release_movement_id      uuid references inv_movements(id),
  expires_at               timestamptz,                -- optional auto-release deadline
  api_key_id               uuid,
  performed_by             uuid,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now(),
  committed_at             timestamptz,
  released_at              timestamptz
);

create unique index if not exists inv_reservations_idem
  on inv_reservations (org_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists inv_reservations_org_status
  on inv_reservations (org_id, status);

create index if not exists inv_reservations_reference
  on inv_reservations (org_id, reference)
  where reference is not null;

create index if not exists inv_reservations_expires
  on inv_reservations (expires_at)
  where status = 'active' and expires_at is not null;

create trigger touch_inv_reservations before update on inv_reservations
  for each row execute procedure touch_updated_at();

alter table inv_reservations enable row level security;

create policy "org_member_access" on inv_reservations for all using (
  org_id in (select org_id from inv_org_members where user_id = auth.uid() and status = 'active')
);


-- ── API-key usage counter (1-minute sliding window) ─────────
create table if not exists inv_api_key_usage (
  key_id        uuid not null,
  window_start  timestamptz not null,
  count         int not null default 1,
  primary key (key_id, window_start)
);

create index if not exists inv_api_key_usage_recent
  on inv_api_key_usage (key_id, window_start desc);

alter table inv_api_key_usage enable row level security;
-- No public policy: writes happen via security-definer function below;
-- direct reads/writes from app users are not granted.


-- ═══════════════════════════════════════════════════════════
--  FUNCTIONS — security definer wrappers around inv_adjust_stock
-- ═══════════════════════════════════════════════════════════

-- Atomic reserve: drop quantity, raise reserved, insert reservation row.
-- Returns the new reservation id.
create or replace function inv_reserve_stock(
  p_org_id          uuid,
  p_product_id      uuid,
  p_variant_id      uuid,
  p_location_id     uuid,
  p_quantity        int,
  p_reference       text default null,
  p_idempotency_key text default null,
  p_expires_at      timestamptz default null,
  p_notes           text default null,
  p_performed_by    uuid default null,
  p_api_key_id      uuid default null
) returns uuid language plpgsql security definer as $$
declare
  v_existing_id uuid;
  v_reservation_id uuid;
  v_movement_id uuid;
begin
  if p_quantity <= 0 then
    raise exception 'invalid_quantity: must be positive';
  end if;

  -- Idempotency short-circuit
  if p_idempotency_key is not null then
    select id into v_existing_id
    from inv_reservations
    where org_id = p_org_id
      and idempotency_key = p_idempotency_key;
    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  -- Insert reservation shell (status active, no movement id yet)
  insert into inv_reservations (
    org_id, product_id, variant_id, location_id, quantity,
    reference, idempotency_key, notes, expires_at,
    api_key_id, performed_by
  ) values (
    p_org_id, p_product_id, p_variant_id, p_location_id, p_quantity,
    p_reference, p_idempotency_key, p_notes, p_expires_at,
    p_api_key_id, p_performed_by
  ) returning id into v_reservation_id;

  -- Atomic stock decrement via existing function. Raises insufficient_stock
  -- if not enough on hand; the entire transaction (including the insert
  -- above) is rolled back automatically by plpgsql in that case.
  v_movement_id := inv_adjust_stock(
    p_org_id, p_product_id, p_variant_id, p_location_id,
    'reserved', -p_quantity,
    'reservation:' || v_reservation_id::text,
    p_notes, p_performed_by, p_api_key_id
  );

  -- Bump the soft-reserved bucket for human-readable "X reserved" display.
  update inv_stock
     set reserved = reserved + p_quantity,
         updated_at = now()
   where product_id = p_product_id
     and location_id = p_location_id
     and (
       (variant_id is null and p_variant_id is null)
       or variant_id = p_variant_id
     );

  -- Link reservation to its reserve movement
  update inv_reservations
     set reserve_movement_id = v_movement_id,
         updated_at = now()
   where id = v_reservation_id;

  return v_reservation_id;
end;
$$;


-- Commit a reservation: convert it to a real sale.
-- Idempotent: calling on an already-committed reservation is a no-op
-- that returns the existing reservation id.
create or replace function inv_commit_reservation(
  p_reservation_id  uuid,
  p_org_id          uuid,
  p_reference       text default null,
  p_notes           text default null,
  p_performed_by    uuid default null,
  p_api_key_id      uuid default null
) returns uuid language plpgsql security definer as $$
declare
  v_status       text;
  v_qty          int;
  v_product_id   uuid;
  v_variant_id   uuid;
  v_location_id  uuid;
  v_unres_id     uuid;
  v_sale_id      uuid;
begin
  -- Lock the reservation row to prevent commit/release races
  select status, quantity, product_id, variant_id, location_id
    into v_status, v_qty, v_product_id, v_variant_id, v_location_id
  from inv_reservations
  where id = p_reservation_id and org_id = p_org_id
  for update;

  if not found then
    raise exception 'reservation_not_found';
  end if;

  if v_status = 'committed' then
    return p_reservation_id;  -- idempotent
  end if;

  if v_status <> 'active' then
    raise exception 'reservation_not_active: status=%', v_status;
  end if;

  -- Movement 1: undo the reserved hold so the audit trail is clean.
  -- This restores quantity (still net-zero overall once sale fires below).
  v_unres_id := inv_adjust_stock(
    p_org_id, v_product_id, v_variant_id, v_location_id,
    'unreserved', v_qty,
    'reservation:' || p_reservation_id::text,
    p_notes, p_performed_by, p_api_key_id
  );

  -- Movement 2: real sale, drops quantity back. Net stock change = 0.
  v_sale_id := inv_adjust_stock(
    p_org_id, v_product_id, v_variant_id, v_location_id,
    'sale', -v_qty,
    coalesce(p_reference, 'reservation:' || p_reservation_id::text),
    p_notes, p_performed_by, p_api_key_id
  );

  -- Decrement the soft-reserved bucket. Quantity already net-zero.
  update inv_stock
     set reserved = greatest(0, reserved - v_qty),
         updated_at = now()
   where product_id = v_product_id
     and location_id = v_location_id
     and (
       (variant_id is null and v_variant_id is null)
       or variant_id = v_variant_id
     );

  update inv_reservations
     set status = 'committed',
         committed_at = now(),
         commit_unreserve_movement_id = v_unres_id,
         commit_sale_movement_id = v_sale_id,
         updated_at = now()
   where id = p_reservation_id;

  return p_reservation_id;
end;
$$;


-- Release a reservation: restore quantity, do NOT record a sale.
-- Idempotent on already-released reservations.
create or replace function inv_release_reservation(
  p_reservation_id  uuid,
  p_org_id          uuid,
  p_notes           text default null,
  p_performed_by    uuid default null,
  p_api_key_id      uuid default null
) returns uuid language plpgsql security definer as $$
declare
  v_status       text;
  v_qty          int;
  v_product_id   uuid;
  v_variant_id   uuid;
  v_location_id  uuid;
  v_movement_id  uuid;
begin
  select status, quantity, product_id, variant_id, location_id
    into v_status, v_qty, v_product_id, v_variant_id, v_location_id
  from inv_reservations
  where id = p_reservation_id and org_id = p_org_id
  for update;

  if not found then
    raise exception 'reservation_not_found';
  end if;

  if v_status = 'released' or v_status = 'expired' then
    return p_reservation_id;  -- idempotent
  end if;

  if v_status <> 'active' then
    raise exception 'reservation_not_active: status=%', v_status;
  end if;

  v_movement_id := inv_adjust_stock(
    p_org_id, v_product_id, v_variant_id, v_location_id,
    'unreserved', v_qty,
    'reservation:' || p_reservation_id::text,
    p_notes, p_performed_by, p_api_key_id
  );

  update inv_stock
     set reserved = greatest(0, reserved - v_qty),
         updated_at = now()
   where product_id = v_product_id
     and location_id = v_location_id
     and (
       (variant_id is null and v_variant_id is null)
       or variant_id = v_variant_id
     );

  update inv_reservations
     set status = 'released',
         released_at = now(),
         release_movement_id = v_movement_id,
         updated_at = now()
   where id = p_reservation_id;

  return p_reservation_id;
end;
$$;


-- 1-minute sliding-window rate-limit check.
-- Returns true if the request is within budget; false if it should be
-- rejected. Increments the counter only on the "true" path so a denied
-- request doesn't push the bucket further over the limit (avoids
-- starvation under sustained over-limit traffic — denied requests are
-- effectively free).
create or replace function inv_check_rate_limit(
  p_key_id uuid,
  p_limit  int
) returns boolean language plpgsql security definer as $$
declare
  v_minute timestamptz := date_trunc('minute', now());
  v_count int;
begin
  if p_limit is null or p_limit <= 0 then
    return true;
  end if;

  -- Peek current count without incrementing
  select count into v_count
  from inv_api_key_usage
  where key_id = p_key_id and window_start = v_minute;

  if coalesce(v_count, 0) >= p_limit then
    return false;
  end if;

  -- Within budget — count this request
  insert into inv_api_key_usage (key_id, window_start, count)
  values (p_key_id, v_minute, 1)
  on conflict (key_id, window_start)
  do update set count = inv_api_key_usage.count + 1;

  -- Best-effort cleanup of windows older than 5 minutes (cheap, runs
  -- inside this txn). Real housekeeping should be a scheduled job.
  delete from inv_api_key_usage
  where window_start < (now() - interval '5 minutes');

  return true;
end;
$$;
