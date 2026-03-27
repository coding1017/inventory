-- ═══════════════════════════════════════════════════════════
--  Inventory Management System — Supabase Schema
--  Run in Supabase SQL Editor (Dashboard → SQL Editor)
--  All tables prefixed inv_ to avoid collision with existing Webnari tables
-- ═══════════════════════════════════════════════════════════

-- ── Categories ──────────────────────────────────────────────
create table if not exists inv_categories (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  name        text not null,
  slug        text not null,
  parent_id   uuid references inv_categories(id) on delete set null,
  sort_order  int default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(org_id, slug)
);

-- ── Suppliers ───────────────────────────────────────────────
create table if not exists inv_suppliers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  name        text not null,
  contact     text,
  email       text,
  phone       text,
  address     text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── Locations (warehouses, stores, bins) ────────────────────
create table if not exists inv_locations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  name        text not null,
  type        text not null check (type in ('warehouse', 'store', 'bin', 'virtual')),
  address     text,
  is_default  boolean default false,
  created_at  timestamptz default now(),
  unique(org_id, name)
);

-- ── Products ────────────────────────────────────────────────
create table if not exists inv_products (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  sku           text not null,
  name          text not null,
  description   text,
  category_id   uuid references inv_categories(id) on delete set null,
  supplier_id   uuid references inv_suppliers(id) on delete set null,
  barcode       text,
  barcode_type  text check (barcode_type in ('ean13', 'upc', 'code128', 'qr', 'custom')),
  unit          text default 'each',
  cost_price    numeric(12,2),
  sell_price    numeric(12,2),
  images        text[] default '{}',
  tags          text[] default '{}',
  status        text default 'active' check (status in ('active', 'draft', 'archived')),
  low_stock_threshold int default 5,
  metadata      jsonb default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(org_id, sku)
);

-- Partial unique index: barcode unique within org when not null
create unique index if not exists inv_products_barcode_unique
  on inv_products (org_id, barcode) where barcode is not null;

-- ── Product Variants ────────────────────────────────────────
create table if not exists inv_product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references inv_products(id) on delete cascade,
  org_id      uuid not null,
  sku         text not null,
  name        text not null,
  barcode     text,
  attributes  jsonb default '{}',
  cost_price  numeric(12,2),
  sell_price  numeric(12,2),
  images      text[] default '{}',
  status      text default 'active' check (status in ('active', 'archived')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(org_id, sku)
);

-- ── Inventory Stock (materialized current state) ────────────
create table if not exists inv_stock (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  product_id  uuid not null references inv_products(id) on delete cascade,
  variant_id  uuid references inv_product_variants(id) on delete cascade,
  location_id uuid not null references inv_locations(id) on delete cascade,
  quantity    int not null default 0,
  reserved    int not null default 0,
  updated_at  timestamptz default now()
);

-- Unique index: one stock row per product+variant+location (treats NULL variant as equal)
create unique index if not exists inv_stock_unique_combo
  on inv_stock (product_id, location_id) where variant_id is null;
create unique index if not exists inv_stock_unique_combo_variant
  on inv_stock (product_id, variant_id, location_id) where variant_id is not null;

create index if not exists inv_stock_org_product on inv_stock(org_id, product_id);

-- ── Inventory Movements (append-only audit log) ─────────────
create table if not exists inv_movements (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  product_id    uuid not null references inv_products(id),
  variant_id    uuid references inv_product_variants(id),
  location_id   uuid not null references inv_locations(id),
  type          text not null check (type in (
    'receive', 'sale', 'adjustment', 'transfer_in', 'transfer_out',
    'return', 'damaged', 'reserved', 'unreserved'
  )),
  quantity      int not null,
  reference     text,
  notes         text,
  performed_by  uuid,
  api_key_id    uuid,
  created_at    timestamptz default now()
);

create index if not exists inv_movements_product on inv_movements(org_id, product_id, created_at desc);
create index if not exists inv_movements_created on inv_movements(org_id, created_at desc);

