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
