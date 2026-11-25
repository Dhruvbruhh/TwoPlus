# Owner checklist — applying migrations 0005, 0016, 0017 and 0018

Everything on this page is a production database write. Run it yourself, from
your machine, when you have an hour and are not in a hurry. Nothing here has
been executed by the repo side: the live database is untouched.

**What this fixes.** `0005_member_photos.sql` adds the `members.photo_url`
column — until it exists, saving a member photo fails (ISSUES.md S1). `0016_account_deletion.sql`
adds the `delete_my_account()` RPC — until it exists, the member app's
"Delete my account" button errors out, which is a Play policy failure once the
app ships. Applying 0016 also closes the account-deletion loop the store
checklist marks as met in code. `0017_member_policy_fixes.sql` repairs four
member-facing RLS gaps found in review: the missing member photo
insert/delete policy, the `workout_sessions` update policy, the
`class_bookings` cancel with-check, and trainer attendance updates.

`0018_retry_safe_writes.sql` (added 2026-11-19) makes desk money writes safe
to retry (payment and renewal request ids, counter-numbered invoices, one-step
enquiry conversion), lets members read their own invoices, adds the missing
member update policy on `workout_sets`, lets owners/managers send in-app
reminders to linked members, and stops trainers reading payments, invoices and
expenses. Every change is exercised by `npm run test:db` (20 scenarios on a
local Postgres with all 18 migrations); `supabase/tests/baseline-0017.test.mjs`
reproduces each defect on the 0017 schema. It has **not** run on a Supabase
project yet. **Effect to expect:** trainers see empty Payments, Invoices and
Expenses lists after it lands — that is the intended restriction.

**Why all four in one session.** 0018 calls `create_member`, which writes
`members.photo_url`, so it also needs 0005 first. 0016 sets `photo_url = null` on the
anonymised member row, so 0005 **must** land before 0016 or the delete RPC is
created against a column that does not exist. 0017 has no ordering
dependency but belongs to the same window: none of the three is applied yet.
The order below enforces that.

**Why repair the history.** Only 3 of 17 migrations are recorded in
`supabase_migrations.schema_migrations` (the rest were applied by hand), so
`supabase db push` cannot know what is applied. The repair step below tells it,
without running any SQL against the tables.

Prerequisites on this host: a Supabase access token and the database password
(Dashboard → Settings → Database). Set both in the same terminal session:

```bash
export SUPABASE_ACCESS_TOKEN='<token>'
export PGPASSWORD='<database password>'
```

Postgres client tools are optional but recommended (backup step B uses them;
`winget install PostgreSQL.PostgreSQL.16` provides `pg_dump`).

---

## A. Preflight (reads only)

Work in `TwoPlus-repo/`. Confirm you are on a commit that contains the two
migration files:

```bash
git pull
git log --oneline -1 -- supabase/migrations/0005_member_photos.sql supabase/migrations/0016_account_deletion.sql
```

Confirm what the database actually has (2026-11-06 probes: both absent):

```bash
npx supabase migration list --linked
```

Expected: versions `0001`–`0003` marked applied, `0004`–`0016` not
(the hand-applied tail is the history gap the repair step fixes).

Optional direct probe of the two objects (SQL editor in the Dashboard):

```sql
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'members' and column_name = 'photo_url';
-- expect 0 rows today

select proname from pg_proc
 where pronamespace = 'public'::regnamespace and proname = 'delete_my_account';
-- expect 0 rows today
```

## B. Backup (required before any write)

`docs/OPERATIONS.md` is the full runbook; the short form:

```bash
pg_dump "postgresql://postgres.qhxgqyzrzqxwvriugnya@aws-0-eu-west-1.pooler.supabase.com:5432/postgres" \
  --schema=public --schema=auth --no-owner \
  --format=custom --file=backup-$(date +%Y%m%d-%H%M).dump
```

Do not pass `--no-privileges` (it drops REVOKEs that are load-bearing — see
OPERATIONS.md). Copy the dump off the machine. Storage objects are not in the
dump; nothing in this migration set touches them, so a bucket copy is optional
here but `docs/OPERATIONS.md` shows the command if you want the belt and braces.

Record the dump path and its SHA-256 before continuing. If step D fails in a
way step E cannot explain, this dump is the rollback.

## C. Repair the migration history (metadata only)

This writes rows into `supabase_migrations.schema_migrations` for the migrations
that are already live but unrecorded. It runs no application SQL. Mark 0004
through 0015 applied (they are: the REST probes on 2026-11-06 confirmed every
table and column from 0004–0015 exists; the genuine gaps are 0005, 0016 and
0017, which the push in step D applies for real):

```bash
npx supabase migration repair 0004 0006 0007 0008 0009 0010 0011 0012 0013 0014 0015 --status applied --linked
```

(0005, 0016 and 0017 are deliberately absent: none is applied, and step D must
apply them.)

Sanity-check the list again:

```bash
npx supabase migration list --linked
```

Expected: `0004`, `0006`–`0015` now applied; `0005`, `0016`, `0017` not.

