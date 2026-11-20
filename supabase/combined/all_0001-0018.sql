-- TwoPlus combined migrations: 0001_init.sql 0002_platform_admin.sql 0003_workspace_theme.sql 0004_reminders_and_roster.sql 0005_member_photos.sql 0006_member_crm.sql 0007_member_accounts.sql 0008_workspace_media.sql 0009_member_plan_read.sql 0010_remove_workspace.sql 0011_harden_member_claim.sql 0012_workout_logging.sql 0013_member_class_booking.sql 0014_progress_photo_storage.sql 0015_member_measurements.sql 0016_account_deletion.sql 0017_rls_member_fixes.sql 0018_retry_safe_writes.sql
-- Generated 2026-11-19 from supabase/migrations/. Do not edit; regenerate.
-- EMPTY/NEW PROJECT ONLY (e.g. staging). Do NOT run on the live database: 0001 creates tables without "if not exists" and will fail.

-- ======================================================================
-- 0001_init.sql
-- ======================================================================
-- TwoPlus.fit — 0001_init
-- Multi-tenant foundation: organizations, branches, members, memberships,
-- payments, attendance, enquiries, staff, classes, expenses, notifications.
-- Money is stored in integer minor units (paise). Timestamps are timestamptz.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete restrict,
  name        text not null check (char_length(trim(name)) between 2 and 120),
  phone       text,
  address     text,
  timezone    text not null default 'Asia/Kolkata',
  currency    text not null default 'INR',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('owner','manager','trainer','receptionist','finance')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create table public.branches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  address         text,
  is_primary      boolean not null default false,
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now()
);
create index branches_org_idx on public.branches (organization_id);

create table public.staff (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  branch_id         uuid references public.branches(id) on delete set null,
  user_id           uuid references auth.users(id) on delete set null,
  name              text not null,
  phone             text not null,
  email             text,
  job_role          text not null default 'Trainer',
  employment_status text not null default 'active' check (employment_status in ('active','inactive')),
  joined_on         date not null default current_date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index staff_org_idx on public.staff (organization_id);

create table public.membership_plans (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  name                text not null,
  description         text,
  duration_days       integer not null check (duration_days > 0),
  price_minor         integer not null check (price_minor >= 0),
  joining_fee_minor   integer not null default 0 check (joining_fee_minor >= 0),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, name)
);
create index membership_plans_org_idx on public.membership_plans (organization_id);

create table public.members (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  member_code             text not null,
  first_name              text not null,
  last_name               text not null default '',
  email                   text,
  phone                   text not null,
  date_of_birth           date,
  gender                  text check (gender in ('male','female','other')),
  address                 text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  trainer_id              uuid references public.staff(id) on delete set null,
  status                  text not null default 'active' check (status in ('active','suspended','archived')),
  notes                   text,
  joined_on               date not null default current_date,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (organization_id, member_code)
);
create index members_org_status_idx on public.members (organization_id, status);
create index members_org_name_idx on public.members (organization_id, lower(first_name || ' ' || last_name));
create index members_org_phone_idx on public.members (organization_id, phone);

create table public.member_memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  plan_id         uuid references public.membership_plans(id) on delete set null,
  plan_name       text not null,
  status          text not null default 'active' check (status in ('scheduled','active','expired','frozen','cancelled')),
  start_date      date not null,
  end_date        date not null,
  price_minor     integer not null check (price_minor >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date >= start_date)
);
create index member_memberships_org_idx on public.member_memberships (organization_id, status);
create index member_memberships_member_idx on public.member_memberships (member_id);
create index member_memberships_expiry_idx on public.member_memberships (organization_id, end_date);

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  membership_id   uuid references public.member_memberships(id) on delete set null,
  amount_minor    integer not null check (amount_minor > 0),
  currency        text not null default 'INR',
  method          text not null default 'cash' check (method in ('cash','upi','card','bank_transfer','other')),
  status          text not null default 'paid' check (status in ('paid','pending','failed','refunded')),
  paid_on         date not null default current_date,
  description     text,
  recorded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index payments_org_date_idx on public.payments (organization_id, paid_on);
create index payments_org_status_idx on public.payments (organization_id, status);
create index payments_member_idx on public.payments (member_id);

create table public.attendance (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  member_id       uuid not null references public.members(id) on delete cascade,
  check_in        timestamptz not null default now(),
  check_out       timestamptz,
  method          text not null default 'manual' check (method in ('manual','self','turnstile','other')),
  created_at      timestamptz not null default now(),
  check (check_out is null or check_out >= check_in)
);
create index attendance_org_date_idx on public.attendance (organization_id, check_in);
create index attendance_member_idx on public.attendance (member_id);
-- One open check-in per member at a time (duplicate check-in prevention)
create unique index attendance_open_checkin_idx on public.attendance (member_id) where check_out is null;

