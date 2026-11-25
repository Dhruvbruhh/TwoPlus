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
