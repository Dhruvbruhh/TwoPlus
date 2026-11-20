-- TwoPlus combined migrations: 0005_member_photos.sql 0016_account_deletion.sql 0017_rls_member_fixes.sql 0018_retry_safe_writes.sql
-- Generated 2026-11-19 from supabase/migrations/. Do not edit; regenerate.
-- For the LIVE database (already has 0001-0015 except 0005). Idempotent. Take the backup in docs/MIGRATION-CHECKLIST.md step B first.

-- ======================================================================
-- 0005_member_photos.sql
-- ======================================================================
-- Optional profile photo for members. A URL only: the gym pastes a hosted
-- image or their own CDN link. No stock imagery is ever filled in.
-- Re-runnable.

alter table public.members
  add column if not exists photo_url text;

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