create table public.enquiries (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  name                text not null,
  phone               text not null,
  email               text,
  interest            text,
  source              text not null default 'walk_in' check (source in ('walk_in','referral','social','website','phone','other')),
  status              text not null default 'new' check (status in ('new','contacted','follow_up','converted','lost')),
  follow_up_date      date,
  notes               text,
  converted_member_id uuid references public.members(id) on delete set null,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index enquiries_org_status_idx on public.enquiries (organization_id, status);
create index enquiries_org_followup_idx on public.enquiries (organization_id, follow_up_date);

create table public.classes (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  branch_id         uuid references public.branches(id) on delete set null,
  name              text not null,
  trainer_id        uuid references public.staff(id) on delete set null,
  starts_at         timestamptz not null,
  duration_minutes  integer not null default 60 check (duration_minutes > 0),
  capacity          integer not null check (capacity > 0),
  status            text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index classes_org_start_idx on public.classes (organization_id, starts_at);

create table public.class_bookings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  class_id        uuid not null references public.classes(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  status          text not null default 'booked' check (status in ('booked','cancelled','attended')),
  created_at      timestamptz not null default now(),
  unique (class_id, member_id)
);
create index class_bookings_org_idx on public.class_bookings (organization_id);
create index class_bookings_member_idx on public.class_bookings (member_id);

create table public.expenses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  category        text not null,
  description     text,
  amount_minor    integer not null check (amount_minor > 0),
  expense_date    date not null default current_date,
  recorded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index expenses_org_date_idx on public.expenses (organization_id, expense_date);

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null,
  body            text,
  type            text not null default 'info' check (type in ('info','warning','success','task')),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read_at);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger staff_updated_at before update on public.staff
  for each row execute function public.set_updated_at();
create trigger membership_plans_updated_at before update on public.membership_plans
  for each row execute function public.set_updated_at();
create trigger members_updated_at before update on public.members
  for each row execute function public.set_updated_at();
create trigger member_memberships_updated_at before update on public.member_memberships
  for each row execute function public.set_updated_at();
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create trigger enquiries_updated_at before update on public.enquiries
  for each row execute function public.set_updated_at();
create trigger classes_updated_at before update on public.classes
  for each row execute function public.set_updated_at();
create trigger expenses_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Signup: create a profile row for every new auth user
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Onboarding RPC: retry-safe, duplicate-proof organization creation.
-- The role 'owner' is granted here, server-side, based on auth.uid() — never
-- taken from client input.
-- ---------------------------------------------------------------------------

create or replace function public.create_organization(
  p_name text,
  p_phone text default null,
  p_address text default null,
  p_timezone text default 'Asia/Kolkata',
  p_branch_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Gym name must be at least 2 characters';
  end if;

  -- Resume interrupted onboarding: return the org this user already owns.
  select id into v_org from public.organizations where owner_id = v_uid limit 1;
  if v_org is not null then
    return v_org;
  end if;

  insert into public.organizations (owner_id, name, phone, address, timezone)
  values (v_uid, trim(p_name), p_phone, p_address, coalesce(p_timezone, 'Asia/Kolkata'))
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_uid, 'owner');

  insert into public.branches (organization_id, name, is_primary)
  values (
    v_org,
    case when p_branch_name is not null and length(trim(p_branch_name)) > 0
         then trim(p_branch_name)
         else 'Main branch' end,
    true
  );

  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so RLS policies can check membership without
-- recursing into organization_members' own policies). Defined after the
-- tables because SQL function bodies are validated at creation time.
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

create or replace function public.org_role(org uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select m.role from public.organization_members m
  where m.organization_id = org and m.user_id = auth.uid();
$$;

create or replace function public.org_has_role(org uuid, variadic roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.role = any(roles)
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.branches enable row level security;
alter table public.staff enable row level security;
alter table public.membership_plans enable row level security;
alter table public.members enable row level security;
alter table public.member_memberships enable row level security;
alter table public.payments enable row level security;
alter table public.attendance enable row level security;
alter table public.enquiries enable row level security;
alter table public.classes enable row level security;
alter table public.class_bookings enable row level security;
alter table public.expenses enable row level security;
alter table public.notifications enable row level security;

-- profiles: users manage their own row
create policy "profiles read own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- organizations: members read; owner created via RPC only (no client insert policy)
create policy "org read member" on public.organizations
  for select using (public.is_org_member(id));
create policy "org update owner" on public.organizations
  for update using (public.org_has_role(id, 'owner'))
  with check (public.org_has_role(id, 'owner'));

-- organization_members: self + owner/manager visibility; joining/role grants
-- happen only through the RPC or owner invitation flows
create policy "orgmember read" on public.organization_members
  for select using (
    user_id = auth.uid()
    or public.org_has_role(organization_id, 'owner', 'manager')
  );
create policy "orgmember insert self owner" on public.organization_members
  for insert with check (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1 from public.organizations o
      where o.id = organization_id and o.owner_id = auth.uid()
    )
  );
create policy "orgmember update owner" on public.organization_members
  for update using (public.org_has_role(organization_id, 'owner'))
  with check (public.org_has_role(organization_id, 'owner'));
create policy "orgmember leave" on public.organization_members
  for delete using (
    user_id = auth.uid()
    or public.org_has_role(organization_id, 'owner')
  );

-- branches
create policy "branch read" on public.branches
  for select using (public.is_org_member(organization_id));
create policy "branch write owner manager" on public.branches
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager'));
create policy "branch update owner manager" on public.branches
  for update using (public.org_has_role(organization_id, 'owner', 'manager'))
  with check (public.org_has_role(organization_id, 'owner', 'manager'));

-- staff
create policy "staff read" on public.staff
  for select using (public.is_org_member(organization_id));
create policy "staff write owner manager" on public.staff
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager'));
create policy "staff update owner manager" on public.staff
  for update using (public.org_has_role(organization_id, 'owner', 'manager'))
  with check (public.org_has_role(organization_id, 'owner', 'manager'));
create policy "staff delete owner" on public.staff
  for delete using (public.org_has_role(organization_id, 'owner'));

-- membership_plans
create policy "plans read" on public.membership_plans
  for select using (public.is_org_member(organization_id));
create policy "plans write owner manager" on public.membership_plans
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager'));
create policy "plans update owner manager" on public.membership_plans
  for update using (public.org_has_role(organization_id, 'owner', 'manager'))
  with check (public.org_has_role(organization_id, 'owner', 'manager'));

-- members
create policy "members read" on public.members
  for select using (public.is_org_member(organization_id));
create policy "members write" on public.members
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist'));
create policy "members update" on public.members
  for update using (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist'))
  with check (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist'));

-- member_memberships
create policy "memberships read" on public.member_memberships
  for select using (public.is_org_member(organization_id));
create policy "memberships write" on public.member_memberships
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist'));
create policy "memberships update" on public.member_memberships
  for update using (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist'))
  with check (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist'));

-- payments: finance role also writes
create policy "payments read" on public.payments
  for select using (public.is_org_member(organization_id));
create policy "payments write" on public.payments
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist', 'finance'));
create policy "payments update" on public.payments
  for update using (public.org_has_role(organization_id, 'owner', 'manager', 'finance'))
  with check (public.org_has_role(organization_id, 'owner', 'manager', 'finance'));

-- attendance
create policy "attendance read" on public.attendance
  for select using (public.is_org_member(organization_id));
create policy "attendance write" on public.attendance
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist', 'trainer'));
create policy "attendance update" on public.attendance
  for update using (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist'))
  with check (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist'));

-- enquiries
create policy "enquiries read" on public.enquiries
  for select using (public.is_org_member(organization_id));
create policy "enquiries write" on public.enquiries
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist'));
create policy "enquiries update" on public.enquiries
  for update using (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist'))
  with check (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist'));

-- classes & bookings
create policy "classes read" on public.classes
  for select using (public.is_org_member(organization_id));
create policy "classes write" on public.classes
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'));
create policy "classes update" on public.classes
  for update using (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'))
  with check (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'));
create policy "bookings read" on public.class_bookings
  for select using (public.is_org_member(organization_id));
create policy "bookings write" on public.class_bookings
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist', 'trainer'));
create policy "bookings update" on public.class_bookings
  for update using (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist', 'trainer'))
  with check (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist', 'trainer'));

-- expenses
create policy "expenses read" on public.expenses
  for select using (public.is_org_member(organization_id));
create policy "expenses write" on public.expenses
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager', 'finance'));
create policy "expenses update" on public.expenses
  for update using (public.org_has_role(organization_id, 'owner', 'manager', 'finance'))
  with check (public.org_has_role(organization_id, 'owner', 'manager', 'finance'));

-- notifications: own rows only
create policy "notifications read own" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications update own" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ======================================================================
-- 0002_platform_admin.sql
-- ======================================================================
-- TwoPlus.fit — 0002_platform_admin
-- Platform (Super Admin) layer: platform roles, platform plans,
-- org subscriptions, invoices, verified payments, audit log, support tickets.
--
-- Security model:
--   * Tenant RLS policies from 0001 are NOT modified. All cross-tenant
--     admin access goes through SECURITY DEFINER functions that assert
--     is_platform_admin() internally.
--   * platform_admins has RLS enabled with no policies: even an admin
--     cannot read it directly through PostgREST.
--   * Suspension is enforced in org_has_role(): every write policy in
--     0001 flows through it, so suspended/cancelled organizations become
--     read-only without touching a single policy. Reads (is_org_member)
--     stay open so gym data is preserved and visible.
--   * Money is integer minor units; timestamps are timestamptz.

-- ---------------------------------------------------------------------------
-- 1. Organization lifecycle status
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column status text not null default 'active'
    check (status in ('active','trial','suspended','cancelled'));

create index organizations_status_idx on public.organizations (status);

-- ---------------------------------------------------------------------------
-- 2. Platform admin roles. RLS on, NO policies: the only access path is
--    SECURITY DEFINER helpers below. Rows are inserted exclusively by
--    promote_to_platform_admin() (SQL editor / CLI) — no public signup.
-- ---------------------------------------------------------------------------

create table public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role = 'super_admin'),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Platform plans — what gyms subscribe to. Separate from gym-side
--    membership_plans (those are the gym's own product).
-- ---------------------------------------------------------------------------

create table public.platform_plans (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null,
  price_minor       integer not null check (price_minor >= 0),
  currency         text not null default 'INR',
  billing_interval text not null check (billing_interval in ('monthly','quarterly','annual')),
  trial_days       integer not null default 14 check (trial_days >= 0),
  status           text not null default 'active' check (status in ('active','retired')),
  feature_limits   jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.platform_plans enable row level security;

-- ---------------------------------------------------------------------------
-- 4. One subscription per organization.
--    State machine: trialing --(verified payment on invoice)--> active;
--    active --(open invoice past due, set manually/monitoring)--> past_due;
--    any --(admin)--> cancelled. A subscription only reaches 'active'
--    after a verified payment, so MRR over status='active' is paid MRR.
-- ---------------------------------------------------------------------------

create table public.org_subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null unique references public.organizations(id) on delete cascade,
  plan_id              uuid not null references public.platform_plans(id) on delete restrict,
  status               text not null default 'trialing'
                         check (status in ('trialing','active','past_due','cancelled','expired')),
  started_at           timestamptz not null default now(),
  trial_ends_at        timestamptz,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cancelled_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.org_subscriptions enable row level security;
create index org_subscriptions_status_idx on public.org_subscriptions (status);

-- ---------------------------------------------------------------------------
-- 5. Invoices and platform-side payments. Payments are only marked
--    'verified' by admin_record_subscription_payment(); non-manual
--    providers are rejected until a real gateway webhook exists —
--    we never pretend a payment succeeded.
-- ---------------------------------------------------------------------------

create table public.subscription_invoices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null references public.org_subscriptions(id) on delete cascade,
  amount_minor    integer not null check (amount_minor > 0),
  currency        text not null default 'INR',
  status          text not null default 'open' check (status in ('open','paid','void')),
  period_start    date not null,
  period_end      date not null,
  due_at          date not null,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (period_end >= period_start)
);

alter table public.subscription_invoices enable row level security;
create index subscription_invoices_org_idx on public.subscription_invoices (organization_id, status);
create index subscription_invoices_due_idx on public.subscription_invoices (due_at) where status = 'open';

create table public.subscription_payments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id      uuid not null references public.subscription_invoices(id) on delete cascade,
  amount_minor    integer not null check (amount_minor > 0),
  currency        text not null default 'INR',
  provider        text not null default 'manual' check (provider in ('manual','razorpay','stripe')),
  provider_ref    text,
  status          text not null default 'pending' check (status in ('pending','verified','failed')),
  verified_at     timestamptz,
  recorded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

alter table public.subscription_payments enable row level security;

-- ---------------------------------------------------------------------------
-- 6. Admin audit log — actor, action, target, timestamp, metadata.
-- ---------------------------------------------------------------------------

create table public.admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email   text,
  action        text not null,
  target_type   text not null,
  target_id     uuid,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_target_idx on public.admin_audit_log (target_type, target_id);

-- ---------------------------------------------------------------------------
-- 7. Support tickets (platform-side support management per organization)
-- ---------------------------------------------------------------------------

create table public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject         text not null,
  body            text,
  status          text not null default 'open' check (status in ('open','in_progress','resolved')),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.support_tickets enable row level security;
create index support_tickets_org_idx on public.support_tickets (organization_id, status);

-- updated_at maintenance (set_updated_at exists from 0001)

create trigger platform_plans_updated_at before update on public.platform_plans
  for each row execute function public.set_updated_at();
create trigger org_subscriptions_updated_at before update on public.org_subscriptions
  for each row execute function public.set_updated_at();
create trigger subscription_invoices_updated_at before update on public.subscription_invoices
  for each row execute function public.set_updated_at();
create trigger support_tickets_updated_at before update on public.support_tickets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Platform admin helpers (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.platform_admins p where p.user_id = auth.uid() and p.role = 'super_admin'
  );
$$;

create or replace function public.platform_admin_role()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select p.role from public.platform_admins p where p.user_id = auth.uid();
$$;

-- Audit writer. SECURITY DEFINER so it works from inside admin functions;
-- executable only by those functions (revoked from API roles below).
create or replace function public.log_admin_action(
  p_action text,
  p_target_type text,
  p_target_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_audit_log (actor_user_id, actor_email, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', 'system'),
    p_action,
    p_target_type,
    p_target_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.log_admin_action(text, text, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Suspension enforcement (single choke point).
--    Every write policy in 0001 calls org_has_role(); requiring an
--    active/trial organization here makes suspended and cancelled gyms
--    read-only everywhere at once. No tenant policy is modified.
-- ---------------------------------------------------------------------------

create or replace function public.org_has_role(org uuid, variadic roles text[])
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.role = any(roles)
      and o.status in ('active','trial')
  );
$$;

-- ---------------------------------------------------------------------------
-- 10. Bootstrap: grant platform role. SQL-editor / CLI only — PostgREST
--     always sets the `role` GUC (anon/authenticated/service_role), so the
--     API path is rejected before anything else runs. Revoked from API
--     roles entirely as a second layer.
-- ---------------------------------------------------------------------------

create or replace function public.promote_to_platform_admin(p_email text, p_role text default 'super_admin')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_setting text;
begin
  v_setting := coalesce(nullif(current_setting('role', true), ''), 'postgres');
  if v_setting in ('anon','authenticated','service_role')
     or current_setting('request.jwt.claims', true) is not null then
    raise exception 'promote_to_platform_admin may only be run from the SQL editor or CLI'
      using errcode = '42501';
  end if;
  if p_role <> 'super_admin' then
    raise exception 'Only the super_admin platform role can be granted';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'No user with email %. The account must sign up first.', p_email;
  end if;
  insert into public.platform_admins (user_id, role, granted_by)
  values (v_uid, p_role, null)
  on conflict (user_id) do update set role = excluded.role;
  insert into public.admin_audit_log (actor_user_id, actor_email, action, target_type, target_id, metadata)
  values (v_uid, lower(trim(p_email)), 'platform_admin.granted', 'user', v_uid,
          jsonb_build_object('role', p_role));
end;
$$;

revoke execute on function public.promote_to_platform_admin(text, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. Onboarding creates trial organizations (self-serve gyms start on
--     platform trial; first verified payment moves them to 'active').
-- ---------------------------------------------------------------------------

create or replace function public.create_organization(
  p_name text,
  p_phone text default null,
  p_address text default null,
  p_timezone text default 'Asia/Kolkata',
  p_branch_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Gym name must be at least 2 characters';
  end if;

  -- Resume interrupted onboarding: return the org this user already owns.
  select id into v_org from public.organizations where owner_id = v_uid limit 1;
  if v_org is not null then
    return v_org;
  end if;

  insert into public.organizations (owner_id, name, phone, address, timezone, status)
  values (v_uid, trim(p_name), p_phone, p_address, coalesce(p_timezone, 'Asia/Kolkata'), 'trial')
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_uid, 'owner');

  insert into public.branches (organization_id, name, is_primary)
  values (
    v_org,
    case when p_branch_name is not null and length(trim(p_branch_name)) > 0
         then trim(p_branch_name)
         else 'Main branch' end,
    true
  );

  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Plan entitlement: enforce max_members on new member inserts when the
--     organization's plan defines a limit. SECURITY DEFINER so the limit is
--     readable despite platform tables having no tenant policies.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_member_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  select (pl.feature_limits ->> 'max_members')::integer into v_limit
  from public.org_subscriptions s
  join public.platform_plans pl on pl.id = s.plan_id
  where s.organization_id = new.organization_id
    and s.status in ('trialing','active','past_due')
  limit 1;

  if v_limit is not null then
    select count(*) into v_count
    from public.members
    where organization_id = new.organization_id and status <> 'archived';
    if v_count >= v_limit then
      raise exception 'Plan limit reached: this plan allows % members', v_limit
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger members_plan_limit
  before insert on public.members
  for each row execute function public.enforce_member_plan_limit();

-- ---------------------------------------------------------------------------
-- 13. Admin RPC: platform metrics (all real, computed from these tables)
-- ---------------------------------------------------------------------------

create or replace function public.admin_platform_metrics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_orgs', (select count(*) from public.organizations),
    'orgs_by_status', coalesce(
      (select jsonb_object_agg(status, cnt)
         from (select status, count(*)::integer as cnt from public.organizations group by status) s),
      '{}'::jsonb),
    'total_members', (select count(*) from public.members),
    'active_members', (select count(*) from public.members where status = 'active'),
    'active_subscriptions', (select count(*) from public.org_subscriptions where status = 'active'),
    'trialing_subscriptions', (select count(*) from public.org_subscriptions where status = 'trialing'),
    -- MRR from active (i.e. payment-verified) subscriptions, normalized to month
    'mrr_minor', coalesce(
      (select sum(
          case p.billing_interval
            when 'monthly' then p.price_minor
            when 'quarterly' then round(p.price_minor / 3.0)::integer
            else round(p.price_minor / 12.0)::integer
          end)
       from public.org_subscriptions s
       join public.platform_plans p on p.id = s.plan_id
       where s.status = 'active'),
      0),
    'verified_revenue_minor', coalesce(
      (select sum(amount_minor) from public.subscription_payments where status = 'verified'), 0),
    'failed_payments_30d', (
      select count(*) from public.subscription_payments
      where status = 'failed' and created_at >= now() - interval '30 days'),
    'overdue_invoices', (
      select count(*) from public.subscription_invoices
      where status = 'open' and due_at < current_date),
    'renewals_due_14d', (
      select count(*) from public.org_subscriptions
      where status = 'active' and current_period_end <= now() + interval '14 days'),
    'trials_ending_14d', (
      select count(*) from public.org_subscriptions
      where status = 'trialing' and trial_ends_at <= now() + interval '14 days'),
    'new_orgs_7d', (
      select count(*) from public.organizations where created_at >= now() - interval '7 days'),
    'support_open', (
      select count(*) from public.support_tickets where status <> 'resolved'),
    'recent_orgs', coalesce(
      (select jsonb_agg(x order by x->>'created_at' desc) from (
         select jsonb_build_object('id', o.id, 'name', o.name, 'status', o.status,
                                   'created_at', o.created_at) as x
         from public.organizations o
         order by o.created_at desc
         limit 5) t),
      '[]'::jsonb),
    'recent_activity', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'action', a.action, 'target_type', a.target_type, 'target_id', a.target_id,
                'actor_email', a.actor_email, 'metadata', a.metadata, 'created_at', a.created_at)
              order by a.created_at desc)
       from (select * from public.admin_audit_log order by created_at desc limit 8) a),
      '[]'::jsonb),
    'health', jsonb_build_object(
      'server_time', now(),
      'database_version', version(),
      'error_monitoring', 'not configured')
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. Admin RPC: organization list with search / status filter / pagination
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_organizations(
  p_search text default null,
  p_status text default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_total integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('active','trial','suspended','cancelled') then
    raise exception 'Invalid status %', p_status;
  end if;

  select count(*)::integer into v_total
  from public.organizations o
  left join auth.users u on u.id = o.owner_id
  where (p_status is null or o.status = p_status)
    and (p_search is null or length(trim(p_search)) = 0
         or o.name ilike '%' || trim(p_search) || '%'
         or u.email ilike '%' || trim(p_search) || '%');

  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'status', o.status,
      'phone', o.phone,
      'created_at', o.created_at,
      'owner_id', o.owner_id,
      'owner_email', u.email,
      'owner_name', coalesce(pr.full_name, ''),
      'member_count', (select count(*) from public.members m where m.organization_id = o.id),
      'branch_count', (select count(*) from public.branches b where b.organization_id = o.id),
      'plan_name', pl.name,
      'sub_status', s.status,
      'period_end', s.current_period_end,
      'trial_ends_at', s.trial_ends_at
    ) as r
    from public.organizations o
    left join auth.users u on u.id = o.owner_id
    left join public.profiles pr on pr.id = o.owner_id
    left join public.org_subscriptions s on s.organization_id = o.id
    left join public.platform_plans pl on pl.id = s.plan_id
    where (p_status is null or o.status = p_status)
      and (p_search is null or length(trim(p_search)) = 0
           or o.name ilike '%' || trim(p_search) || '%'
           or u.email ilike '%' || trim(p_search) || '%')
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limit, 10), 100))
    offset greatest(0, coalesce(p_offset, 0))
  ) t;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- 15. Admin RPC: full detail for one organization
-- ---------------------------------------------------------------------------

create or replace function public.admin_org_details(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'status', o.status,
    'phone', o.phone,
    'address', o.address,
    'timezone', o.timezone,
    'currency', o.currency,
    'created_at', o.created_at,
    'owner_id', o.owner_id,
    'owner_email', u.email,
    'owner_name', coalesce(pr.full_name, ''),
    'member_count', (select count(*) from public.members m where m.organization_id = o.id),
    'active_member_count', (select count(*) from public.members m
                             where m.organization_id = o.id and m.status = 'active'),
    'branch_count', (select count(*) from public.branches b where b.organization_id = o.id),
    'staff_count', (select count(*) from public.staff st where st.organization_id = o.id),
    'gym_payment_count', (select count(*) from public.payments pay where pay.organization_id = o.id),
    'gym_revenue_minor', coalesce(
      (select sum(amount_minor) from public.payments pay
       where pay.organization_id = o.id and pay.status = 'paid'), 0),
    'branches', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', b.id, 'name', b.name, 'is_primary', b.is_primary,
                'is_archived', b.is_archived, 'created_at', b.created_at)
              order by b.is_primary desc, b.created_at)
       from public.branches b where b.organization_id = o.id),
      '[]'::jsonb),
    'subscription', (
      select jsonb_build_object(
        'id', s.id,
        'status', s.status,
        'started_at', s.started_at,
        'trial_ends_at', s.trial_ends_at,
        'current_period_start', s.current_period_start,
        'current_period_end', s.current_period_end,
        'cancelled_at', s.cancelled_at,
        'plan_id', pl.id,
        'plan_code', pl.code,
        'plan_name', pl.name,
        'price_minor', pl.price_minor,
        'currency', pl.currency,
        'billing_interval', pl.billing_interval,
        'trial_days', pl.trial_days,
        'feature_limits', pl.feature_limits
      )
      from public.org_subscriptions s
      join public.platform_plans pl on pl.id = s.plan_id
      where s.organization_id = o.id
    ),
    'invoices', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', i.id, 'amount_minor', i.amount_minor, 'status', i.status,
                'period_start', i.period_start, 'period_end', i.period_end,
                'due_at', i.due_at, 'paid_at', i.paid_at, 'created_at', i.created_at)
              order by i.created_at desc)
       from public.subscription_invoices i where i.organization_id = o.id),
      '[]'::jsonb),
    'tickets', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', t.id, 'subject', t.subject, 'status', t.status,
                'created_at', t.created_at, 'updated_at', t.updated_at)
              order by t.updated_at desc)
       from public.support_tickets t where t.organization_id = o.id),
      '[]'::jsonb),
    'recent_audit', coalesce(
      (select jsonb_agg(x) from (
         select jsonb_build_object(
                  'action', a.action, 'actor_email', a.actor_email,
                  'metadata', a.metadata, 'created_at', a.created_at) as x
         from public.admin_audit_log a
         where a.target_type = 'organization' and a.target_id = o.id
         order by a.created_at desc
         limit 10) t),
      '[]'::jsonb)
  ) into v_org
  from public.organizations o
  left join auth.users u on u.id = o.owner_id
  left join public.profiles pr on pr.id = o.owner_id
  where o.id = p_org_id;

  if v_org is null then
    raise exception 'Organization not found';
  end if;
  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- 16. Admin RPC: provision an organization for an existing user account
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_organization(
  p_owner_email text,
  p_name text,
  p_phone text default null,
  p_branch_name text default null,
  p_plan_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_org uuid;
  v_plan public.platform_plans%rowtype;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Gym name must be at least 2 characters';
  end if;

  select id into v_owner
  from auth.users
  where lower(email) = lower(trim(coalesce(p_owner_email, '')));
  if v_owner is null then
    raise exception 'No user with email %. The gym owner must sign up first, then retry.',
      p_owner_email;
  end if;
  if exists (select 1 from public.organizations where owner_id = v_owner) then
    raise exception 'That user already owns an organization';
  end if;

  insert into public.organizations (owner_id, name, phone, status)
  values (v_owner, trim(p_name), p_phone, 'trial')
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_owner, 'owner');

  insert into public.branches (organization_id, name, is_primary)
  values (
    v_org,
    case when p_branch_name is not null and length(trim(p_branch_name)) > 0
         then trim(p_branch_name) else 'Main branch' end,
    true
  );

  if p_plan_code is not null then
    select * into v_plan from public.platform_plans
    where code = p_plan_code and status = 'active';
    if not found then
      raise exception 'Unknown or retired plan code %', p_plan_code;
    end if;
    insert into public.org_subscriptions (organization_id, plan_id, status, trial_ends_at)
    values (v_org, v_plan.id, 'trialing',
            now() + make_interval(days => v_plan.trial_days));
  end if;

  perform public.log_admin_action('organization.created', 'organization', v_org,
    jsonb_build_object('name', trim(p_name),
                       'owner_email', lower(trim(coalesce(p_owner_email, ''))),
                       'plan_code', p_plan_code));

  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- 17. Admin RPC: suspend / reactivate / cancel (status change + audit).