If a repair line names a migration you believe is *not* live, stop — do not
mark it. Re-run the preflight probe for that migration's objects first; a
wrongly marked history is the exact failure mode this step exists to avoid.

## D. Apply (the real write)

```bash
npx supabase db push --linked
```

This applies `0005_member_photos.sql`, `0016_account_deletion.sql`,
`0017_rls_member_fixes.sql` and `0018_retry_safe_writes.sql`, in order. All four are idempotent (checked:
`add column if not exists`, `create or replace function`, guarded grants and
`drop policy if exists` before create), so a dropped connection can be re-run
safely. Expect output naming exactly these four files.

## E. Post-checks

SQL editor, Dashboard, against the live project:

```sql
-- 1. the column and the function now exist
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'members' and column_name = 'photo_url';
-- expect 1 row: photo_url

select proname, prosecdef from pg_proc
 where pronamespace = 'public'::regnamespace and proname = 'delete_my_account';
-- expect 1 row, prosecdef = true (security definer)

-- 1b. the 0017 member policies exist (six repaired policies)
select tablename, policyname from pg_policy
 where schemaname = 'public'
   and policyname in ('progress photos insert self', 'progress photos delete self',
                      'workout sessions update own', 'measurements update self',
                      'bookings cancel own', 'attendance update')
 order by tablename, policyname;
-- expect 6 rows

-- 1c. 0018: the new functions and the request-id columns exist
select proname, pg_get_function_identity_arguments(oid) from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('create_invoice', 'convert_enquiry', 'record_payment', 'renew_membership')
 order by 1;
-- expect 4 rows; record_payment and renew_membership end in "p_request_id uuid"
select table_name from information_schema.columns
 where table_schema = 'public' and column_name = 'client_request_id' order by 1;
-- expect invoices, membership_renewals, payments

-- 2. the grant went to authenticated only
select grantee from information_schema.role_routine_grants
 where specific_schema = 'public' and routine_name = 'delete_my_account';
-- expect exactly one row: authenticated

-- 3. the RLS rule from OPERATIONS.md still holds: no policy-less tables
select c.relname, count(p.polname) as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
group by c.relname having count(p.polname) = 0;
-- expect 0 rows

-- 4. no member row was touched by this run
select count(*) from public.members where photo_url is not null and status = 'archived';
-- informational; expect whatever it was before (these migrations write no data)
```

Then, from the app, the two end-to-end proofs:

1. **Web:** sign in as an owner, open a member, attach a photo URL, save. It
   must save (this was the S1 failure).
2. **Deletion RPC:** the safe test is a throwaway sign-in, not your own. Ask
   the desk to create a test member with a unique email, claim it through the
   member app sign-up, then run "Delete my account" from the profile screen.
   Expect: the app signs you out, a Dashboard check shows the auth user gone,
   and the member row shows `first_name = 'Deleted'`, `status = 'archived'`,
   real `phone = '0000000000'` placeholder. Do **not** test with a gym-owner
   sign-in: the RPC refuses owners by design, which is the correct outcome.

## F. Rollback guidance

- **0005** is additive only. Reversing it is `alter table public.members drop
  column if exists photo_url;` in the SQL editor — but there is no reason to:
  a nullable column that nothing fills is inert.
- **0016** only creates a function. Reversing it is
  `drop function if exists public.delete_my_account();` — again, no reason
  unless a defect shows in post-check E.
- **0018** adds nullable columns, a counter table and functions, and swaps
  four policies. The web client calls the new functions first and falls back to
  the previous path when one is missing, so reverting 0018 does not break the
  desk. To revert, restore the previous policy text from 0001/0004/0006 and
  `drop function` the two new ones; keep the columns (inert when null).
- **0017** only alters policies. Reversing it means restoring the previous
  policy definitions from git history (`git show 475fea7:supabase/migrations/...`
  for the pre-fix state) — no reason unless a post-check fails.
- **A delete that did the wrong thing** (a member deleted who should not have
  been): this is the one case the dump is for. Follow `docs/OPERATIONS.md`
  → "Restoring one deleted row": extract the member's tables from the step-B
  dump with `pg_restore --data-only --table=...`, check FKs by hand, insert
  back. The auth user must be re-created (auth rows restore from the same
  dump's `auth.users` data).
- **Do not** "roll back" by editing the migration files after they applied:
  the CLI records file versions, and a changed hash breaks the next push. Fix
  forward with a new migration `0018` if a defect ever appears.

## G. Close the loop

Update the tracked docs that record these items as open (this keeps the repo's
claims true):

- `ISSUES.md` — close the two S1 rows (photo save, migration history).
- `MISSION.md` Phase 19 — tick the "migrations written but not applied" row
  (it now lists 0005, 0016, 0017 and 0018).
- `docs/BACKLOG_TRIAGE.md` — D2, D3, D5 are now done.

Then delete the two exports (`SUPABASE_ACCESS_TOKEN`, `PGPASSWORD`) from the
shell session. Neither belongs in a profile file.
