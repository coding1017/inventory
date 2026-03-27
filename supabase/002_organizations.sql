-- ═══════════════════════════════════════════════════════════
--  Organizations & Team Members
--  Run in Supabase SQL Editor AFTER the initial schema
-- ═══════════════════════════════════════════════════════════

-- ── Organizations ───────────────────────────────────────────
create table if not exists inv_organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  owner_id    uuid not null,  -- the user who created this org
  logo_url    text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create trigger touch_inv_organizations before update on inv_organizations
  for each row execute procedure touch_updated_at();

-- ── Organization Members ────────────────────────────────────
create table if not exists inv_org_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references inv_organizations(id) on delete cascade,
  user_id     uuid not null,
  role        text not null default 'member' check (role in ('owner', 'admin', 'member')),
  invited_by  uuid,
  invited_at  timestamptz default now(),
  joined_at   timestamptz,  -- null until they accept
  status      text not null default 'active' check (status in ('active', 'pending', 'removed')),
  created_at  timestamptz default now(),
  unique(org_id, user_id)
);

create index inv_org_members_user on inv_org_members(user_id) where status = 'active';
create index inv_org_members_org on inv_org_members(org_id) where status = 'active';

-- ── Pending Invites (by email, before user creates account) ─
create table if not exists inv_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references inv_organizations(id) on delete cascade,
  email       text not null,
  role        text not null default 'member' check (role in ('admin', 'member')),
  invited_by  uuid not null,
  token       text not null unique,  -- random token for invite link
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at  timestamptz default now(),
  unique(org_id, email)
);

-- ═══════════════════════════════════════════════════════════
--  RLS
-- ═══════════════════════════════════════════════════════════

alter table inv_organizations enable row level security;

-- Users can see orgs they belong to
create policy "members_can_view_org" on inv_organizations
  for select using (
    id in (select org_id from inv_org_members where user_id = auth.uid() and status = 'active')
  );

-- Only owners can update their org
create policy "owner_can_update_org" on inv_organizations
  for update using (owner_id = auth.uid());

-- Any authenticated user can create an org
create policy "anyone_can_create_org" on inv_organizations
  for insert with check (auth.uid() = owner_id);

alter table inv_org_members enable row level security;

-- Members can see other members of their org
create policy "members_can_view_members" on inv_org_members
  for select using (
    org_id in (select org_id from inv_org_members m where m.user_id = auth.uid() and m.status = 'active')
  );

-- Owners and admins can manage members
create policy "admins_can_manage_members" on inv_org_members
  for all using (
    org_id in (
      select org_id from inv_org_members m
      where m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin')
    )
  );

alter table inv_invites enable row level security;

create policy "admins_can_manage_invites" on inv_invites
  for all using (
    org_id in (
      select org_id from inv_org_members m
      where m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin')
    )
  );


-- ═══════════════════════════════════════════════════════════
--  UPDATE EXISTING RLS POLICIES
--  Change org_id check from auth.uid() to org membership
-- ═══════════════════════════════════════════════════════════

-- Drop old simple policies
drop policy if exists "org_isolation" on inv_categories;
drop policy if exists "org_isolation" on inv_suppliers;
drop policy if exists "org_isolation" on inv_locations;
drop policy if exists "org_isolation" on inv_products;
drop policy if exists "org_isolation" on inv_product_variants;
drop policy if exists "org_isolation" on inv_stock;
drop policy if exists "org_isolation" on inv_movements;
drop policy if exists "org_isolation" on inv_api_keys;

-- Create new policies that check org membership
create policy "org_member_access" on inv_categories for all using (
  org_id in (select org_id from inv_org_members where user_id = auth.uid() and status = 'active')
);
create policy "org_member_access" on inv_suppliers for all using (
  org_id in (select org_id from inv_org_members where user_id = auth.uid() and status = 'active')
);
create policy "org_member_access" on inv_locations for all using (
  org_id in (select org_id from inv_org_members where user_id = auth.uid() and status = 'active')
);
create policy "org_member_access" on inv_products for all using (
  org_id in (select org_id from inv_org_members where user_id = auth.uid() and status = 'active')
);
create policy "org_member_access" on inv_product_variants for all using (
  org_id in (select org_id from inv_org_members where user_id = auth.uid() and status = 'active')
);
create policy "org_member_access" on inv_stock for all using (
  org_id in (select org_id from inv_org_members where user_id = auth.uid() and status = 'active')
);
create policy "org_member_access" on inv_movements for all using (
  org_id in (select org_id from inv_org_members where user_id = auth.uid() and status = 'active')
);
create policy "org_member_access" on inv_api_keys for all using (
  org_id in (select org_id from inv_org_members where user_id = auth.uid() and status = 'active')
);