--     Suspension never deletes data — it only flips this status column,
--     which org_has_role() consults to block writes.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_organization_status(
  p_org_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_status not in ('active','trial','suspended','cancelled') then
    raise exception 'Invalid status %', p_status;
  end if;

  select status into v_prev from public.organizations where id = p_org_id;
  if v_prev is null then
    raise exception 'Organization not found';
  end if;
  if v_prev = p_status then
    return;
  end if;

  update public.organizations set status = p_status where id = p_org_id;

  perform public.log_admin_action('organization.status.' || p_status, 'organization', p_org_id,
    jsonb_build_object('previous', v_prev, 'reason', p_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- 18. Admin RPC: assign / replace a gym's platform subscription
-- ---------------------------------------------------------------------------

create or replace function public.admin_assign_subscription(
  p_org_id uuid,
  p_plan_code text,
  p_trial_days integer default null  -- null = plan default, 0 = no trial (invoice now)
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.platform_plans%rowtype;
  v_sub uuid;
  v_trial integer;
  v_end date;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where id = p_org_id) then
    raise exception 'Organization not found';
  end if;
  select * into v_plan from public.platform_plans
  where code = p_plan_code and status = 'active';
  if not found then
    raise exception 'Unknown or retired plan code %', p_plan_code;
  end if;
  if p_trial_days is not null and p_trial_days < 0 then
    raise exception 'Trial days cannot be negative';
  end if;
  v_trial := coalesce(p_trial_days, v_plan.trial_days);

  -- Update in place (never delete): invoice history must survive re-assignment.
  insert into public.org_subscriptions
    (organization_id, plan_id, status, trial_ends_at, started_at, cancelled_at,
     current_period_start, current_period_end)
  values (
    p_org_id,
    v_plan.id,
    case when v_trial > 0 then 'trialing' else 'past_due' end,
    case when v_trial > 0 then now() + make_interval(days => v_trial) end,
    now(),
    null,
    null,
    null
  )
  on conflict (organization_id) do update
    set plan_id = excluded.plan_id,
        status = excluded.status,
        trial_ends_at = excluded.trial_ends_at,
        started_at = now(),
        cancelled_at = null,
        current_period_start = null,
        current_period_end = null
  returning id into v_sub;

  -- No trial: open the first invoice immediately so billing starts now.
  if v_trial = 0 then
    v_end := (current_date + case v_plan.billing_interval
                              when 'monthly' then interval '1 month'
                              when 'quarterly' then interval '3 months'
                              else interval '1 year'
                            end)::date;
    insert into public.subscription_invoices
      (organization_id, subscription_id, amount_minor, currency,
       period_start, period_end, due_at)
    values (p_org_id, v_sub, v_plan.price_minor, v_plan.currency,
            current_date, v_end, current_date + 7);
  end if;

  perform public.log_admin_action('subscription.assigned', 'organization', p_org_id,
    jsonb_build_object('plan_code', p_plan_code, 'trial_days', v_trial,
                       'subscription_id', v_sub));

  return v_sub;
end;
$$;

-- ---------------------------------------------------------------------------
-- 19. Admin RPC: generate a renewal invoice for the next billing period
-- ---------------------------------------------------------------------------

create or replace function public.admin_generate_invoice(p_subscription_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub record;
  v_start date;
  v_end date;
  v_invoice uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select s.id, s.organization_id, s.status, s.current_period_end,
         p.price_minor, p.currency, p.billing_interval
    into v_sub
  from public.org_subscriptions s
  join public.platform_plans p on p.id = s.plan_id
  where s.id = p_subscription_id;
  if not found then
    raise exception 'Subscription not found';
  end if;
  if v_sub.status = 'cancelled' then
    raise exception 'Cannot invoice a cancelled subscription';
  end if;
  if exists (select 1 from public.subscription_invoices
             where subscription_id = v_sub.id and status = 'open') then
    raise exception 'An open invoice already exists for this subscription';
  end if;

  v_start := coalesce(v_sub.current_period_end::date, current_date);
  if v_start < current_date then
    v_start := current_date; -- never back-date a renewal period
  end if;
  v_end := (v_start + case v_sub.billing_interval
                       when 'monthly' then interval '1 month'
                       when 'quarterly' then interval '3 months'
                       else interval '1 year'
                     end)::date;

  insert into public.subscription_invoices
    (organization_id, subscription_id, amount_minor, currency,
     period_start, period_end, due_at)
  values (v_sub.organization_id, v_sub.id, v_sub.price_minor, v_sub.currency,
          v_start, v_end, current_date + 7)
  returning id into v_invoice;

  perform public.log_admin_action('subscription.invoice_generated', 'organization',
    v_sub.organization_id,
    jsonb_build_object('invoice_id', v_invoice, 'amount_minor', v_sub.price_minor,
                       'period_start', v_start, 'period_end', v_end));

  return v_invoice;
end;
$$;

-- ---------------------------------------------------------------------------
-- 20. Admin RPC: record a payment and mark it verified (server-side).
--     Only provider='manual' is accepted: no gateway webhook exists yet,
--     so any other provider would be a fake verification. Manual entries
--     are admin attestation and are labelled as such in the UI.
-- ---------------------------------------------------------------------------

create or replace function public.admin_record_subscription_payment(
  p_invoice_id uuid,
  p_provider text default 'manual',
  p_provider_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv record;
  v_payment uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if coalesce(p_provider, 'manual') <> 'manual' then
    raise exception 'No payment provider is configured; only manual attestation is available';
  end if;

  select i.id, i.organization_id, i.subscription_id, i.amount_minor, i.currency,
         i.status, i.period_start, i.period_end
    into v_inv
  from public.subscription_invoices i
  where i.id = p_invoice_id
  for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if v_inv.status = 'paid' then
    raise exception 'Invoice is already paid';
  end if;
  if v_inv.status = 'void' then
    raise exception 'Cannot pay a void invoice';
  end if;

  insert into public.subscription_payments
    (organization_id, invoice_id, amount_minor, currency, provider, provider_ref,
     status, verified_at, recorded_by)
  values (v_inv.organization_id, v_inv.id, v_inv.amount_minor, v_inv.currency,
          'manual', p_provider_ref, 'verified', now(), auth.uid())
  returning id into v_payment;

  update public.subscription_invoices
    set status = 'paid', paid_at = now()
    where id = v_inv.id;

  -- Activate the subscription for the invoiced period.
  update public.org_subscriptions
    set status = 'active',
        current_period_start = v_inv.period_start::timestamptz,
        current_period_end = v_inv.period_end::timestamptz,
        trial_ends_at = null,
        cancelled_at = null
    where id = v_inv.subscription_id;

  -- First verified payment moves the gym from trial to active.
  update public.organizations
    set status = 'active'
    where id = v_inv.organization_id and status = 'trial';

  perform public.log_admin_action('subscription.payment_verified', 'organization',
    v_inv.organization_id,
    jsonb_build_object('invoice_id', v_inv.id, 'payment_id', v_payment,
                       'amount_minor', v_inv.amount_minor, 'provider_ref', p_provider_ref));

  return v_payment;
end;
$$;

-- ---------------------------------------------------------------------------
-- 21. Admin RPC: cancel a subscription (voids open invoices, keeps history)
-- ---------------------------------------------------------------------------

create or replace function public.admin_cancel_subscription(
  p_subscription_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub record;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select id, organization_id, status into v_sub
  from public.org_subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'Subscription not found';
  end if;
  if v_sub.status = 'cancelled' then
    return;
  end if;

  update public.org_subscriptions
    set status = 'cancelled', cancelled_at = now()
    where id = p_subscription_id;

  update public.subscription_invoices
    set status = 'void'
    where subscription_id = p_subscription_id and status = 'open';

  perform public.log_admin_action('subscription.cancelled', 'organization',
    v_sub.organization_id,
    jsonb_build_object('subscription_id', p_subscription_id, 'reason', p_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- 22. Admin RPC: platform plans CRUD
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_plans()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(r order by r->>'created_at'), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id', p.id, 'code', p.code, 'name', p.name,
      'price_minor', p.price_minor, 'currency', p.currency,
      'billing_interval', p.billing_interval, 'trial_days', p.trial_days,
      'status', p.status, 'feature_limits', p.feature_limits,
      'created_at', p.created_at,
      'subscriber_count', (
        select count(*) from public.org_subscriptions s
        where s.plan_id = p.id and s.status in ('trialing','active','past_due'))
    ) as r
    from public.platform_plans p
  ) t;

  return v_rows;
end;
$$;

create or replace function public.admin_upsert_plan(
  p_id uuid default null,
  p_code text default null,
  p_name text default null,
  p_price_minor integer default 0,
  p_currency text default 'INR',
  p_billing_interval text default 'monthly',
  p_trial_days integer default 14,
  p_status text default 'active',
  p_feature_limits jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_code text;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  v_code := lower(trim(coalesce(p_code, '')));
  if length(v_code) < 2 then
    raise exception 'Plan code must be at least 2 characters';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Plan name must be at least 2 characters';
  end if;
  if coalesce(p_price_minor, 0) < 0 then
    raise exception 'Price cannot be negative';
  end if;
  if p_billing_interval not in ('monthly','quarterly','annual') then
    raise exception 'Invalid billing interval %', p_billing_interval;
  end if;
  if p_status not in ('active','retired') then
    raise exception 'Invalid plan status %', p_status;
  end if;
  if coalesce(p_trial_days, 0) < 0 then
    raise exception 'Trial days cannot be negative';
  end if;
  if p_feature_limits is null or jsonb_typeof(p_feature_limits) <> 'object' then
    raise exception 'Feature limits must be a JSON object';
  end if;

  if p_id is null then
    insert into public.platform_plans
      (code, name, price_minor, currency, billing_interval, trial_days, status, feature_limits)
    values (v_code, trim(p_name), p_price_minor, p_currency, p_billing_interval,
            coalesce(p_trial_days, 0), p_status, p_feature_limits)
    returning id into v_id;
    perform public.log_admin_action('platform_plan.created', 'platform_plan', v_id,
      jsonb_build_object('code', v_code, 'name', trim(p_name)));
  else
    update public.platform_plans
      set code = v_code,
          name = trim(p_name),
          price_minor = p_price_minor,
          currency = p_currency,
          billing_interval = p_billing_interval,
          trial_days = coalesce(p_trial_days, 0),
          status = p_status,
          feature_limits = p_feature_limits
      where id = p_id
      returning id into v_id;
    if v_id is null then
      raise exception 'Plan not found';
    end if;
    perform public.log_admin_action('platform_plan.updated', 'platform_plan', v_id,
      jsonb_build_object('code', v_code, 'name', trim(p_name), 'status', p_status));
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 23. Admin RPC: subscription list (for the billing screen)
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_subscriptions(
  p_status text default null,
  p_search text default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_total integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('trialing','active','past_due','cancelled','expired') then
    raise exception 'Invalid status %', p_status;
  end if;

  select count(*)::integer into v_total
  from public.org_subscriptions s
  join public.organizations o on o.id = s.organization_id
  left join auth.users u on u.id = o.owner_id
  where (p_status is null or s.status = p_status)
    and (p_search is null or length(trim(p_search)) = 0
         or o.name ilike '%' || trim(p_search) || '%'
         or u.email ilike '%' || trim(p_search) || '%');

  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id', s.id,
      'organization_id', o.id,
      'org_name', o.name,
      'org_status', o.status,
      'owner_email', u.email,
      'status', s.status,
      'started_at', s.started_at,
      'trial_ends_at', s.trial_ends_at,
      'current_period_end', s.current_period_end,
      'plan_name', p.name,
      'plan_code', p.code,
      'price_minor', p.price_minor,
      'billing_interval', p.billing_interval,
      'open_invoice', (
        select jsonb_build_object('id', i.id, 'amount_minor', i.amount_minor,
                                  'due_at', i.due_at, 'status', i.status)
        from public.subscription_invoices i
        where i.subscription_id = s.id and i.status = 'open'
        order by i.created_at desc
        limit 1),
      'last_payment', (
        select jsonb_build_object('amount_minor', pay.amount_minor,
                                  'provider', pay.provider, 'verified_at', pay.verified_at)
        from public.subscription_payments pay
        where pay.invoice_id in (
                select id from public.subscription_invoices i2
                where i2.subscription_id = s.id and i2.status = 'paid')
        order by pay.verified_at desc nulls last
        limit 1)
    ) as r
    from public.org_subscriptions s
    join public.organizations o on o.id = s.organization_id
    left join auth.users u on u.id = o.owner_id
    join public.platform_plans p on p.id = s.plan_id
    where (p_status is null or s.status = p_status)
      and (p_search is null or length(trim(p_search)) = 0
           or o.name ilike '%' || trim(p_search) || '%'
           or u.email ilike '%' || trim(p_search) || '%')
    order by s.created_at desc
    limit greatest(1, least(coalesce(p_limit, 10), 100))
    offset greatest(0, coalesce(p_offset, 0))
  ) t;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- 24. Admin RPCs: audit log search + support tickets
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_audit(
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_total integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select count(*)::integer into v_total
  from public.admin_audit_log a
  where p_search is null or length(trim(p_search)) = 0
     or a.action ilike '%' || trim(p_search) || '%'
     or a.actor_email ilike '%' || trim(p_search) || '%'
     or a.target_type ilike '%' || trim(p_search) || '%';

  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id', a.id, 'actor_email', a.actor_email, 'action', a.action,
      'target_type', a.target_type, 'target_id', a.target_id,
      'metadata', a.metadata, 'created_at', a.created_at
    ) as r
    from public.admin_audit_log a
    where p_search is null or length(trim(p_search)) = 0
       or a.action ilike '%' || trim(p_search) || '%'
       or a.actor_email ilike '%' || trim(p_search) || '%'
       or a.target_type ilike '%' || trim(p_search) || '%'
    order by a.created_at desc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    offset greatest(0, coalesce(p_offset, 0))
  ) t;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

create or replace function public.admin_list_tickets(
  p_status text default null,
  p_search text default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_total integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('open','in_progress','resolved') then
    raise exception 'Invalid status %', p_status;
  end if;

  select count(*)::integer into v_total
  from public.support_tickets t
  join public.organizations o on o.id = t.organization_id
  where (p_status is null or t.status = p_status)
    and (p_search is null or length(trim(p_search)) = 0
         or t.subject ilike '%' || trim(p_search) || '%'
         or o.name ilike '%' || trim(p_search) || '%');

  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id', t.id, 'organization_id', o.id, 'org_name', o.name,
      'subject', t.subject, 'body', t.body, 'status', t.status,
      'created_at', t.created_at, 'updated_at', t.updated_at
    ) as r
    from public.support_tickets t
    join public.organizations o on o.id = t.organization_id
    where (p_status is null or t.status = p_status)
      and (p_search is null or length(trim(p_search)) = 0
           or t.subject ilike '%' || trim(p_search) || '%'
           or o.name ilike '%' || trim(p_search) || '%')
    order by t.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 10), 100))
    offset greatest(0, coalesce(p_offset, 0))
  ) t;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

create or replace function public.admin_upsert_ticket(
  p_id uuid default null,
  p_org_id uuid default null,
  p_subject text default null,
  p_body text default null,
  p_status text default 'open'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_org uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_subject is null or length(trim(p_subject)) < 3 then
    raise exception 'Subject must be at least 3 characters';
  end if;
  if p_status not in ('open','in_progress','resolved') then
    raise exception 'Invalid status %', p_status;
  end if;

  if p_id is null then
    if p_org_id is null or not exists (
        select 1 from public.organizations where id = p_org_id) then
      raise exception 'Organization not found';
    end if;
    insert into public.support_tickets (organization_id, subject, body, status, created_by)
    values (p_org_id, trim(p_subject), p_body, p_status, auth.uid())
    returning id into v_id;
    perform public.log_admin_action('support_ticket.created', 'organization', p_org_id,
      jsonb_build_object('ticket_id', v_id, 'subject', trim(p_subject)));
  else
    update public.support_tickets
      set subject = trim(p_subject),
          body = p_body,
          status = p_status,
          updated_at = now()
      where id = p_id
      returning id, organization_id into v_id, v_org;
    if v_id is null then
      raise exception 'Ticket not found';
    end if;
    perform public.log_admin_action('support_ticket.updated', 'organization', v_org,
      jsonb_build_object('ticket_id', v_id, 'status', p_status, 'subject', trim(p_subject)));
  end if;

  return v_id;
end;
$$;

-- Keep platform authorization helpers and admin operations off the anonymous
-- API. Every callable operation is granted only to signed-in users, and each
-- SECURITY DEFINER body performs its own platform role check.
revoke execute on function public.is_platform_admin() from public, anon, service_role;
revoke execute on function public.platform_admin_role() from public, anon, service_role;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.platform_admin_role() to authenticated;

revoke execute on function public.admin_platform_metrics() from public, anon, service_role;
revoke execute on function public.admin_list_organizations(text, text, integer, integer) from public, anon, service_role;
revoke execute on function public.admin_org_details(uuid) from public, anon, service_role;
revoke execute on function public.admin_create_organization(text, text, text, text, text) from public, anon, service_role;
revoke execute on function public.admin_set_organization_status(uuid, text, text) from public, anon, service_role;
revoke execute on function public.admin_assign_subscription(uuid, text, integer) from public, anon, service_role;
revoke execute on function public.admin_generate_invoice(uuid) from public, anon, service_role;
revoke execute on function public.admin_record_subscription_payment(uuid, text, text) from public, anon, service_role;
revoke execute on function public.admin_cancel_subscription(uuid, text) from public, anon, service_role;
revoke execute on function public.admin_list_plans() from public, anon, service_role;
revoke execute on function public.admin_upsert_plan(uuid, text, text, integer, text, text, integer, text, jsonb) from public, anon, service_role;
revoke execute on function public.admin_list_subscriptions(text, text, integer, integer) from public, anon, service_role;
revoke execute on function public.admin_list_audit(text, integer, integer) from public, anon, service_role;
revoke execute on function public.admin_list_tickets(text, text, integer, integer) from public, anon, service_role;
revoke execute on function public.admin_upsert_ticket(uuid, uuid, text, text, text) from public, anon, service_role;

grant execute on function public.admin_platform_metrics() to authenticated;
grant execute on function public.admin_list_organizations(text, text, integer, integer) to authenticated;
grant execute on function public.admin_org_details(uuid) to authenticated;
grant execute on function public.admin_create_organization(text, text, text, text, text) to authenticated;
grant execute on function public.admin_set_organization_status(uuid, text, text) to authenticated;
grant execute on function public.admin_assign_subscription(uuid, text, integer) to authenticated;
grant execute on function public.admin_generate_invoice(uuid) to authenticated;
grant execute on function public.admin_record_subscription_payment(uuid, text, text) to authenticated;
grant execute on function public.admin_cancel_subscription(uuid, text) to authenticated;
grant execute on function public.admin_list_plans() to authenticated;
grant execute on function public.admin_upsert_plan(uuid, text, text, integer, text, text, integer, text, jsonb) to authenticated;
grant execute on function public.admin_list_subscriptions(text, text, integer, integer) to authenticated;
grant execute on function public.admin_list_audit(text, integer, integer) to authenticated;
grant execute on function public.admin_list_tickets(text, text, integer, integer) to authenticated;
grant execute on function public.admin_upsert_ticket(uuid, uuid, text, text, text) to authenticated;

-- ======================================================================
-- 0003_workspace_theme.sql
-- ======================================================================
-- TwoPlus.fit — 0003_workspace_theme
-- Per-workspace appearance: glass backdrop preset, light/dark mode, optional
-- custom background image.
--
-- No new RLS is needed: the existing "org update owner" policy on
-- public.organizations already lets an owner update their own row, and every
-- member already reads the row through "org read member". Staff therefore see
-- the workspace theme but cannot change it (enforced by RLS, not the UI).

alter table public.organizations
  add column theme_preset text not null default 'sage'
    check (theme_preset in ('sage','lagoon','blush','lilac')),
  add column theme_mode text not null default 'light'
    check (theme_mode in ('light','dark')),
  add column theme_image text
    check (theme_image is null or char_length(theme_image) <= 2000);

-- ======================================================================
-- 0004_reminders_and_roster.sql
-- ======================================================================
-- TwoPlus.fit — 0004_reminders_and_roster
-- Two gaps the reminders screen and the access & roles screen hit:
--
-- 1. public.notifications has read/update policies scoped to "own row" but no
--    INSERT policy, so nothing can ever be created. Members must be able to
--    write their own reminders; owners and managers must be able to assign one
--    to anyone in their gym. Both are limited to existing members of that
--    organization, so a row can never target an unrelated account.
--
-- 2. The team roster needs every member's name and email, but public.profiles
--    is readable only for your own row ("profiles read own"). Rather than
--    widening that policy, the roster comes from a SECURITY DEFINER function
--    that returns only the columns the screen needs and only for callers who
--    already belong to the organization.

-- The subquery reads organization_members, whose own "orgmember read" policy
-- already allows the caller's row and, for owners and managers, the whole gym.
-- re-run safe: drop the policy first in case a previous run already created it
drop policy if exists "notifications insert own or managed" on public.notifications;
create policy "notifications insert own or managed" on public.notifications
  for insert
  with check (
    organization_id is not null
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = notifications.organization_id
        and m.user_id = notifications.user_id
    )
    and (
      user_id = auth.uid()
      or public.org_has_role(organization_id, 'owner', 'manager')
    )
  );

-- SECURITY DEFINER for the same reason is_org_member is: the function reads
-- organization_members and profiles, whose own policies would otherwise filter
-- the results down to the caller. The guard clause keeps the extra rows from
-- leaking outside the caller's organization.
-- Email is not on profiles; it lives on auth.users, which a definer function
-- can read. Only the caller's own organization is ever returned.
create or replace function public.list_org_members(p_org_id uuid)
returns table (user_id uuid, role text, full_name text, email text)
language sql
security definer
set search_path = public
stable
as $$
  select m.user_id,
         m.role,
         coalesce(p.full_name, ''),
         u.email::text
  from public.organization_members m
  left join public.profiles p on p.id = m.user_id
  left join auth.users u on u.id = m.user_id
  where m.organization_id = p_org_id
    and public.is_org_member(p_org_id)
  order by
    case m.role
      when 'owner' then 0
      when 'manager' then 1
      when 'trainer' then 2
      when 'receptionist' then 3
      when 'finance' then 4
      else 5
    end,
    coalesce(p.full_name, '');
$$;

revoke execute on function public.list_org_members(uuid) from public, anon, service_role;
grant execute on function public.list_org_members(uuid) to authenticated;

-- ======================================================================
-- 0005_member_photos.sql
-- ======================================================================
-- Optional profile photo for members. A URL only: the gym pastes a hosted
-- image or their own CDN link. No stock imagery is ever filled in.
-- Re-runnable.

alter table public.members
  add column if not exists photo_url text;

-- ======================================================================
-- 0006_member_crm.sql
-- ======================================================================
-- TwoPlus.fit — 0006_member_crm
--
-- Member CRM: fitness records, fitness measurements, progress photos,
-- invoices, renewal history, internal notes, activity log.
--
-- Also closes a tenancy hole in 0001: payments/attendance/member_memberships
-- referenced members(id) only, so a caller authorised for org A could point a
-- row at a member that belongs to org B. Composite foreign keys on
-- (member_id, organization_id) make that impossible at the database level.
--
-- Re-runnable: every object is created with "if not exists" or replaced.

-- ---------------------------------------------------------------------------
-- Theme style: 0003 shipped the glass look as the only look. Theme 2 keeps the
-- previous solid surfaces, Theme 3 is the flat signal console. Both are per
-- workspace.
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists theme_style text not null default 'glass';

-- Every look the registry ships, so the check is replaced by name rather than
-- relying on the unnamed inline constraint from the original column add.
-- Keep this list in step with THEME_STYLES in src/lib/theme.tsx: a style missing
-- here applies in the browser and then fails to save.
alter table public.organizations
  drop constraint if exists organizations_theme_style_check;

alter table public.organizations
  add constraint organizations_theme_style_check
  check (theme_style in (
    'glass','classic','clay','ethereal',
    'cybercore','neon','cyberpunk','pixel','y2k',
    'brutal','maximal','surreal','scrapbook',
    'dispatch','luxury','swiss','minimal','bento','ledger','sketch',
    'bohemian','victorian','wabi',
    'signal','console','pocket'
  ));

-- ---------------------------------------------------------------------------
-- Tenancy anchors
-- ---------------------------------------------------------------------------
-- Composite FKs need a unique key on the referenced pair. Guarded so a
-- partially-applied run can be re-run safely.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'members_id_org_key') then
    alter table public.members
      add constraint members_id_org_key unique (id, organization_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'staff_id_org_key') then
    alter table public.staff
      add constraint staff_id_org_key unique (id, organization_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'membership_plans_id_org_key') then
    alter table public.membership_plans
      add constraint membership_plans_id_org_key unique (id, organization_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'member_memberships_id_org_key') then
    alter table public.member_memberships
      add constraint member_memberships_id_org_key unique (id, organization_id);
  end if;