-- ── API Keys ────────────────────────────────────────────────
create table if not exists inv_api_keys (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  name        text not null,
  key_hash    text not null,
  key_prefix  text not null,
  permissions text[] default '{read}',
  rate_limit  int default 100,
  last_used   timestamptz,
  expires_at  timestamptz,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

create index if not exists inv_api_keys_prefix on inv_api_keys(key_prefix) where is_active = true;


-- ═══════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════

alter table inv_categories enable row level security;
create policy "org_isolation" on inv_categories for all using (org_id = auth.uid());

alter table inv_suppliers enable row level security;
create policy "org_isolation" on inv_suppliers for all using (org_id = auth.uid());

alter table inv_locations enable row level security;
create policy "org_isolation" on inv_locations for all using (org_id = auth.uid());

alter table inv_products enable row level security;
create policy "org_isolation" on inv_products for all using (org_id = auth.uid());

alter table inv_product_variants enable row level security;
create policy "org_isolation" on inv_product_variants for all using (org_id = auth.uid());

alter table inv_stock enable row level security;
create policy "org_isolation" on inv_stock for all using (org_id = auth.uid());

alter table inv_movements enable row level security;
create policy "org_isolation" on inv_movements for all using (org_id = auth.uid());

alter table inv_api_keys enable row level security;
create policy "org_isolation" on inv_api_keys for all using (org_id = auth.uid());


-- ═══════════════════════════════════════════════════════════
--  FUNCTIONS
-- ═══════════════════════════════════════════════════════════

-- Atomic stock adjustment: updates inv_stock + inserts inv_movements in one transaction
create or replace function inv_adjust_stock(
  p_org_id      uuid,
  p_product_id  uuid,
  p_variant_id  uuid,
  p_location_id uuid,
  p_type        text,
  p_quantity    int,
  p_reference   text default null,
  p_notes       text default null,
  p_performed_by uuid default null,
  p_api_key_id  uuid default null
) returns uuid language plpgsql security definer as $$
declare
  v_movement_id uuid;
  v_stock_id uuid;
  v_current_qty int;
begin
  -- Find existing stock row
  if p_variant_id is null then
    select id, quantity into v_stock_id, v_current_qty
    from inv_stock
    where product_id = p_product_id
      and variant_id is null
      and location_id = p_location_id;
  else
    select id, quantity into v_stock_id, v_current_qty
    from inv_stock
    where product_id = p_product_id
      and variant_id = p_variant_id
      and location_id = p_location_id;
  end if;

  -- Check stock for outgoing types
  if p_type in ('sale', 'transfer_out', 'damaged', 'reserved') then
    if coalesce(v_current_qty, 0) + p_quantity < 0 then
      raise exception 'insufficient_stock: current=%, requested=%', coalesce(v_current_qty, 0), p_quantity;
    end if;
  end if;

  -- Upsert stock row
  if v_stock_id is not null then
    update inv_stock set
      quantity = inv_stock.quantity + p_quantity,
      updated_at = now()
    where id = v_stock_id;
  else
    insert into inv_stock (org_id, product_id, variant_id, location_id, quantity)
    values (p_org_id, p_product_id, p_variant_id, p_location_id, p_quantity);
  end if;

  -- Insert movement record
  insert into inv_movements (org_id, product_id, variant_id, location_id, type, quantity, reference, notes, performed_by, api_key_id)
  values (p_org_id, p_product_id, p_variant_id, p_location_id, p_type, p_quantity, p_reference, p_notes, p_performed_by, p_api_key_id)
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

-- Reuse existing touch_updated_at() from Webnari schema if it exists
-- Otherwise create it:
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger touch_inv_products before update on inv_products
  for each row execute procedure touch_updated_at();
create trigger touch_inv_variants before update on inv_product_variants
  for each row execute procedure touch_updated_at();
create trigger touch_inv_categories before update on inv_categories
  for each row execute procedure touch_updated_at();
create trigger touch_inv_suppliers before update on inv_suppliers
  for each row execute procedure touch_updated_at();


-- ═══════════════════════════════════════════════════════════
--  STORAGE BUCKET
-- ═══════════════════════════════════════════════════════════
-- Run separately in Supabase Dashboard → Storage:
-- Create bucket: product-images (public)
-- Policy: authenticated users can upload to their org folder