end $$;

-- Re-point the child tables at the pair. The single-column FKs stay (they
-- cascade on delete); these add the tenant check. Guarded so a
-- partially-applied run can be re-run safely.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'member_memberships_member_org_fk') then
    alter table public.member_memberships
      add constraint member_memberships_member_org_fk
      foreign key (member_id, organization_id)
      references public.members (id, organization_id) on delete cascade;
  end if;
end $$;

-- staff.trainer_id must point at staff in the same gym.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'members_trainer_org_fk') then
    alter table public.members
      add constraint members_trainer_org_fk
      foreign key (trainer_id, organization_id)
      references public.staff (id, organization_id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_member_org_fk') then
    alter table public.payments
      add constraint payments_member_org_fk
      foreign key (member_id, organization_id)
      references public.members (id, organization_id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_membership_org_fk') then
    alter table public.payments
      add constraint payments_membership_org_fk
      foreign key (membership_id, organization_id)
      references public.member_memberships (id, organization_id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_member_org_fk') then
    alter table public.attendance
      add constraint attendance_member_org_fk
      foreign key (member_id, organization_id)
      references public.members (id, organization_id) on delete cascade;
  end if;
end $$;

-- Enough digits to be a real phone number, not a free-text field. NOT VALID
-- so pre-existing rows cannot block the migration; new writes are checked.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'members_phone_shape') then
    alter table public.members
      add constraint members_phone_shape
      check (phone ~ '^[0-9+() -]{6,20}$') not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Member code counter — collision-safe, per gym, no client input
-- ---------------------------------------------------------------------------
create table if not exists public.org_member_counters (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_number     integer not null default 0 check (last_number >= 0)
);

alter table public.org_member_counters enable row level security;
-- No policies: only the SECURITY DEFINER functions below touch this table.

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id       uuid not null,
  membership_id   uuid,
  invoice_number  text not null,
  issued_on       date not null default current_date,
  due_on          date,
  total_minor     integer not null check (total_minor >= 0),
  status          text not null default 'issued'
                  check (status in ('draft','issued','partial','paid','void')),
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, invoice_number),
  foreign key (member_id, organization_id)
    references public.members (id, organization_id) on delete cascade,
  foreign key (membership_id, organization_id)
    references public.member_memberships (id, organization_id) on delete set null
);
create index if not exists invoices_org_date_idx on public.invoices (organization_id, issued_on desc);
create index if not exists invoices_member_idx on public.invoices (member_id);

alter table public.payments
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null;
create index if not exists payments_invoice_idx on public.payments (invoice_id);

drop trigger if exists invoices_updated_at on public.invoices;
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

alter table public.invoices enable row level security;

drop policy if exists "invoices read" on public.invoices;
create policy "invoices read" on public.invoices
  for select using (public.is_org_member(organization_id));

drop policy if exists "invoices write" on public.invoices;
create policy "invoices write" on public.invoices
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager', 'finance', 'receptionist'));

drop policy if exists "invoices update" on public.invoices;
create policy "invoices update" on public.invoices
  for update using (public.org_has_role(organization_id, 'owner', 'manager', 'finance'))
  with check (public.org_has_role(organization_id, 'owner', 'manager', 'finance'));

-- ---------------------------------------------------------------------------
-- Statuses: extend the vocabulary without breaking existing rows
-- ---------------------------------------------------------------------------
-- 0001 allowed ('scheduled','active','expired','frozen','cancelled'). "paused"
-- is the word the UI uses; it maps to frozen. Renewal history needs to know
-- which membership row was extended and by whom, so it gets its own table.
create table if not exists public.membership_renewals (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  membership_id        uuid not null,
  member_id            uuid not null,
  previous_end_date    date not null,
  new_end_date         date not null,
  extended_days        integer not null,
  amount_minor         integer not null default 0 check (amount_minor >= 0),
  note                 text,
  renewed_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  check (new_end_date > previous_end_date),
  foreign key (membership_id, organization_id)
    references public.member_memberships (id, organization_id) on delete cascade,
  foreign key (member_id, organization_id)
    references public.members (id, organization_id) on delete cascade
);
create index if not exists membership_renewals_member_idx
  on public.membership_renewals (member_id, created_at desc);

alter table public.membership_renewals enable row level security;

drop policy if exists "renewals read" on public.membership_renewals;
create policy "renewals read" on public.membership_renewals
  for select using (public.is_org_member(organization_id));

drop policy if exists "renewals write" on public.membership_renewals;
create policy "renewals write" on public.membership_renewals
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist'));

-- ---------------------------------------------------------------------------
-- Internal notes — restricted to owner/manager, separate from members.notes
-- ---------------------------------------------------------------------------
create table if not exists public.member_internal_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id       uuid not null,
  body            text not null check (char_length(trim(body)) > 0),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (member_id, organization_id)
    references public.members (id, organization_id) on delete cascade
);
create index if not exists member_internal_notes_member_idx
  on public.member_internal_notes (member_id, created_at desc);

alter table public.member_internal_notes enable row level security;

drop policy if exists "internal notes read" on public.member_internal_notes;
create policy "internal notes read" on public.member_internal_notes
  for select using (public.org_has_role(organization_id, 'owner', 'manager'));

drop policy if exists "internal notes write" on public.member_internal_notes;
create policy "internal notes write" on public.member_internal_notes
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager'));

-- ---------------------------------------------------------------------------
-- Workout plans
-- ---------------------------------------------------------------------------
create table if not exists public.workout_plans (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(trim(name)) between 2 and 120),
  goal            text,
  description     text,
  is_archived     boolean not null default false,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index if not exists workout_plans_org_idx on public.workout_plans (organization_id, is_archived);

-- Must exist before member_workout_assignments below declares its composite FK
-- against (id, organization_id); Postgres requires the referenced unique key
-- up front (error 42830 otherwise). Guarded for safe re-runs.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workout_plans_id_org_key') then
    alter table public.workout_plans
      add constraint workout_plans_id_org_key unique (id, organization_id);
  end if;
end $$;

create table if not exists public.workout_exercises (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.workout_plans(id) on delete cascade,
  day_label     text,
  exercise_name text not null check (char_length(trim(exercise_name)) > 0),
  sets          integer check (sets is null or sets > 0),
  reps          text,
  rest_seconds  integer check (rest_seconds is null or rest_seconds >= 0),
  instructions  text,
  position      integer not null default 0
);
create index if not exists workout_exercises_plan_idx on public.workout_exercises (plan_id, position);

create table if not exists public.member_workout_assignments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id       uuid not null,
  plan_id         uuid not null,
  trainer_id      uuid,
  assigned_by     uuid references auth.users(id) on delete set null,
  effective_from  date not null default current_date,
  ended_on        date,
  status          text not null default 'active' check (status in ('active','ended')),
  notes           text,
  created_at      timestamptz not null default now(),
  check (ended_on is null or ended_on >= effective_from),
  foreign key (member_id, organization_id)
    references public.members (id, organization_id) on delete cascade,
  foreign key (plan_id, organization_id)
    references public.workout_plans (id, organization_id) on delete restrict,
  foreign key (trainer_id, organization_id)
    references public.staff (id, organization_id) on delete set null
);
create index if not exists member_workout_assignments_member_idx
  on public.member_workout_assignments (member_id, effective_from desc);

alter table public.workout_plans enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.member_workout_assignments enable row level security;

drop policy if exists "workout plans read" on public.workout_plans;
create policy "workout plans read" on public.workout_plans
  for select using (public.is_org_member(organization_id));
drop policy if exists "workout plans write" on public.workout_plans;
create policy "workout plans write" on public.workout_plans
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'));
drop policy if exists "workout plans update" on public.workout_plans;
create policy "workout plans update" on public.workout_plans
  for update using (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'))
  with check (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'));

drop policy if exists "workout exercises read" on public.workout_exercises;
create policy "workout exercises read" on public.workout_exercises
  for select using (exists (
    select 1 from public.workout_plans p
    where p.id = plan_id and public.is_org_member(p.organization_id)
  ));
drop policy if exists "workout exercises write" on public.workout_exercises;
create policy "workout exercises write" on public.workout_exercises
  for insert with check (exists (
    select 1 from public.workout_plans p
    where p.id = plan_id
      and public.org_has_role(p.organization_id, 'owner', 'manager', 'trainer')
  ));
drop policy if exists "workout exercises update" on public.workout_exercises;
create policy "workout exercises update" on public.workout_exercises
  for update using (exists (
    select 1 from public.workout_plans p
    where p.id = plan_id
      and public.org_has_role(p.organization_id, 'owner', 'manager', 'trainer')
  ));

drop policy if exists "workout assignments read" on public.member_workout_assignments;
create policy "workout assignments read" on public.member_workout_assignments
  for select using (public.is_org_member(organization_id));
drop policy if exists "workout assignments write" on public.member_workout_assignments;
create policy "workout assignments write" on public.member_workout_assignments
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'));
drop policy if exists "workout assignments update" on public.member_workout_assignments;
create policy "workout assignments update" on public.member_workout_assignments
  for update using (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'))
  with check (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'));

-- ---------------------------------------------------------------------------
-- Diet plans
-- ---------------------------------------------------------------------------
create table if not exists public.diet_plans (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(trim(name)) between 2 and 120),
  description     text,
  -- Nullable on purpose: a target the gym did not supply is stored as unknown,
  -- never as an invented number.
  target_calories integer check (target_calories is null or target_calories > 0),
  target_protein_g integer check (target_protein_g is null or target_protein_g >= 0),
  target_carbs_g  integer check (target_carbs_g is null or target_carbs_g >= 0),
  target_fat_g    integer check (target_fat_g is null or target_fat_g >= 0),
  is_archived     boolean not null default false,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index if not exists diet_plans_org_idx on public.diet_plans (organization_id, is_archived);

create table if not exists public.diet_meals (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.diet_plans(id) on delete cascade,
  name        text not null check (char_length(trim(name)) > 0),
  timing      text,
  coach_notes text,
  position    integer not null default 0
);
create index if not exists diet_meals_plan_idx on public.diet_meals (plan_id, position);

create table if not exists public.diet_meal_items (
  id         uuid primary key default gen_random_uuid(),
  meal_id    uuid not null references public.diet_meals(id) on delete cascade,
  food_item  text not null check (char_length(trim(food_item)) > 0),
  portion    text,
  notes      text,
  position   integer not null default 0
);
create index if not exists diet_meal_items_meal_idx on public.diet_meal_items (meal_id, position);

create table if not exists public.member_diet_assignments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id       uuid not null,
  plan_id         uuid not null,
  trainer_id      uuid,
  assigned_by     uuid references auth.users(id) on delete set null,
  effective_from  date not null default current_date,
  ended_on        date,
  status          text not null default 'active' check (status in ('active','ended')),
  notes           text,
  created_at      timestamptz not null default now(),
  check (ended_on is null or ended_on >= effective_from),
  foreign key (member_id, organization_id)
    references public.members (id, organization_id) on delete cascade,
  foreign key (trainer_id, organization_id)
    references public.staff (id, organization_id) on delete set null
);
create index if not exists member_diet_assignments_member_idx
  on public.member_diet_assignments (member_id, effective_from desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'diet_plans_id_org_key') then
    alter table public.diet_plans
      add constraint diet_plans_id_org_key unique (id, organization_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'member_diet_assignments_plan_org_fk') then
    alter table public.member_diet_assignments
      add constraint member_diet_assignments_plan_org_fk
      foreign key (plan_id, organization_id)
      references public.diet_plans (id, organization_id) on delete restrict;
  end if;
end $$;

alter table public.diet_plans enable row level security;
alter table public.diet_meals enable row level security;
alter table public.diet_meal_items enable row level security;
alter table public.member_diet_assignments enable row level security;

drop policy if exists "diet plans read" on public.diet_plans;
create policy "diet plans read" on public.diet_plans
  for select using (public.is_org_member(organization_id));
drop policy if exists "diet plans write" on public.diet_plans;
create policy "diet plans write" on public.diet_plans
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'));
drop policy if exists "diet plans update" on public.diet_plans;
create policy "diet plans update" on public.diet_plans
  for update using (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'))
  with check (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'));

drop policy if exists "diet meals read" on public.diet_meals;
create policy "diet meals read" on public.diet_meals
  for select using (exists (
    select 1 from public.diet_plans p
    where p.id = plan_id and public.is_org_member(p.organization_id)
  ));
drop policy if exists "diet meals write" on public.diet_meals;
create policy "diet meals write" on public.diet_meals
  for insert with check (exists (
    select 1 from public.diet_plans p
    where p.id = plan_id
      and public.org_has_role(p.organization_id, 'owner', 'manager', 'trainer')
  ));
drop policy if exists "diet meals update" on public.diet_meals;
create policy "diet meals update" on public.diet_meals
  for update using (exists (
    select 1 from public.diet_plans p
    where p.id = plan_id
      and public.org_has_role(p.organization_id, 'owner', 'manager', 'trainer')
  ));

drop policy if exists "diet items read" on public.diet_meal_items;
create policy "diet items read" on public.diet_meal_items
  for select using (exists (
    select 1 from public.diet_meals m
    join public.diet_plans p on p.id = m.plan_id
    where m.id = meal_id and public.is_org_member(p.organization_id)
  ));
drop policy if exists "diet items write" on public.diet_meal_items;
create policy "diet items write" on public.diet_meal_items
  for insert with check (exists (
    select 1 from public.diet_meals m
    join public.diet_plans p on p.id = m.plan_id
    where m.id = meal_id
      and public.org_has_role(p.organization_id, 'owner', 'manager', 'trainer')
  ));

drop policy if exists "diet assignments read" on public.member_diet_assignments;
create policy "diet assignments read" on public.member_diet_assignments
  for select using (public.is_org_member(organization_id));
drop policy if exists "diet assignments write" on public.member_diet_assignments;
create policy "diet assignments write" on public.member_diet_assignments
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'));
drop policy if exists "diet assignments update" on public.member_diet_assignments;
create policy "diet assignments update" on public.member_diet_assignments
  for update using (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'))
  with check (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'));

-- ---------------------------------------------------------------------------
-- Fitness measurements
-- ---------------------------------------------------------------------------
create table if not exists public.fitness_measurements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id       uuid not null,
  measured_on     date not null default current_date,
  weight_kg       numeric(5,2) check (weight_kg is null or (weight_kg > 0 and weight_kg < 500)),
  height_cm       numeric(5,1) check (height_cm is null or (height_cm > 0 and height_cm < 300)),
  body_fat_pct    numeric(4,1) check (body_fat_pct is null or (body_fat_pct >= 0 and body_fat_pct <= 70)),
  chest_cm        numeric(5,1) check (chest_cm is null or (chest_cm > 0 and chest_cm < 300)),
  waist_cm        numeric(5,1) check (waist_cm is null or (waist_cm > 0 and waist_cm < 300)),
  hips_cm         numeric(5,1) check (hips_cm is null or (hips_cm > 0 and hips_cm < 300)),
  arms_cm         numeric(5,1) check (arms_cm is null or (arms_cm > 0 and arms_cm < 300)),
  thighs_cm       numeric(5,1) check (thighs_cm is null or (thighs_cm > 0 and thighs_cm < 300)),
  notes           text,
  recorded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  -- One measurement set per member per day: a second entry is an edit.
  unique (member_id, measured_on),
  check (measured_on <= current_date),
  foreign key (member_id, organization_id)
    references public.members (id, organization_id) on delete cascade
);
create index if not exists fitness_measurements_member_idx
  on public.fitness_measurements (member_id, measured_on desc);

alter table public.fitness_measurements enable row level security;

drop policy if exists "measurements read" on public.fitness_measurements;
create policy "measurements read" on public.fitness_measurements
  for select using (public.is_org_member(organization_id));
drop policy if exists "measurements write" on public.fitness_measurements;
create policy "measurements write" on public.fitness_measurements
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager', 'trainer', 'receptionist'));
drop policy if exists "measurements update" on public.fitness_measurements;
create policy "measurements update" on public.fitness_measurements
  for update using (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'))
  with check (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'));

-- ---------------------------------------------------------------------------
-- Progress photos — private bucket, path must start with the gym id
-- ---------------------------------------------------------------------------
create table if not exists public.member_progress_photos (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id       uuid not null,
  storage_path    text not null,
  taken_on        date not null default current_date,
  notes           text,
  uploaded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (member_id, organization_id)
    references public.members (id, organization_id) on delete cascade
);
create index if not exists member_progress_photos_member_idx
  on public.member_progress_photos (member_id, taken_on desc);

alter table public.member_progress_photos enable row level security;

drop policy if exists "progress photos read" on public.member_progress_photos;
create policy "progress photos read" on public.member_progress_photos
  for select using (public.is_org_member(organization_id));
drop policy if exists "progress photos write" on public.member_progress_photos;
create policy "progress photos write" on public.member_progress_photos
  for insert with check (public.org_has_role(organization_id, 'owner', 'manager', 'trainer'));
drop policy if exists "progress photos delete" on public.member_progress_photos;
create policy "progress photos delete" on public.member_progress_photos
  for delete using (public.org_has_role(organization_id, 'owner', 'manager'));

-- Private bucket. Uploads are namespaced by organization id so the storage
-- policies below can authorize on the first path segment alone.
insert into storage.buckets (id, name, public)
values ('member-photos', 'member-photos', false)
on conflict (id) do nothing;

drop policy if exists "member photos read" on storage.objects;
create policy "member photos read" on storage.objects
  for select using (
    bucket_id = 'member-photos'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "member photos write" on storage.objects;
create policy "member photos write" on storage.objects
  for insert with check (
    bucket_id = 'member-photos'
    and public.org_has_role((storage.foldername(name))[1]::uuid, 'owner', 'manager', 'trainer', 'receptionist')
  );

drop policy if exists "member photos delete" on storage.objects;
create policy "member photos delete" on storage.objects
  for delete using (
    bucket_id = 'member-photos'
    and public.org_has_role((storage.foldername(name))[1]::uuid, 'owner', 'manager')
  );

-- ---------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------
create table if not exists public.activity_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id       uuid,
  actor_id        uuid references auth.users(id) on delete set null,
  action          text not null,
  detail          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists activity_log_org_idx on public.activity_log (organization_id, created_at desc);
create index if not exists activity_log_member_idx on public.activity_log (member_id, created_at desc);

alter table public.activity_log enable row level security;

drop policy if exists "activity read" on public.activity_log;
create policy "activity read" on public.activity_log
  for select using (public.org_has_role(organization_id, 'owner', 'manager', 'trainer', 'receptionist', 'finance'));

-- Writes go through SECURITY DEFINER helpers only; no insert policy on purpose.

create or replace function public.log_activity(
  p_org uuid,
  p_member uuid,
  p_action text,
  p_detail jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.activity_log (organization_id, member_id, actor_id, action, detail)
  values (p_org, p_member, auth.uid(), p_action, coalesce(p_detail, '{}'::jsonb));
$$;

revoke execute on function public.log_activity(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.log_activity(uuid, uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- create_member — server-generated member code, duplicate guard, role check
-- ---------------------------------------------------------------------------
create or replace function public.create_member(
  p_organization_id uuid,
  p_first_name text,
  p_last_name text default '',
  p_phone text default null,
  p_email text default null,
  p_date_of_birth date default null,
  p_gender text default null,
  p_address text default null,
  p_emergency_name text default null,
  p_emergency_phone text default null,
  p_joined_on date default null,
  p_trainer_id uuid default null,
  p_photo_url text default null,
  p_fitness_goals text default null,
  p_notes text default null
)
returns public.members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_num integer;
  v_existing public.members;
  v_row public.members;
  v_phone text := nullif(trim(p_phone), '');
begin
  if not public.org_has_role(p_organization_id, 'owner', 'manager', 'receptionist') then
    raise exception 'You do not have permission to register members' using errcode = '42501';
  end if;
  if p_first_name is null or char_length(trim(p_first_name)) < 1 then
    raise exception 'A first name is required';
  end if;
  if v_phone is null then
    raise exception 'A phone number is required';
  end if;
  if v_phone !~ '^[0-9+() -]{6,20}$' then
    raise exception 'That phone number does not look right';
  end if;
  if p_email is not null and p_email <> '' and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address does not look right';
  end if;
  if p_gender is not null and p_gender not in ('male','female','other') then
    raise exception 'Unsupported gender value';
  end if;
  if p_trainer_id is not null and not exists (
    select 1 from public.staff s
    where s.id = p_trainer_id and s.organization_id = p_organization_id
  ) then
    raise exception 'That trainer does not work at this gym';
  end if;
  if p_joined_on is not null and p_joined_on > current_date then
    raise exception 'Joining date cannot be in the future';
  end if;
  if p_date_of_birth is not null and p_date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future';
  end if;

  -- Duplicate guard: same phone, or same email, among members that are not
  -- archived. Archived records are history and stay untouched.
  select * into v_existing from public.members m
  where m.organization_id = p_organization_id
    and m.status <> 'archived'
    and (
      regexp_replace(m.phone, '[^0-9]', '', 'g') = regexp_replace(v_phone, '[^0-9]', '', 'g')
      or (
        nullif(trim(p_email), '') is not null
        and lower(m.email) = lower(trim(p_email))
      )
    )
  limit 1;
  if found then
    raise exception 'A member with this phone or email already exists (% )', v_existing.member_code
      using errcode = '23505';
  end if;

  -- Collision-safe code: the counter row is locked for the duration of the
  -- transaction, so two concurrent registrations can never share a number.
  insert into public.org_member_counters (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id)
    do update set last_number = public.org_member_counters.last_number + 1
  returning last_number into v_num;

  v_code := 'M-' || lpad(v_num::text, 4, '0');

  insert into public.members (
    organization_id, member_code, first_name, last_name, email, phone,
    date_of_birth, gender, address, emergency_contact_name,
    emergency_contact_phone, trainer_id, joined_on, photo_url, notes
  ) values (
    p_organization_id, v_code, trim(p_first_name), coalesce(trim(p_last_name), ''),
    nullif(trim(p_email), ''), v_phone, p_date_of_birth, p_gender, p_address,
    p_emergency_name, p_emergency_phone, p_trainer_id,
    coalesce(p_joined_on, current_date), p_photo_url,
    nullif(trim(coalesce(p_notes, '') || case
      when nullif(trim(coalesce(p_fitness_goals, '')), '') is null then ''
      else E'\n\nFitness goals: ' || trim(p_fitness_goals)
    end), '')
  )
  returning * into v_row;

  perform public.log_activity(
    p_organization_id, v_row.id, 'member.created',
    jsonb_build_object('member_code', v_row.member_code)
  );

  return v_row;
end;
$$;

revoke execute on function public.create_member(uuid,text,text,text,text,date,text,text,text,text,date,uuid,text,text,text) from public, anon;
grant execute on function public.create_member(uuid,text,text,text,text,date,text,text,text,text,date,uuid,text,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- record_attendance — idempotent within a short window
-- ---------------------------------------------------------------------------
-- The open-checkin index from 0001 stops a second entry while someone is
-- still inside. This also collapses an accidental double tap: a second call
-- inside three hours returns the first row instead of writing another.
create or replace function public.record_attendance(
  p_organization_id uuid,
  p_member_id uuid,
  p_branch_id uuid default null
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.attendance;
begin
  if not public.org_has_role(p_organization_id, 'owner', 'manager', 'receptionist', 'trainer') then
    raise exception 'You do not have permission to record attendance' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.members m
    where m.id = p_member_id and m.organization_id = p_organization_id
  ) then
    raise exception 'That member is not in this gym';
  end if;
  if exists (
    select 1 from public.members m
    where m.id = p_member_id and m.status <> 'active'
  ) then
    raise exception 'This member is not active';
  end if;

  select * into v_row from public.attendance a
  where a.member_id = p_member_id
    and a.check_in > now() - interval '3 hours'
  order by a.check_in desc
  limit 1;
  if found then
    return v_row;
  end if;

  insert into public.attendance (organization_id, branch_id, member_id, method)
  values (p_organization_id, p_branch_id, p_member_id, 'manual')
  returning * into v_row;

  perform public.log_activity(
    p_organization_id, p_member_id, 'attendance.checked_in',
    jsonb_build_object('attendance_id', v_row.id)
  );
  return v_row;
end;
$$;

revoke execute on function public.record_attendance(uuid, uuid, uuid) from public, anon;
grant execute on function public.record_attendance(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- renew_membership — dates only; payments stay separate
-- ---------------------------------------------------------------------------
create or replace function public.renew_membership(
  p_organization_id uuid,
  p_membership_id uuid,
  p_new_end_date date,
  p_amount_minor integer default 0,
  p_note text default null
)
returns public.member_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.member_memberships;
  v_prev date;
begin
  if not public.org_has_role(p_organization_id, 'owner', 'manager', 'receptionist') then
    raise exception 'You do not have permission to renew memberships' using errcode = '42501';
  end if;

  select * into v_row from public.member_memberships mm
  where mm.id = p_membership_id and mm.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'That membership does not exist in this gym';
  end if;

  v_prev := v_row.end_date;
  if p_new_end_date is null or p_new_end_date <= v_prev then
    raise exception 'The new end date must be after the current one (%)', v_prev;
  end if;

  update public.member_memberships
     set end_date = p_new_end_date,
         status = 'active'
   where id = p_membership_id
   returning * into v_row;

  insert into public.membership_renewals (
    organization_id, membership_id, member_id, previous_end_date,
    new_end_date, extended_days, amount_minor, note, renewed_by
  ) values (
    p_organization_id, p_membership_id, v_row.member_id, v_prev,
    p_new_end_date, (p_new_end_date - v_prev), coalesce(p_amount_minor, 0),
    p_note, auth.uid()
  );

  -- Deliberately does not touch public.payments: extending dates is not a
  -- payment, and a pending invoice stays pending until money is recorded.
  perform public.log_activity(
    p_organization_id, v_row.member_id, 'membership.renewed',
    jsonb_build_object('membership_id', p_membership_id, 'from', v_prev, 'to', p_new_end_date)
  );

  return v_row;
end;
$$;

revoke execute on function public.renew_membership(uuid, uuid, date, integer, text) from public, anon;
grant execute on function public.renew_membership(uuid, uuid, date, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- assign_membership — price and plan name resolved from the plan row
-- ---------------------------------------------------------------------------
create or replace function public.assign_membership(
  p_organization_id uuid,
  p_member_id uuid,
  p_plan_id uuid,
  p_start_date date default null
)
returns public.member_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.membership_plans;
  v_row public.member_memberships;
  v_start date := coalesce(p_start_date, current_date);
begin
  if not public.org_has_role(p_organization_id, 'owner', 'manager', 'receptionist') then
    raise exception 'You do not have permission to assign memberships' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.members m
    where m.id = p_member_id and m.organization_id = p_organization_id
  ) then
    raise exception 'That member is not in this gym';
  end if;

  select * into v_plan from public.membership_plans p
  where p.id = p_plan_id and p.organization_id = p_organization_id;
  if not found then
    raise exception 'That plan does not exist in this gym';
  end if;

  insert into public.member_memberships (
    organization_id, member_id, plan_id, plan_name, price_minor,
    start_date, end_date, status
  ) values (
    p_organization_id, p_member_id, v_plan.id, v_plan.name, v_plan.price_minor,
    v_start, v_start + v_plan.duration_days, 'active'
  )
  returning * into v_row;

  perform public.log_activity(
    p_organization_id, p_member_id, 'membership.assigned',
    jsonb_build_object('plan', v_plan.name, 'end_date', v_row.end_date)
  );
  return v_row;
end;
$$;

revoke execute on function public.assign_membership(uuid, uuid, uuid, date) from public, anon;
grant execute on function public.assign_membership(uuid, uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- assign_workout / assign_diet — end the previous assignment, keep history
-- ---------------------------------------------------------------------------
create or replace function public.assign_workout_plan(
  p_organization_id uuid,
  p_member_id uuid,
  p_plan_id uuid,
  p_trainer_id uuid default null,
  p_effective_from date default null,
  p_notes text default null
)
returns public.member_workout_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.member_workout_assignments;
  v_start date := coalesce(p_effective_from, current_date);
begin
  if not public.org_has_role(p_organization_id, 'owner', 'manager', 'trainer') then
    raise exception 'You do not have permission to assign workout plans' using errcode = '42501';
  end if;

  update public.member_workout_assignments
     set status = 'ended', ended_on = v_start
   where member_id = p_member_id
     and organization_id = p_organization_id
     and status = 'active'
     and ended_on is null;

  insert into public.member_workout_assignments (
    organization_id, member_id, plan_id, trainer_id,
    assigned_by, effective_from, notes
  ) values (
    p_organization_id, p_member_id, p_plan_id, p_trainer_id,
    auth.uid(), v_start, p_notes
  )
  returning * into v_row;

  perform public.log_activity(
    p_organization_id, p_member_id, 'workout.assigned',
    jsonb_build_object('plan_id', p_plan_id)
  );
  return v_row;
end;
$$;

create or replace function public.assign_diet_plan(
  p_organization_id uuid,
  p_member_id uuid,
  p_plan_id uuid,
  p_trainer_id uuid default null,
  p_effective_from date default null,
  p_notes text default null
)
returns public.member_diet_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.member_diet_assignments;
  v_start date := coalesce(p_effective_from, current_date);
begin
  if not public.org_has_role(p_organization_id, 'owner', 'manager', 'trainer') then
    raise exception 'You do not have permission to assign diet plans' using errcode = '42501';
  end if;

  update public.member_diet_assignments
     set status = 'ended', ended_on = v_start
   where member_id = p_member_id
     and organization_id = p_organization_id
     and status = 'active'
     and ended_on is null;

  insert into public.member_diet_assignments (
    organization_id, member_id, plan_id, trainer_id,
    assigned_by, effective_from, notes
  ) values (
    p_organization_id, p_member_id, p_plan_id, p_trainer_id,
    auth.uid(), v_start, p_notes
  )
  returning * into v_row;

  perform public.log_activity(
    p_organization_id, p_member_id, 'diet.assigned',
    jsonb_build_object('plan_id', p_plan_id)
  );
  return v_row;
end;
$$;

revoke execute on function public.assign_workout_plan(uuid, uuid, uuid, uuid, date, text) from public, anon;
grant execute on function public.assign_workout_plan(uuid, uuid, uuid, uuid, date, text) to authenticated;
revoke execute on function public.assign_diet_plan(uuid, uuid, uuid, uuid, date, text) from public, anon;
grant execute on function public.assign_diet_plan(uuid, uuid, uuid, uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- record_payment — validates the member/membership pair belongs to the gym
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(
  p_organization_id uuid,
  p_member_id uuid,
  p_amount_minor integer,
  p_method text default 'cash',
  p_status text default 'paid',
  p_membership_id uuid default null,
  p_invoice_id uuid default null,
  p_paid_on date default null,
  p_description text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payments;
begin
  if not public.org_has_role(p_organization_id, 'owner', 'manager', 'receptionist', 'finance') then
    raise exception 'You do not have permission to record payments' using errcode = '42501';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;
  if p_method not in ('cash','upi','card','bank_transfer','other') then
    raise exception 'Unsupported payment method';
  end if;
  if p_status not in ('paid','pending','failed','refunded') then
    raise exception 'Unsupported payment status';
  end if;
  if not exists (
    select 1 from public.members m
    where m.id = p_member_id and m.organization_id = p_organization_id
  ) then
    raise exception 'That member is not in this gym';
  end if;
  if p_membership_id is not null and not exists (
    select 1 from public.member_memberships mm
    where mm.id = p_membership_id
      and mm.organization_id = p_organization_id
      and mm.member_id = p_member_id
  ) then
    raise exception 'That membership does not belong to this member';
  end if;
  if p_invoice_id is not null and not exists (
    select 1 from public.invoices i
    where i.id = p_invoice_id
      and i.organization_id = p_organization_id
      and i.member_id = p_member_id
  ) then
    raise exception 'That invoice does not belong to this member';
  end if;

  insert into public.payments (
    organization_id, member_id, membership_id, invoice_id, amount_minor,
    method, status, paid_on, description, recorded_by
  ) values (
    p_organization_id, p_member_id, p_membership_id, p_invoice_id,
    p_amount_minor, p_method, p_status, coalesce(p_paid_on, current_date),
    p_description, auth.uid()
  )
  returning * into v_row;

  perform public.log_activity(
    p_organization_id, p_member_id, 'payment.recorded',
    jsonb_build_object('amount_minor', p_amount_minor, 'status', p_status)
  );
  return v_row;
end;
$$;

revoke execute on function public.record_payment(uuid, uuid, integer, text, text, uuid, uuid, date, text) from public, anon;
grant execute on function public.record_payment(uuid, uuid, integer, text, text, uuid, uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Activity log read helper — one page of history for a member
-- ---------------------------------------------------------------------------
create or replace function public.member_activity(p_organization_id uuid, p_member_id uuid, p_limit integer default 50)
returns setof public.activity_log
language sql
security definer
set search_path = public
stable
as $$
  select * from public.activity_log a
  where a.organization_id = p_organization_id
    and a.member_id = p_member_id
    and public.org_has_role(p_organization_id, 'owner', 'manager', 'trainer', 'receptionist', 'finance')
  order by a.created_at desc
  limit least(coalesce(p_limit, 50), 200);
$$;

revoke execute on function public.member_activity(uuid, uuid, integer) from public, anon;
grant execute on function public.member_activity(uuid, uuid, integer) to authenticated;

-- ======================================================================
-- 0007_member_accounts.sql
-- ======================================================================
-- TwoPlus.fit — 0007_member_accounts
--
-- Links a gym member row to a sign-in identity and grants that identity
-- read access to their own records only.
--
-- Runs AFTER 0006: the self-read policies below reference tables 0006
-- creates (fitness_measurements, member_progress_photos,
-- member_workout_assignments, member_diet_assignments).
--
-- Re-runnable: every object is created with "if not exists" or replaced.

-- ---------------------------------------------------------------------------
-- Identity link
--
-- A member row gets an optional user_id. Staff are NOT added to
-- organization_members (that table's role check stays staff-only): members
-- are linked purely through this column. That keeps the existing
-- is_org_member() read policies from leaking the whole member directory to
-- a member account.
-- ---------------------------------------------------------------------------
alter table public.members
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- One identity per member row, and one member row per identity.
create unique index if not exists members_user_id_unique
  on public.members (user_id)
  where user_id is not null;

create index if not exists members_lower_email_idx
  on public.members (lower(email))
  where email is not null;

-- ---------------------------------------------------------------------------
-- Member self-service read policies
--
-- Postgres ORs policies of the same command, so staff keep today's org-wide
-- view while a member additionally sees exactly their own rows.
-- ---------------------------------------------------------------------------
create policy "members read self" on public.members
  for select using (user_id = auth.uid());

create policy "memberships read self" on public.member_memberships
  for select using (
    exists (
      select 1 from public.members m
      where m.id = member_id and m.user_id = auth.uid()
    )
  );

create policy "payments read self" on public.payments
  for select using (
    exists (
      select 1 from public.members m
      where m.id = member_id and m.user_id = auth.uid()
    )
  );

create policy "attendance read self" on public.attendance
  for select using (
    exists (
      select 1 from public.members m
      where m.id = member_id and m.user_id = auth.uid()
    )
  );

create policy "workout assignments read self" on public.member_workout_assignments
  for select using (
    exists (
      select 1 from public.members m
      where m.id = member_id and m.user_id = auth.uid()
    )
  );

create policy "diet assignments read self" on public.member_diet_assignments
  for select using (
    exists (
      select 1 from public.members m
      where m.id = member_id and m.user_id = auth.uid()
    )
  );

create policy "measurements read self" on public.fitness_measurements
  for select using (
    exists (
      select 1 from public.members m
      where m.id = member_id and m.user_id = auth.uid()
    )
  );

create policy "progress photos read self" on public.member_progress_photos
  for select using (
    exists (
      select 1 from public.members m
      where m.id = member_id and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Claim your member account.
--
-- The invite is the pre-created member row whose email matches the signed-in
-- user's verified email. Calling this stamps user_id; the caller then reads
-- their own records through the self-policies above. Email ownership is the
-- verification: the function is security definer so it can write the link
-- the RLS would otherwise block.
-- ---------------------------------------------------------------------------
create or replace function public.claim_member_account()
returns uuid
language sql
security definer
set search_path = public
as $$
  update public.members m
    set user_id = auth.uid()
  where lower(m.email) = lower(auth.jwt() ->> 'email')
    and m.user_id is null
    and exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and lower(u.email) = lower(m.email)
    )
  returning m.id;
$$;

revoke all on function public.claim_member_account() from public;
grant execute on function public.claim_member_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Not in this migration
--  - Announcements: no table exists yet (community/P2); member access to gym
--    announcements comes with that table.
--  - Progress photo bytes: the storage bucket needs its own object-level
--    policy once the bucket exists.
--  - Member profile edits: deliberately read-only for members for now.
-- ---------------------------------------------------------------------------

-- ======================================================================
-- 0008_workspace_media.sql
-- ======================================================================
-- TwoPlus.fit — 0008_workspace_media
--
-- Public bucket for workspace custom background images. Objects are
-- namespaced by organization id (<org>/<file>) so the storage policies can
-- authorize on the first path segment alone, mirroring 0006's
-- member-photos bucket.
--
-- Re-runnable: every object is created with "if not exists" or replaced.

insert into storage.buckets (id, name, public)
values ('workspace-media', 'workspace-media', true)
on conflict (id) do nothing;

drop policy if exists "workspace media read" on storage.objects;
create policy "workspace media read" on storage.objects
  for select using (
    bucket_id = 'workspace-media'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "workspace media write" on storage.objects;
create policy "workspace media write" on storage.objects
  for insert with check (
    bucket_id = 'workspace-media'
    and public.org_has_role((storage.foldername(name))[1]::uuid, 'owner')
  );

drop policy if exists "workspace media update" on storage.objects;
create policy "workspace media update" on storage.objects
  for update using (
    bucket_id = 'workspace-media'
    and public.org_has_role((storage.foldername(name))[1]::uuid, 'owner')
  )
  with check (
    bucket_id = 'workspace-media'
    and public.org_has_role((storage.foldername(name))[1]::uuid, 'owner')
  );

drop policy if exists "workspace media delete" on storage.objects;
create policy "workspace media delete" on storage.objects
  for delete using (
    bucket_id = 'workspace-media'
    and public.org_has_role((storage.foldername(name))[1]::uuid, 'owner')
  );

-- ======================================================================
-- 0009_member_plan_read.sql
-- ======================================================================
-- TwoPlus.fit — 0009_member_plan_read
--
-- Grant a signed-in member read access to the workout and diet plan rows that
-- are assigned to them. 0007 already grants self-read on the assignment
-- tables; this extends that to the plan catalogs and their children so the
-- member app can render plan details without exposing other members' plans.
--
-- Re-runnable: every policy is dropped before being recreated.
--
-- NOTE on column qualification: every column in the WHERE clause is fully
-- qualified (table alias or policy-table name) because the EXISTS subqueries
-- join several tables that share column names (id, plan_id, organization_id).
-- Unqualified references raise 42702 (ambiguous column).

drop policy if exists "workout plans read member" on public.workout_plans;
create policy "workout plans read member" on public.workout_plans
  for select using (
    exists (
      select 1
      from public.member_workout_assignments a
      join public.members m on m.id = a.member_id
      where a.plan_id = workout_plans.id
        and a.organization_id = workout_plans.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "workout exercises read member" on public.workout_exercises;
create policy "workout exercises read member" on public.workout_exercises
  for select using (
    exists (
      select 1
      from public.member_workout_assignments a
      join public.members m on m.id = a.member_id
      where a.plan_id = workout_exercises.plan_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "diet plans read member" on public.diet_plans;
create policy "diet plans read member" on public.diet_plans
  for select using (
    exists (
      select 1
      from public.member_diet_assignments a
      join public.members m on m.id = a.member_id
      where a.plan_id = diet_plans.id
        and a.organization_id = diet_plans.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "diet meals read member" on public.diet_meals;
create policy "diet meals read member" on public.diet_meals
  for select using (
    exists (
      select 1
      from public.member_diet_assignments a
      join public.members m on m.id = a.member_id
      where a.plan_id = diet_meals.plan_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "diet items read member" on public.diet_meal_items;
create policy "diet items read member" on public.diet_meal_items
  for select using (
    exists (
      select 1
      from public.diet_meals ml
      join public.member_diet_assignments a on a.plan_id = ml.plan_id
      join public.members m on m.id = a.member_id
      where ml.id = diet_meal_items.meal_id
        and m.user_id = auth.uid()
    )
  );

-- ======================================================================
-- 0010_remove_workspace.sql
-- ======================================================================
-- 0010_remove_workspace.sql
--
-- Owner-only workspace removal. Deleting an organization cascades through every
-- child table (0001 declares on delete cascade on all of them), so one delete is
-- enough; the RPC exists to enforce the owner check in one place and to give the
-- client something to call that is not a raw delete on a table.
--
-- Not applied yet. Until it is, api.removeWorkspace() surfaces a clear message
-- and the UI stays disabled rather than pretending the action worked.

drop policy if exists "org delete owner" on public.organizations;
create policy "org delete owner" on public.organizations
  for delete using (public.org_has_role(id, 'owner'));

create or replace function public.delete_organization(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.org_has_role(target, 'owner') then
    raise exception 'Only the workspace owner can remove this workspace'
      using errcode = '42501';
  end if;

  delete from public.organizations where id = target;
end;
$$;

-- The function is invoked through PostgREST, so authenticated callers need the
-- grant even though the body re-checks ownership.
revoke all on function public.delete_organization(uuid) from public;
grant execute on function public.delete_organization(uuid) to authenticated;

-- ======================================================================
-- 0011_harden_member_claim.sql
-- ======================================================================
-- TwoPlus.fit — 0011_harden_member_claim
--
-- Closes two defects in public.claim_member_account() (0007):
--
--   1. It trusted the email claim inside the JWT. That value is whatever the
--      caller signed up with, so any account could claim a member row by
--      registering a matching address. The guard now reads the address from
--      auth.users and requires email_confirmed_at, which the caller cannot set.
--
--   2. It could link a member row that was already linked to a different
--      identity, and could pick an arbitrary row when an address matched more
--      than one gym. Ambiguous matches are now refused.
--
-- IMPORTANT: check (1) is only sound when the Supabase project has "Confirm
-- email" ENABLED (Authentication → Providers → Email). With autoconfirm on,
-- GoTrue stamps email_confirmed_at at signup, so a confirmed timestamp proves
-- nothing about who owns the address and this function cannot tell the
-- difference. TwoPlus must ship with confirmations on; see docs/SECURITY.md.
-- An invite-code claim (gym issues a single-use token) would remove the
-- dependency on email entirely and is the recommended follow-up.
--
-- The invite path is unchanged: the gym pre-creates the member row with the
-- member's address, the member signs up and confirms, then claims.
--
-- Re-runnable: the function is replaced; the index and trigger are dropped
-- first.

-- ---------------------------------------------------------------------------
-- Fast path for the claim lookup and for lower(email) checks elsewhere.
-- ---------------------------------------------------------------------------
create index if not exists members_org_email_idx
  on public.members (organization_id, lower(email))
  where email is not null;

-- ---------------------------------------------------------------------------
-- Hardened claim.
--
-- SECURITY DEFINER with a pinned search_path; every comparison is against the
-- auth store rather than against a claim the caller controls.
-- ---------------------------------------------------------------------------
create or replace function public.claim_member_account()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_count integer;
  v_member uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select lower(u.email)
    into v_email
    from auth.users u
   where u.id = v_uid
     and u.email_confirmed_at is not null;

  if v_email is null then
    raise exception 'Confirm your email address before linking your gym account'
      using errcode = '28000';
  end if;

  -- Exactly one unclaimed row must match. Two matches means the person is on
  -- two gym rosters (or one address was reused); assigning either would expose
  -- records, so both are left for the gyms to resolve.
  select count(*)
    into v_count
    from public.members m
   where lower(m.email) = v_email
     and m.user_id is null;

  if v_count <> 1 then
    -- Deliberately returns null for 0 and for >1: the UI keeps its "ask your
    -- gym" message and nothing is disclosed about which case applies.
    return null;
  end if;

  select m.id
    into v_member
    from public.members m
   where lower(m.email) = v_email
     and m.user_id is null;

  -- The `and user_id is null` guard makes this a compare-and-set: a concurrent
  -- claim loses the race and updates nothing.
  update public.members
     set user_id = v_uid
   where id = v_member
     and user_id is null;

  if not found then
    return null;
  end if;

  return v_member;
end;
$$;

revoke all on function public.claim_member_account() from public;
grant execute on function public.claim_member_account() to authenticated;

-- ---------------------------------------------------------------------------
-- A linked row cannot be moved to a different sign-in identity. Unlinking
-- (user_id → null) stays available to staff so a wrong link can be corrected.
-- ---------------------------------------------------------------------------
create or replace function public.members_keep_link()
returns trigger
language plpgsql
as $$
begin
  if old.user_id is not null
     and new.user_id is not null
     and new.user_id <> old.user_id then
    raise exception 'This member account is already linked to a different sign-in'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists members_keep_link on public.members;
create trigger members_keep_link before update of user_id on public.members
  for each row execute function public.members_keep_link();

-- ======================================================================
-- 0012_workout_logging.sql
-- ======================================================================
-- TwoPlus.fit — 0012_workout_logging
--
-- The member application could show a workout plan but had no way to record
-- that it happened: no table stored a completed session, so progress,
-- consistency and personal records had nothing real to read. This adds the two
-- tables that make those figures possible, plus the RLS that keeps each
-- member's log private to them and visible to their own gym's staff.
--
-- Two tables rather than one because a session is the unit of attendance and
-- "did I train today", while a set is the unit of strength progress. Storing
-- both in one row would make per-exercise history a client-side aggregation.
--
-- Re-runnable: everything is `if not exists` or dropped before creation.

-- ---------------------------------------------------------------------------
-- A completed (or in-progress) training session.
-- ---------------------------------------------------------------------------
create table if not exists public.workout_sessions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  -- Nulled rather than blocked when a plan is retired: the session still
  -- happened, and history must survive the plan being deleted.
  plan_id         uuid references public.workout_plans(id) on delete set null,
  assignment_id   uuid references public.member_workout_assignments(id) on delete set null,
  performed_on    date not null default current_date,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 0 and 1440),
  note            text check (note is null or char_length(note) <= 2000),
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists workout_sessions_member_idx
  on public.workout_sessions (member_id, performed_on desc);
create index if not exists workout_sessions_org_idx
  on public.workout_sessions (organization_id, performed_on desc);

-- One session per member per day per assignment. The member UI writes this on
-- every "finish workout" tap, so the constraint makes the write idempotent
-- instead of relying on the client to remember it already sent one.
create unique index if not exists workout_sessions_member_day_key
  on public.workout_sessions (
    member_id,
    performed_on,
    coalesce(assignment_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- ---------------------------------------------------------------------------
-- The individual sets inside a session.
-- ---------------------------------------------------------------------------
create table if not exists public.workout_sets (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.workout_sessions(id) on delete cascade,
  -- Nulled, not blocked, when an exercise is edited out of a plan: the set is
  -- still a true record of what was lifted.
  exercise_id uuid references public.workout_exercises(id) on delete set null,
  -- Kept even when exercise_id is null, so history stays readable.
  exercise_name text not null check (char_length(trim(exercise_name)) > 0),
  set_number  integer not null check (set_number > 0),
  reps        integer check (reps is null or reps >= 0),
  weight_kg   numeric(7, 2) check (weight_kg is null or weight_kg >= 0),
  created_at  timestamptz not null default now(),
  unique (session_id, set_number)
);

create index if not exists workout_sets_session_idx
  on public.workout_sets (session_id, set_number);

-- ---------------------------------------------------------------------------
-- Row Level Security.
--
-- Members reach their own rows through members.user_id = auth.uid(), the same
-- gate 0007 uses everywhere else. Staff reach rows inside their own gym only,
-- which is what org_has_role already enforces.
-- ---------------------------------------------------------------------------
alter table public.workout_sessions enable row level security;
alter table public.workout_sets     enable row level security;

drop policy if exists "workout sessions read own" on public.workout_sessions;
create policy "workout sessions read own" on public.workout_sessions
  for select to authenticated
  using (
    exists (
      select 1 from public.members m
       where m.id = workout_sessions.member_id
         and m.user_id = auth.uid()
    )
  );

drop policy if exists "workout sessions insert own" on public.workout_sessions;
create policy "workout sessions insert own" on public.workout_sessions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.members m
       where m.id = workout_sessions.member_id
         and m.user_id = auth.uid()
         and m.organization_id = workout_sessions.organization_id
    )
  );

drop policy if exists "workout sessions update own" on public.workout_sessions;
create policy "workout sessions update own" on public.workout_sessions
  for update to authenticated
  using (
    exists (
      select 1 from public.members m
       where m.id = workout_sessions.member_id
         and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.members m
       where m.id = workout_sessions.member_id
         and m.user_id = auth.uid()
    )
  );

drop policy if exists "workout sessions delete own" on public.workout_sessions;
create policy "workout sessions delete own" on public.workout_sessions
  for delete to authenticated
  using (
    exists (
      select 1 from public.members m
       where m.id = workout_sessions.member_id
         and m.user_id = auth.uid()
    )
  );

drop policy if exists "workout sessions staff read" on public.workout_sessions;
create policy "workout sessions staff read" on public.workout_sessions
  for select to authenticated
  using (
    public.org_has_role(
      organization_id,
      'owner'::text, 'manager'::text, 'trainer'::text
    )
  );

-- Sets inherit their session's owner: a member may only write sets into a
-- session they own, which also stops a crafted session_id from attaching a set
-- to somebody else's record.
drop policy if exists "workout sets read own" on public.workout_sets;
create policy "workout sets read own" on public.workout_sets
  for select to authenticated
  using (
    exists (
      select 1
        from public.workout_sessions s
        join public.members m on m.id = s.member_id
       where s.id = workout_sets.session_id
         and m.user_id = auth.uid()
    )
  );

drop policy if exists "workout sets insert own" on public.workout_sets;
create policy "workout sets insert own" on public.workout_sets
  for insert to authenticated
  with check (
    exists (
      select 1
        from public.workout_sessions s
        join public.members m on m.id = s.member_id
       where s.id = workout_sets.session_id
         and m.user_id = auth.uid()
    )
  );

drop policy if exists "workout sets delete own" on public.workout_sets;
create policy "workout sets delete own" on public.workout_sets
  for delete to authenticated
  using (
    exists (
      select 1
        from public.workout_sessions s
        join public.members m on m.id = s.member_id
       where s.id = workout_sets.session_id
         and m.user_id = auth.uid()
    )
  );

drop policy if exists "workout sets staff read" on public.workout_sets;
create policy "workout sets staff read" on public.workout_sets
  for select to authenticated
  using (
    exists (
      select 1 from public.workout_sessions s
       where s.id = workout_sets.session_id
         and public.org_has_role(
           s.organization_id,
           'owner'::text, 'manager'::text, 'trainer'::text
         )
    )
  );

-- ======================================================================
-- 0013_member_class_booking.sql
-- ======================================================================
-- 0013 — member class booking
--
-- Members are deliberately not rows in organization_members (0007), so every
-- policy that gates on is_org_member() is invisible to them. Without this
-- migration a signed-in member sees no classes and cannot book.
--
-- Booking is a security-relevant write: capacity and class state must be
-- enforced in the database, not in the client, because a member can call
-- PostgREST directly. book_class() is SECURITY DEFINER and therefore bypasses
-- RLS, so it re-checks ownership, gym, class state and capacity itself.

-- ---------------------------------------------------------------------------
-- Read access: a member sees their own gym's scheduled classes.
-- ---------------------------------------------------------------------------
drop policy if exists "classes read for own member" on public.classes;
create policy "classes read for own member" on public.classes
  for select using (
    exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and m.organization_id = classes.organization_id
    )
  );

-- A member sees their own bookings (other members' bookings stay private).
drop policy if exists "bookings read for own member" on public.class_bookings;
create policy "bookings read for own member" on public.class_bookings
  for select using (
    exists (
      select 1
      from public.members m
      where m.id = class_bookings.member_id
        and m.user_id = auth.uid()
    )
  );

-- Cancelling own booking only. The status check in the with-clause stops a
-- member from flipping a cancelled booking back to 'booked' (which would let
-- them bypass the capacity check in book_class()).
drop policy if exists "bookings cancel own" on public.class_bookings;
create policy "bookings cancel own" on public.class_bookings
  for update using (
    exists (
      select 1
      from public.members m
      where m.id = class_bookings.member_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    status = 'cancelled'
    and exists (
      select 1
      from public.members m
      where m.id = class_bookings.member_id
        and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- book_class: idempotent, capacity-checked booking.
--
-- Returns the booking id. Booking twice returns the same row rather than
-- failing, so a double-tap or a retried request is harmless.
-- ---------------------------------------------------------------------------
create or replace function public.book_class(p_class_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_member   public.members%rowtype;
  v_class    public.classes%rowtype;
  v_booked   integer;
  v_booking  uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into v_member
  from public.members m
  where m.user_id = v_uid;

  if not found then
    raise exception 'No member record is linked to this account'
      using errcode = '42501';
  end if;

  -- Lock the class row so two members booking the last spot cannot both pass
  -- the capacity check. Without this the count below races.
  select * into v_class
  from public.classes c
  where c.id = p_class_id
  for update;

  if not found then
    raise exception 'That class does not exist' using errcode = 'P0002';
  end if;

  if v_class.organization_id <> v_member.organization_id then
    raise exception 'That class belongs to another gym' using errcode = '42501';
  end if;

  if v_class.status <> 'scheduled' then
    raise exception 'That class is not open for booking' using errcode = '22000';
  end if;

  if v_class.starts_at <= now() then
    raise exception 'That class has already started' using errcode = '22000';
  end if;

  -- Already booked (and not cancelled): return the existing row untouched.
  select b.id into v_booking
  from public.class_bookings b
  where b.class_id = p_class_id
    and b.member_id = v_member.id
    and b.status <> 'cancelled';

  if v_booking is not null then
    return v_booking;
  end if;

  select count(*) into v_booked
  from public.class_bookings b
  where b.class_id = p_class_id
    and b.status = 'booked';

  if v_booked >= v_class.capacity then
    raise exception 'That class is full' using errcode = '22000';
  end if;

  -- unique (class_id, member_id) means a previously cancelled booking has to be
  -- reopened rather than inserted again.
  insert into public.class_bookings (organization_id, class_id, member_id, status)
  values (v_class.organization_id, p_class_id, v_member.id, 'booked')
  on conflict (class_id, member_id) do update
    set status = 'booked'
  returning id into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.book_class(uuid) from public;
grant execute on function public.book_class(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_class_booking: own booking only.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_class_booking(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  update public.class_bookings b
     set status = 'cancelled'
   where b.class_id = p_class_id
     and b.status = 'booked'
     and exists (
       select 1
       from public.members m
       where m.id = b.member_id
         and m.user_id = v_uid
     );

  if not found then
    raise exception 'No booking to cancel' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.cancel_class_booking(uuid) from public;
grant execute on function public.cancel_class_booking(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- class_seats: seat counts for the caller's own gym.
--
-- A member cannot count other members' bookings through RLS, and they should
-- not be able to see who booked. This returns only an aggregate, scoped to the
-- caller's gym.
-- ---------------------------------------------------------------------------
create or replace function public.class_seats()
returns table (class_id uuid, booked integer)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select b.class_id, count(*)::integer
  from public.class_bookings b
  join public.members m on m.organization_id = b.organization_id
  where m.user_id = auth.uid()
    and b.status = 'booked'
  group by b.class_id;
$$;

revoke all on function public.class_seats() from public;
grant execute on function public.class_seats() to authenticated;

-- Listing classes the member can book is a common read; index the seats count.
create index if not exists class_bookings_class_status_idx
  on public.class_bookings (class_id, status);

-- ======================================================================
-- 0014_progress_photo_storage.sql
-- ======================================================================
-- 0014 — private storage for member progress photographs
--
-- member_progress_photos (0006) stores the row; this adds the bucket the
-- storage_path points at. The bucket is private: a fitness photograph is among
-- the most sensitive rows a member owns, so there is no public URL for it and
-- reads go through short-lived signed URLs.
--
-- Path convention: <organization_id>/<member_id>/<uuid>.<ext>
-- A member may only write inside their own <org>/<member> prefix, which is
-- checked against their linked member row rather than trusted from the path.

insert into storage.buckets (id, name, public)
values ('member-progress', 'member-progress', false)
on conflict (id) do update set public = false;

-- Re-runnable: create policy has no `if not exists`.
drop policy if exists "progress photos read own" on storage.objects;
drop policy if exists "progress photos insert own" on storage.objects;
drop policy if exists "progress photos delete own" on storage.objects;
drop policy if exists "progress photos read by staff" on storage.objects;

-- Own photos: read, upload, replace, delete.
create policy "progress photos read own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'member-progress'
    and exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and storage.objects.name like m.organization_id::text || '/' || m.id::text || '/%'
    )
  );

create policy "progress photos insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'member-progress'
    and exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and storage.objects.name like m.organization_id::text || '/' || m.id::text || '/%'
    )
  );

create policy "progress photos delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'member-progress'
    and exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and storage.objects.name like m.organization_id::text || '/' || m.id::text || '/%'
    )
  );

-- Gym staff who coach the member may read progress photos; they cannot write.
-- org_has_role() is the same helper every other policy uses.
create policy "progress photos read by staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'member-progress'
    and exists (
      select 1
      from public.members m
      where storage.objects.name like m.organization_id::text || '/' || m.id::text || '/%'
        and public.org_has_role(m.organization_id, 'owner', 'manager', 'trainer')
    )
  );

-- ======================================================================
-- 0015_member_measurements.sql
-- ======================================================================
-- 0015 — members can record their own measurements
--
-- 0007 gave members a read-only policy on fitness_measurements, so the member
-- app could show weight history but a member could never add to it. Tracking
-- weight is a core promise of the member experience, so this adds self-service
-- writes scoped to the caller's own linked member row.
--
-- The table already enforces one row per (member_id, measured_on), so a second
-- entry for the same day is an edit rather than a duplicate. That is what makes
-- an "upsert" the correct write here.
--
-- Staff policies from 0006 are untouched: this only widens what a member may do
-- to their own rows. A member cannot write another member's row, cannot move a
-- row to a different member, and cannot change which gym the row belongs to.

drop policy if exists "measurements insert self" on public.fitness_measurements;
create policy "measurements insert self" on public.fitness_measurements
  for insert with check (
    exists (
      select 1 from public.members m
      where m.id = member_id
        and m.user_id = auth.uid()
        and m.organization_id = fitness_measurements.organization_id
    )
  );

drop policy if exists "measurements update self" on public.fitness_measurements;
create policy "measurements update self" on public.fitness_measurements
  for update using (
    exists (
      select 1 from public.members m
      where m.id = member_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.members m
      where m.id = member_id
        and m.user_id = auth.uid()
        and m.organization_id = fitness_measurements.organization_id
    )
  );

-- Members may delete a measurement they entered by mistake. Nothing else in the
-- member app deletes fitness history, so this stays tightly scoped to own rows.
drop policy if exists "measurements delete self" on public.fitness_measurements;
create policy "measurements delete self" on public.fitness_measurements
  for delete using (
    exists (
      select 1 from public.members m
      where m.id = member_id
        and m.user_id = auth.uid()
    )
  );

-- ======================================================================
-- 0016_account_deletion.sql
-- ======================================================================
-- 0016 - a member can erase their own account
--
-- The member app could already delete a measurement or a workout. It could not
-- leave: the row, the health history and the sign-in all stayed. This adds one
-- server-side function so a member can end the relationship themselves.
--
-- What is erased and what is kept is a deliberate split, not an oversight:
--
--   erased  identity fields on the member row (name, email, phone, date of
--           birth, gender, address, emergency contacts, notes; phone becomes
--           '0000000000', the only value that satisfies NOT NULL plus the
--           phone-shape check), the sign-in,
--           workout sessions and sets, body measurements, progress photos and
--           their stored objects, both plan assignments, class bookings,
--           attendance, internal staff notes.
--
--   kept    payments, invoices, membership rows and renewals, attached to an
--           anonymised member row. A gym has to be able to account for money it
--           took; a receipt is not a reason to keep someone's phone number.
--
-- The row itself is anonymised rather than deleted because deleting it would
-- cascade the payment history away. It is marked archived and unlinked, so it
-- no longer appears as an active member and no sign-in reaches it.
--
-- An organisation owner cannot use this: owner_id is `on delete restrict`, and
-- deleting the auth user would take the gym's staff access with it. They get a
-- clear refusal instead of a half-deleted workspace.

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_member  uuid;
  v_org     uuid;
  v_photos  integer := 0;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  -- Refuse before touching anything. A gym owner has to transfer or close the
  -- gym first; that is an operational decision, not something a delete button
  -- should make for them.
  if exists (select 1 from public.organizations where owner_id = v_uid) then
    raise exception
      'This sign-in owns a gym. Transfer or close the gym before deleting the account.'
      using errcode = '42501';
  end if;

  select m.id, m.organization_id
    into v_member, v_org
    from public.members m
   where m.user_id = v_uid
   limit 1;

  if v_member is not null then
    -- Stored photographs first: the row is the index, the object is the data.
    delete from storage.objects
     where bucket_id = 'member-progress'
       and name like v_org::text || '/' || v_member::text || '/%';
    get diagnostics v_photos = row_count;

    delete from public.member_progress_photos where member_id = v_member;
    delete from public.fitness_measurements where member_id = v_member;
    -- workout_sets hangs off workout_sessions by cascade; this is the parent.
    delete from public.workout_sessions where member_id = v_member;
    delete from public.member_workout_assignments where member_id = v_member;
    delete from public.member_diet_assignments where member_id = v_member;
    delete from public.class_bookings where member_id = v_member;
    delete from public.attendance where member_id = v_member;
    delete from public.member_internal_notes where member_id = v_member;

    -- Money stays, tied to a row that no longer identifies anyone.
    -- phone is NOT NULL and 0006's members_phone_shape check runs on every
    -- update, so the placeholder must match '^[0-9+() -]{6,20}$': '' would
    -- abort the whole delete with a check-constraint error.
    update public.members
       set first_name = 'Deleted',
           last_name = '',
           email = null,
           phone = '0000000000',
           date_of_birth = null,
           gender = null,
           address = null,
           emergency_contact_name = null,
           emergency_contact_phone = null,
           notes = null,
           photo_url = null,
           status = 'archived',
           user_id = null
     where id = v_member;
  end if;

  -- Last: the sign-in itself. profiles, notifications and any platform role row
  -- reference auth.users with on delete cascade, so they go with it.
  delete from auth.users where id = v_uid;

  return jsonb_build_object(
    'member_erased', v_member is not null,
    'photos_removed', v_photos
  );
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Erases the caller''s identity and health data and deletes their sign-in. Financial records are retained against an anonymised member row. Refuses for gym owners.';

-- ======================================================================
-- 0017_rls_member_fixes.sql
-- ======================================================================
-- 0017 — close RLS gaps found in the 2026-11-16 staff/RLS audit
--
-- Every fix here re-states an existing policy with the missing predicate.
-- All are re-runnable (drop policy if exists / create policy) and none touch
-- data. The audit rows these close:
--
-- 1. member_progress_photos had staff-only insert/delete (0006) and a
--    member read policy (0007), but no member write policies at all — the
--    member app's photo upload (member-api.ts uploadProgressPhoto) always
--    failed, and its delete silently removed only the storage bytes while
--    the row survived. 0014's storage policies always allowed the member's
--    own bucket prefix; the table was the gap.
-- 2. workout_sessions "update own" (0012) checked the member link but not
--    that the session's organization_id matches — a member could re-point
--    a row at another gym id. Insert already had the check.
-- 3. fitness_measurements "update self" (0015) had the same missing
--    organization_id match in its using clause.
-- 4. class_bookings "cancel own" (0013) constrained only the new status,
--    so a member could flip an 'attended' row to 'cancelled' with a direct
--    PostgREST update, erasing an attendance record. The app always goes
--    through the security-definer RPC, so this only hardened the table.
-- 5. attendance "update" (0001) omitted trainer while insert included it —
--    the web UI grants trainers attendance writes, so a trainer's check-out
--    silently wrote zero rows (checkOutMember had no zero-row detection).
-- 6. fitness_measurements staff "update" (0006) omitted receptionist while
--    the insert policy and the web UI both include it.
--
-- The void-invoice mismatch the audit flagged (receptionist shown the void
-- button) was a web-UI gap only: RLS already restricted void to
-- owner/manager/finance, and that is correct. Fixed in App.tsx, not here.

-- 1. members own their progress-photo rows -------------------------------
drop policy if exists "progress photos insert self" on public.member_progress_photos;
create policy "progress photos insert self" on public.member_progress_photos
  for insert to authenticated
  with check (
    exists (
      select 1 from public.members m
      where m.id = member_progress_photos.member_id
        and m.user_id = auth.uid()
        and m.organization_id = member_progress_photos.organization_id
    )
  );

drop policy if exists "progress photos delete self" on public.member_progress_photos;
create policy "progress photos delete self" on public.member_progress_photos
  for delete to authenticated
  using (
    exists (
      select 1 from public.members m
      where m.id = member_progress_photos.member_id
        and m.user_id = auth.uid()
        and m.organization_id = member_progress_photos.organization_id
    )
  );

-- 2. workout session updates may not move a row between gyms -------------
drop policy if exists "workout sessions update own" on public.workout_sessions;
create policy "workout sessions update own" on public.workout_sessions
  for update to authenticated
  using (
    exists (
      select 1 from public.members m
      where m.id = workout_sessions.member_id
        and m.user_id = auth.uid()
        and m.organization_id = workout_sessions.organization_id
    )
  )
  with check (
    exists (
      select 1 from public.members m
      where m.id = workout_sessions.member_id
        and m.user_id = auth.uid()
        and m.organization_id = workout_sessions.organization_id
    )
  );

-- 3. same organization_id match for member measurement updates -----------
drop policy if exists "measurements update self" on public.fitness_measurements;
create policy "measurements update self" on public.fitness_measurements
  for update to authenticated
  using (
    exists (
      select 1 from public.members m
      where m.id = fitness_measurements.member_id
        and m.user_id = auth.uid()
        and m.organization_id = fitness_measurements.organization_id
    )
  )
  with check (
    exists (
      select 1 from public.members m
      where m.id = fitness_measurements.member_id
        and m.user_id = auth.uid()
        and m.organization_id = fitness_measurements.organization_id
    )
  );

-- 4. a member may only cancel a booking that is still 'booked' -----------
drop policy if exists "bookings cancel own" on public.class_bookings;
create policy "bookings cancel own" on public.class_bookings
  for update to authenticated
  using (
    class_bookings.status = 'booked'
    and exists (
      select 1 from public.members m
      where m.id = class_bookings.member_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    status = 'cancelled'
    and exists (
      select 1 from public.members m
      where m.id = class_bookings.member_id
        and m.user_id = auth.uid()
    )
  );

-- 5. trainers close the check-ins they open ------------------------------
drop policy if exists "attendance update" on public.attendance;
create policy "attendance update" on public.attendance
  for update
  using (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist', 'trainer'))
  with check (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist', 'trainer'));

-- 6. receptionists correct the measurements they record ------------------
drop policy if exists "measurements update" on public.fitness_measurements;
create policy "measurements update" on public.fitness_measurements
  for update
  using (public.org_has_role(organization_id, 'owner', 'manager', 'trainer', 'receptionist'))
  with check (public.org_has_role(organization_id, 'owner', 'manager', 'trainer', 'receptionist'));

-- ======================================================================
-- 0018_retry_safe_writes.sql
-- ======================================================================
-- TwoPlus — 0018_retry_safe_writes
--
-- Makes the front desk's money and membership writes safe to retry, and lets a
-- member see what they still owe. Requires 0005 (create_member writes
-- members.photo_url) — apply 0005, 0016, 0017, then this file.
--
-- 1. Members can read their own invoices, so the member app can show the same
--    outstanding balance the desk sees (total minus verified payments).
-- 2. record_payment / renew_membership take an optional client request id. A
--    replay of the same request returns the first result instead of crediting
--    a second payment or logging a second renewal.
-- 3. create_invoice numbers from a locked per-gym, per-year counter instead of
--    a client-side count, so concurrent creates cannot collide.
-- 4. convert_enquiry creates (or re-links) the member, optionally assigns a
--    plan and marks the enquiry converted in one transaction. A retry after a
--    lost response returns the same member.
--
-- 5. Policy gaps found by supabase/tests/acceptance.test.mjs:
--    - workout_sets had no update policy, so a member could not correct a
--      logged set (and the mobile upsert failed outright on conflict);
--    - staff reminders could only target staff, never a linked member;
--    - every staff role, trainers included, could read all payments,
--      invoices and expenses of the gym.
--
-- Re-runnable: columns/indexes are `if not exists`, functions are dropped or
-- replaced, policies are dropped before create.

-- ---------------------------------------------------------------------------
-- 5a. Members correct their own sets
-- ---------------------------------------------------------------------------
drop policy if exists "workout sets update own" on public.workout_sets;
create policy "workout sets update own" on public.workout_sets
  for update to authenticated
  using (
    exists (
      select 1 from public.workout_sessions s
        join public.members m on m.id = s.member_id
       where s.id = workout_sets.session_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workout_sessions s
        join public.members m on m.id = s.member_id
       where s.id = workout_sets.session_id and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5b. Reminders can reach a linked member of the same gym
-- ---------------------------------------------------------------------------
drop policy if exists "notifications insert own or managed" on public.notifications;
create policy "notifications insert own or managed" on public.notifications
  for insert
  with check (
    organization_id is not null
    and (
      exists (
        select 1 from public.organization_members m
         where m.organization_id = notifications.organization_id
           and m.user_id = notifications.user_id
      )
      or exists (
        select 1 from public.members mb
         where mb.organization_id = notifications.organization_id
           and mb.user_id = notifications.user_id
      )
    )
    and (
      user_id = auth.uid()
      or public.org_has_role(organization_id, 'owner', 'manager')
    )
  );

-- ---------------------------------------------------------------------------
-- 5c. Money reads: finance-capable roles only (members keep "read self")
-- ---------------------------------------------------------------------------
drop policy if exists "payments read" on public.payments;
create policy "payments read" on public.payments
  for select using (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist', 'finance'));

drop policy if exists "invoices read" on public.invoices;
create policy "invoices read" on public.invoices
  for select using (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist', 'finance'));

drop policy if exists "expenses read" on public.expenses;
create policy "expenses read" on public.expenses
  for select using (public.org_has_role(organization_id, 'owner', 'manager', 'receptionist', 'finance'));

-- ---------------------------------------------------------------------------
-- 1. Member read of own invoices
-- ---------------------------------------------------------------------------
drop policy if exists "invoices read self" on public.invoices;
create policy "invoices read self" on public.invoices
  for select to authenticated
  using (
    exists (
      select 1 from public.members m
       where m.id = invoices.member_id
         and m.organization_id = invoices.organization_id
         and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2a. Payments: idempotency key
-- ---------------------------------------------------------------------------
alter table public.payments add column if not exists client_request_id uuid;
create unique index if not exists payments_org_request_key
  on public.payments (organization_id, client_request_id)
  where client_request_id is not null;

drop function if exists public.record_payment(uuid, uuid, integer, text, text, uuid, uuid, date, text);
create or replace function public.record_payment(
  p_organization_id uuid,
  p_member_id uuid,
  p_amount_minor integer,
  p_method text default 'cash',
  p_status text default 'paid',
  p_membership_id uuid default null,
  p_invoice_id uuid default null,
  p_paid_on date default null,
  p_description text default null,
  p_request_id uuid default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payments;
begin
  if not public.org_has_role(p_organization_id, 'owner', 'manager', 'receptionist', 'finance') then
    raise exception 'You do not have permission to record payments' using errcode = '42501';
  end if;

  if p_request_id is not null then
    select * into v_row from public.payments
     where organization_id = p_organization_id and client_request_id = p_request_id;
    if found then
      if v_row.member_id <> p_member_id or v_row.amount_minor <> p_amount_minor then
        raise exception 'This request id was already used for a different payment' using errcode = '23505';
      end if;
      return v_row; -- replay: the first write already happened
    end if;
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;
  if p_method not in ('cash','upi','card','bank_transfer','other') then
    raise exception 'Unsupported payment method';
  end if;
  if p_status not in ('paid','pending','failed','refunded') then
    raise exception 'Unsupported payment status';
  end if;
  if not exists (
    select 1 from public.members m
    where m.id = p_member_id and m.organization_id = p_organization_id
  ) then
    raise exception 'That member is not in this gym';
  end if;
  if p_membership_id is not null and not exists (
    select 1 from public.member_memberships mm
    where mm.id = p_membership_id
      and mm.organization_id = p_organization_id
      and mm.member_id = p_member_id
  ) then
    raise exception 'That membership does not belong to this member';
  end if;
  if p_invoice_id is not null and not exists (
    select 1 from public.invoices i
    where i.id = p_invoice_id
      and i.organization_id = p_organization_id
      and i.member_id = p_member_id
      and i.status <> 'void'
  ) then
    raise exception 'That invoice does not belong to this member or is void';
  end if;

  insert into public.payments (
    organization_id, member_id, membership_id, invoice_id, amount_minor,
    method, status, paid_on, description, recorded_by, client_request_id
  ) values (
    p_organization_id, p_member_id, p_membership_id, p_invoice_id,
    p_amount_minor, p_method, p_status, coalesce(p_paid_on, current_date),
    p_description, auth.uid(), p_request_id
  )
  returning * into v_row;

  perform public.log_activity(
    p_organization_id, p_member_id, 'payment.recorded',
    jsonb_build_object('payment_id', v_row.id, 'amount_minor', p_amount_minor, 'status', p_status)
  );
  return v_row;
end;
$$;

revoke execute on function public.record_payment(uuid, uuid, integer, text, text, uuid, uuid, date, text, uuid) from public, anon;
grant execute on function public.record_payment(uuid, uuid, integer, text, text, uuid, uuid, date, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2b. Renewals: one end date, one history row, even on replay
-- ---------------------------------------------------------------------------
alter table public.membership_renewals add column if not exists client_request_id uuid;
create unique index if not exists membership_renewals_org_request_key
  on public.membership_renewals (organization_id, client_request_id)
  where client_request_id is not null;

drop function if exists public.renew_membership(uuid, uuid, date, integer, text);
create or replace function public.renew_membership(
  p_organization_id uuid,
  p_membership_id uuid,
  p_new_end_date date,
  p_amount_minor integer default 0,
  p_note text default null,
  p_request_id uuid default null
)
returns public.member_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.member_memberships;
  v_prev date;
begin
  if not public.org_has_role(p_organization_id, 'owner', 'manager', 'receptionist') then
    raise exception 'You do not have permission to renew memberships' using errcode = '42501';
  end if;

  select * into v_row from public.member_memberships mm
  where mm.id = p_membership_id and mm.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'That membership does not exist in this gym';
  end if;

  if p_request_id is not null and exists (
    select 1 from public.membership_renewals r
     where r.organization_id = p_organization_id and r.client_request_id = p_request_id
  ) then
    return v_row; -- replay: already renewed by this request
  end if;

  v_prev := v_row.end_date;
  if p_new_end_date is null or p_new_end_date <= v_prev then
    raise exception 'The new end date must be after the current one (%)', v_prev;
  end if;
  if coalesce(p_amount_minor, 0) < 0 then
    raise exception 'The renewal amount cannot be negative';
  end if;

  update public.member_memberships
     set end_date = p_new_end_date,
         status = 'active'
   where id = p_membership_id
   returning * into v_row;

  insert into public.membership_renewals (
    organization_id, membership_id, member_id, previous_end_date,
    new_end_date, extended_days, amount_minor, note, renewed_by, client_request_id
  ) values (
    p_organization_id, p_membership_id, v_row.member_id, v_prev,
    p_new_end_date, (p_new_end_date - v_prev), coalesce(p_amount_minor, 0),
    nullif(trim(p_note), ''), auth.uid(), p_request_id
  );

  -- Not a payment: extending dates leaves receivables as they were.
  perform public.log_activity(
    p_organization_id, v_row.member_id, 'membership.renewed',
    jsonb_build_object('membership_id', p_membership_id, 'from', v_prev, 'to', p_new_end_date)
  );
  return v_row;
end;
$$;

revoke execute on function public.renew_membership(uuid, uuid, date, integer, text, uuid) from public, anon;
grant execute on function public.renew_membership(uuid, uuid, date, integer, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Invoice numbering from a locked counter
-- ---------------------------------------------------------------------------
create table if not exists public.org_invoice_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  year            integer not null,
  last_number     integer not null default 0,
  primary key (organization_id, year)
);
alter table public.org_invoice_counters enable row level security;
-- No policies: only create_invoice (security definer) touches this table.

alter table public.invoices add column if not exists client_request_id uuid;
create unique index if not exists invoices_org_request_key
  on public.invoices (organization_id, client_request_id)
  where client_request_id is not null;

create or replace function public.create_invoice(
  p_organization_id uuid,
  p_member_id uuid,
  p_total_minor integer,
  p_membership_id uuid default null,
  p_issued_on date default null,
  p_due_on date default null,
  p_notes text default null,
  p_request_id uuid default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invoices;
  v_issued date := coalesce(p_issued_on, current_date);
  v_year integer := extract(year from coalesce(p_issued_on, current_date))::integer;
  v_prefix text;
  v_num integer;
begin
  if not public.org_has_role(p_organization_id, 'owner', 'manager', 'finance', 'receptionist') then
    raise exception 'You do not have permission to raise invoices' using errcode = '42501';
  end if;

  if p_request_id is not null then
    select * into v_row from public.invoices
     where organization_id = p_organization_id and client_request_id = p_request_id;
    if found then
      return v_row;
    end if;
  end if;

  if p_total_minor is null or p_total_minor < 0 then
    raise exception 'Enter an invoice total of zero or more';
  end if;
  if p_due_on is not null and p_due_on < v_issued then
    raise exception 'The due date cannot be before the issue date';
  end if;
  if not exists (
    select 1 from public.members m
     where m.id = p_member_id and m.organization_id = p_organization_id
  ) then
    raise exception 'That member is not in this gym';
  end if;
  if p_membership_id is not null and not exists (
    select 1 from public.member_memberships mm
     where mm.id = p_membership_id
       and mm.organization_id = p_organization_id
       and mm.member_id = p_member_id
  ) then
    raise exception 'That membership does not belong to this member';
  end if;

  v_prefix := 'INV-' || v_year || '-';

  -- Seed from the highest number already issued (rows numbered by the old
  -- client-side count), then increment under the row lock.
  insert into public.org_invoice_counters (organization_id, year, last_number)
  select p_organization_id, v_year,
         coalesce(max(nullif(regexp_replace(substr(i.invoice_number, length(v_prefix) + 1), '[^0-9]', '', 'g'), '')::integer), 0)
    from public.invoices i
   where i.organization_id = p_organization_id
     and i.invoice_number like v_prefix || '%'
  on conflict (organization_id, year) do nothing;

  update public.org_invoice_counters
     set last_number = last_number + 1
   where organization_id = p_organization_id and year = v_year
  returning last_number into v_num;

  insert into public.invoices (
    organization_id, member_id, membership_id, invoice_number, issued_on,
    due_on, total_minor, status, notes, created_by, client_request_id
  ) values (
    p_organization_id, p_member_id, p_membership_id,
    v_prefix || lpad(v_num::text, 4, '0'), v_issued, p_due_on, p_total_minor,
    'issued', nullif(trim(p_notes), ''), auth.uid(), p_request_id
  )
  returning * into v_row;

  perform public.log_activity(
    p_organization_id, p_member_id, 'invoice.created',
    jsonb_build_object('invoice_id', v_row.id, 'invoice_number', v_row.invoice_number, 'total_minor', p_total_minor)
  );
  return v_row;
end;
$$;

revoke execute on function public.create_invoice(uuid, uuid, integer, uuid, date, date, text, uuid) from public, anon;
grant execute on function public.create_invoice(uuid, uuid, integer, uuid, date, date, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Enquiry conversion as one transaction
-- ---------------------------------------------------------------------------
create or replace function public.convert_enquiry(
  p_enquiry_id uuid,
  p_first_name text default null,
  p_last_name text default null,
  p_plan_id uuid default null,
  p_start_date date default null,
  p_end_date date default null
)
returns public.members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enq public.enquiries;
  v_member public.members;
  v_first text;
  v_last text;
  v_ms public.member_memberships;
begin
  select * into v_enq from public.enquiries e where e.id = p_enquiry_id for update;
  if not found then
    raise exception 'That enquiry does not exist';
  end if;
  if not public.org_has_role(v_enq.organization_id, 'owner', 'manager', 'receptionist') then
    raise exception 'You do not have permission to convert enquiries' using errcode = '42501';
  end if;

  -- Replay of a conversion that already committed.
  if v_enq.status = 'converted' and v_enq.converted_member_id is not null then
    select * into v_member from public.members where id = v_enq.converted_member_id;
    if found then
      return v_member;
    end if;
  end if;
  if v_enq.status = 'lost' then
    raise exception 'This enquiry is marked lost; reopen it before converting';
  end if;

  -- An earlier, interrupted conversion (the old two-call client flow) may have
  -- created the member without marking the enquiry. Same phone in the same gym
  -- is the same person: link instead of failing on the duplicate guard.
  select * into v_member from public.members m
   where m.organization_id = v_enq.organization_id
     and m.status <> 'archived'
     and regexp_replace(m.phone, '[^0-9]', '', 'g') = regexp_replace(v_enq.phone, '[^0-9]', '', 'g')
   order by m.created_at
   limit 1;

  if not found then
    v_first := nullif(trim(coalesce(p_first_name, split_part(trim(v_enq.name), ' ', 1))), '');
    v_last := coalesce(nullif(trim(p_last_name), ''),
                       nullif(trim(substr(trim(v_enq.name), length(split_part(trim(v_enq.name), ' ', 1)) + 1)), ''),
                       '');
    v_member := public.create_member(
      v_enq.organization_id, coalesce(v_first, trim(v_enq.name)), v_last,
      v_enq.phone, v_enq.email
    );
  end if;

  if p_plan_id is not null and not exists (
    select 1 from public.member_memberships mm
     where mm.member_id = v_member.id and mm.plan_id = p_plan_id
       and mm.status in ('scheduled', 'active')
  ) then
    v_ms := public.assign_membership(v_enq.organization_id, v_member.id, p_plan_id, p_start_date);
    -- The desk may set a different expiry than the plan length.
    if p_end_date is not null and p_end_date > v_ms.start_date and p_end_date <> v_ms.end_date then
      update public.member_memberships set end_date = p_end_date where id = v_ms.id;
    end if;
  end if;

  update public.enquiries
     set status = 'converted', converted_member_id = v_member.id
   where id = v_enq.id;

  perform public.log_activity(
    v_enq.organization_id, v_member.id, 'enquiry.converted',
    jsonb_build_object('enquiry_id', v_enq.id, 'source', v_enq.source)
  );
  return v_member;
end;
$$;

revoke execute on function public.convert_enquiry(uuid, text, text, uuid, date, date) from public, anon;
grant execute on function public.convert_enquiry(uuid, text, text, uuid, date, date) to authenticated;
