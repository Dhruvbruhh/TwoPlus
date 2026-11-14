# Backlog triage

Reconciliation of the stored checkpoint against `D:\TwoPlus\TwoPlus-repo` at HEAD.
Every row was checked on 2026-11-06 with the command shown. Exit codes and
observations are copied from run output, not from memory or from the checkpoint.

Status vocabulary (used in every row):

- **BLOCKED (credentials):** cannot proceed without a password or token.
- **BLOCKED (owner):** needs a human decision, approval, money or legal sign-off.
- **ACTIONABLE:** a worker can do it now on this host.
- **NONE (done):** already finished in the repo; remove from the backlog.
- **NONE (fact):** a verification row, not a work item.
- **NONE (stale):** the checkpoint claim is wrong; no work exists.

Checkpoint baseline claimed: `HEAD 246a67d`, tree clean, backup/restore never
run, one unapplied migration, stale screenshot script, redesign and deploy
unfinished.

Observed: `HEAD 08f0396`, tree clean, 17 commits past `246a67d`, backup/restore
rehearsed on 2026-11-04, two unapplied migrations, screenshot script already
fixed, redesign merged and deployed to `twoplus.fit`.

---

## A. Repository baseline

| ID | Item | Status | Verdict | Evidence (command, exit code, observed output) |
|---|---|---|---|---|
| A1 | HEAD commit | NONE (stale) | Checkpoint says `246a67d`; HEAD is 17 commits ahead | `git log -1 --format=%h` → exit 0, output `08f0396`. |
| A2 | Working tree clean | NONE (fact) | Clean at task start, one new doc after | `git status --porcelain` → exit 0, zero lines at start. After writing this file: exit 0, one line, `?? docs/BACKLOG_TRIAGE.md`. `git diff --stat` → exit 0, no tracked modifications. |
| A3 | Commits since checkpoint baseline | NONE (stale) | Real work landed after the checkpoint was written | `git log --oneline 246a67d..HEAD` → exit 0, 17 commits. `git diff --stat 246a67d..HEAD` → exit 0, `59 files changed, 12795 insertions(+), 344 deletions(-)`. |
| A4 | Typecheck | NONE (fact) | Green | `npx tsc -b` → exit 0, no output. |
| A5 | Production build | NONE (fact) | Green | `npm run build` → exit 0, last line `✓ built in 6.30s`. |
| A6 | Lint | NONE (fact) | Green, warnings only | `npm run lint` → exit 0. Warnings: `react(only-export-components)`, `react(set-state-in-effect)`, one `react(purity)` at `mobile/app/(tabs)/index.tsx:68`. |
| A7 | Test inventory | NONE (fact) | 42 tests exist | `npx playwright test --list` → exit 0, `Total: 42 tests in 13 files`. |
| A8 | "42 Playwright green" claim | BLOCKED (credentials) | Only 31 of 42 run without credentials | `npx playwright test` → exit 0, `31 passed`, `11 skipped (23.3s)`. The skips are collection-time gates on `SHOT_EMAIL`/`SHOT_PASS`: `tests/contrast.spec.ts:10`, `member-app.spec.ts:11`, `owner-journey.spec.ts:10`, `screens.spec.ts:10`, `security-journey.spec.ts:14`, `studio.spec.ts:8`. See B4. |
| A9 | Source size baseline | NONE (fact) | 68 files, slightly larger | `Get-ChildItem -Recurse src -Include *.ts,*.tsx,*.css` → 68 files, 881,957 bytes (checkpoint: 875,671). `src\App.tsx` → 188,551 bytes, 4430 lines. |
| A10 | TODO markers and console log calls | NONE (fact) | Zero of each | `Select-String` over `src` for the markers TODO, FIXME and HACK as one alternation pattern → 0 matches. Separate pattern `console\.log` over `src` → 0 matches. |
| A11 | `screens.spec.ts` flake | NONE (fact) | No recurrence | `npx playwright test` → exit 0, no `empty heading` failure; the load-timing explanation stands. |

---

## B. Credentials, tools and environment

| ID | Item | Status | Verdict | Evidence (command, exit code, observed output) |
|---|---|---|---|---|
| B1 | PostgreSQL client tools missing | ACTIONABLE | Install with `winget`; only real unblock available now | `where pg_dump` → **exit 1**, `INFO: Could not find files for the given pattern(s)`. `where psql` → exit 1. `where pg_restore` → exit 1. `Get-ChildItem 'C:\Program Files\PostgreSQL'` → no output (not installed). `winget --version` → `v1.29.380`. `docker --version` → **exit 1**, not recognized. `choco` and `scoop` → not found. |
| B2 | `PGPASSWORD` unset | BLOCKED (owner) | Needs the database password from the owner | `[Environment]::GetEnvironmentVariable('PGPASSWORD', 'Process'/'User'/'Machine')` → False, False, False. |
| B3 | `SUPABASE_ACCESS_TOKEN` unset | BLOCKED (owner) | Needs a token from the owner | Same three-scope check → False, False, False. Functional proof: `npx supabase migration list --linked` → **exit 1**, `AccessTokenRequiredError: Access token not provided`. |
| B4 | `SHOT_EMAIL` and `SHOT_PASS` unset | BLOCKED (owner) | This is why 11 tests skip, including the 4.5 contrast gate | Three-scope check → `False` for both. `Select-String tests\contrast.spec.ts, tests\owner-journey.spec.ts -Pattern 'SHOT_EMAIL'` → exit 0, hits at the `test.skip(` gate in each file (`contrast.spec.ts:10`, `owner-journey.spec.ts:10`), with message `Set SHOT_EMAIL and SHOT_PASS: this gate signs in.` |
| B5 | `supabase/config.toml` absent | ACTIONABLE | Low value; the project is linked remotely instead | `Test-Path supabase\config.toml` → `False`. `supabase\.temp\project-ref` → `qhxgqyzrzqxwvriugnya`. `supabase\.temp\linked-project.json` → `{"ref":"qhxgqyzrzqxwvriugnya","name":"Twoplus",...}`. A local config only matters for `supabase start`, which needs Docker, which is absent (B1). |
| B6 | `.env` and `.env.local` | NONE (stale) | Checkpoint wrong on `.env`; `.env.local` exists and is ignored | `Test-Path .env` → `False`. `Test-Path .env.local` → `True`. `git check-ignore -v .env.local` → exit 0, `.gitignore:31:.env.*`. Keys present: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VERCEL_OIDC_TOKEN`. Values not printed. |
| B7 | Supabase CLI version | NONE (fact) | 2.122.0, upgrade offered | `npx supabase --version` → exit 0, first line `2.122.0`, plus a notice for `v3.0.0`. |
| B8 | Backup dump artifact | NONE (fact) | Exists, outside the repo | `Get-Item D:\TwoPlus\backups\backup-20261104-1252-withacl.dump` → exit 0, 433,527 bytes, 2026-11-04 13:20:59. Outside `TwoPlus-repo`, so it cannot be committed. |

---

## C. Backup and restore rehearsal

| ID | Item | Status | Verdict | Evidence (command, exit code, observed output) |
|---|---|---|---|---|
| C1 | "Backup/restore rehearsal not run" | NONE (done) | Ran on 2026-11-04 and passed; checkpoint is wrong | `git ls-files docs/RESTORE-REHEARSAL.md` → exit 0, prints the path. `git log --oneline -1 -- docs/RESTORE-REHEARSAL.md` → exit 0, `8a23d62 Rehearse the backup restore and fix three defects it exposed`. The doc records a pass into scratch project `lmhpbpalgcbccbyybemt`: 38/38 tables, 0 row-count mismatches, 108 policies and 266 grants intact, 6/6 `auth.users`. |
| C2 | Runbook correctness after rehearsal | NONE (done) | Three defects found and fixed; the checkpoint still prescribes a broken step | `Select-String docs\RESTORE-REHEARSAL.md` for `disable-triggers` and `no-privileges` → exit 0, reports at `:39` "`--no-privileges` ... Drops all GRANT and REVOKE statements" and `:47` "`--disable-triggers` is not usable. Requires superuser". The doc `:44-48` also records that schema-then-data restore broke FK ordering. The checkpoint's `--disable-triggers` step is **superseded and must not be followed**. |
| C3 | Re-run the rehearsal on this host | BLOCKED (credentials) | Cannot run: no client tools and no password | `where pg_dump`/`psql`/`pg_restore` → exit 1 each (B1). `PGPASSWORD` unset (B2). Independent of that, C1 is finished work, not open work. |
| C4 | Backup on a schedule | BLOCKED (owner) | No scheduled job; needs a hosting and retention decision | `schtasks /query /fo csv /nh` filtered for `pg_dump`, `postgres`, `supabase`, `twoplus` → exit 0, no matching task. Newest dump is 2026-11-04 (B8). `docs/OPERATIONS.md:241-246` says rehearsed once, not repeated since. |
| C5 | Storage objects in backups | BLOCKED (owner) | Buckets are not in the dump; copying needs credentials plus a destination | `Select-String docs\OPERATIONS.md -Pattern 'Storage objects are'` → exit 0, `L94: Storage objects are **not** in the dump. They live in S3 and need the separate` copy step. `:101` shows `npx supabase storage cp -r ss:///member-progress-photos ./backup/photos`, and `:105` names buckets `member-progress-photos` and `workspace-media`. |

---

## D. Migrations

| ID | Item | Status | Verdict | Evidence (command, exit code, observed output) |
|---|---|---|---|---|
| D1 | Migration files present | NONE (fact) | 16 files | `Get-ChildItem supabase\migrations -Filter *.sql` → 16 files, `0001_init.sql` through `0016_account_deletion.sql`. |
| D2 | `0005_member_photos.sql` unapplied | BLOCKED (owner) | Confirmed missing live; it is a write to production, so it needs approval | Anon-key REST probe against `qhxgqyzrzqxwvriugnya`: `GET /rest/v1/members?select=photo_url&limit=1` → HTTP **400**, `{"code":"42703","message":"column members.photo_url does not exist"}`. Re-run, same 400/42703. The migration is one additive statement, `alter table public.members add column if not exists photo_url text`. |
| D3 | `0016_account_deletion.sql` unapplied | BLOCKED (owner) | Same approval gate; the member "delete my account" action cannot work | `POST /rest/v1/rpc/delete_my_account` → HTTP **404**, `{"code":"PGRST202","message":"Searched for the function public.delete_my_account ..."}`. Re-run, same 404. |
| D4 | Which later migrations are actually missing | NONE (fact) | Only 0005 and 0016 are missing, not the whole tail | Anon-key REST probes (node `fetch`, one per path, script exit 0): `organizations?select=theme_preset` → HTTP 200 (0003), `members?select=user_id` → HTTP 200 (0007), `workout_sessions` → HTTP 200 (0012), `class_bookings` → HTTP 200 (0013), `member_progress_photos` → HTTP 200 (0014), `fitness_measurements` → HTTP 200 (0015), `organizations?select=theme_style` → HTTP 200, `members?select=notes` → HTTP 200, `member_internal_notes`, `membership_renewals`, `workout_plans`, `diet_plans` → HTTP 200 (0006). The checkpoint's earlier note blaming `0006` was wrong and `MISSION.md:247` naming `0005` and `0016` is right. |
| D5 | Migration history table inaccurate | BLOCKED (owner) | Cannot read it here; repairing it is the same production write | `npx supabase migration list --linked` → **exit 1**, `AccessTokenRequiredError`. `GET /rest/v1/schema_migrations` → HTTP **404** `PGRST205` (not exposed to the anon role). `ISSUES.md` S1 records 3 of 16 versions recorded while the later columns exist. |
| D6 | Migration dry-runs | NONE (done) | Both already dry-run clean | `Select-String MISSION.md -Pattern 'dry-run clean'` → exit 0, one hit at `L251`, whose text records both migrations dry-run inside a rolled-back transaction on 2026-11-05. A fresh dry-run is impossible here: no token (B3), no password (B2), no client tools (B1). |

---

## E. Redesign and deployment

| ID | Item | Status | Verdict | Evidence (command, exit code, observed output) |
|---|---|---|---|---|
| E1 | "Deploy not run" | NONE (done) | Deployed a day before this task; checkpoint is wrong | `npx vercel ls` → exit 0, `dhruvnyx/twoplus` with six `● Ready` Production deployments. `npx vercel inspect https://twoplus-7rydup9kd-dhruvnyx.vercel.app` → exit 0, `status ● Ready`, `created Thu Nov 05 2026 16:03:14`, `build duration 27s`. |
| E2 | Public site reachable | NONE (fact) | 200 | `Invoke-WebRequest https://twoplus.fit` → **200**, SPA shell referencing `/assets/index-CTHDh_7d.js` and `/assets/index-BVKQQRB9.css`. `npx vercel alias ls` → exit 0, `twoplus.fit` aliased to `twoplus-7rydup9kd-dhruvnyx.vercel.app`. |
| E3 | Deployed build contains HEAD | NONE (fact) | Confirmed by content marker, not by hash | `directory-tabs-scroll` exists only in HEAD: `git show 246a67d:src/index.css` → 0 matches, `git show HEAD:src/index.css` → 2 matches. The deployed `https://twoplus.fit/assets/index-BVKQQRB9.css` (139,132 bytes) contains `directory-tabs-scroll` and `minmax(min-content`. A fresh local build gives different hashes and 139,098 bytes, so the build is not byte-reproducible; any redeploy mints new asset names. |
| E4 | Raw deployment URL access | NONE (fact) | Deployment protection on; the domain is the public site | `Invoke-WebRequest https://twoplus-7rydup9kd-dhruvnyx.vercel.app` with redirects disabled → **302** to `vercel.com/sso-api`. `https://twoplus.fit` → **200**. |
| E5 | Glass token layer only partly applied | ACTIONABLE | Real design work, needs Iris and Kai, not credentials | `Select-String src\index.css -Pattern '--glass'` → 25 hits, tokens start at `src/index.css:3031` (`--glass-bg: rgba(16,17,19,0.68)`). `var(--glass` across `index.css`, `auth.css`, `manual.css` → 16 references. `glass` appears 66 times under `src`. Shell, rail and top bar use `backdrop-filter` over `--shell-bg`, `--rail-bg`, `--topbar-bg` at `src/index.css:269-270`, `:301-302`, `:411-412`, not the `--glass-*` tokens, so the restyle happened on a parallel token set. |
| E6 | Login one-time code unfinished | NONE (done) | Implemented before the checkpoint baseline | `Select-String src\pages\Login.tsx -Pattern 'CODE_LENGTH'` → exit 0, 9 hits, first at `L13`; `Get-Content` shows `:13` `const CODE_LENGTH = 6` and `:18` `function CodeInput(`. `git log --oneline -1 -- src/pages/Login.tsx` → exit 0, `8b2d3c1 Throttle repeat attempts on the sign-in, sign-up and reset screens`. `git log 246a67d..HEAD -- src/pages/Login.tsx` → exit 0, 0 commits. Remaining value is visual verification only. |
| E7 | Sidebar "More sections" not flattened | NONE (done) | Flattened | `Select-String -Recurse src -Pattern 'More sections'` → 0 matches. The dock is `FloatingDock` inside `<nav className="app-side-nav">` at `src/App.tsx:1045` and `src/components/ui/floating-dock.tsx`. `.floating-rail` survives only at `src/pages/SuperAdmin.tsx:517`, a live separate surface, so that CSS is not dead. |
| E8 | Wave backdrop and bundled photo | NONE (done) | Both in place | `Test-Path src\components\ui\wave-grid-background.tsx` → True. `AuthLayout.tsx` → 7 `wave`/`Wave` matches. `public\backdrop.jpg` → 311,840 bytes, matching the checkpoint. Unsplash survives only in `src/pages/Marketing.tsx:86` and the CSP allowlist at `vercel.json:11`, never as the auth backdrop. |
| E9 | Licence, legal review, store submission | BLOCKED (owner) | All three need the owner, money or counsel | `Test-Path LICENSE` → `False`; `Test-Path LICENSE-DECISION.md` → `True` (undecided). `Select-String MISSION.md -Pattern 'Store accounts do not exist'` → exit 0, hit at `L234`; pattern `requires counsel` → exit 0, hit at `L242`. Creating store accounts costs money and binds the owner, so neither is a worker action. |

---

## F. Tooling and maintainability

| ID | Item | Status | Verdict | Evidence (command, exit code, observed output) |
|---|---|---|---|---|
| F1 | "`scripts/shots.mjs` still targets removed `.floating-rail`/`.rail-more-menu` and screenshots the marketing page" | NONE (done) | Rewritten already; the checkpoint's stale-script row is empty | `Select-String scripts\*.mjs -Pattern '.floating-rail'` → 0 matches; `.rail-more-menu` → 0 matches. `scripts/shots.mjs:11` defaults to `http://localhost:5173`, `:81` navigates to `${BASE}/login`, `:90` waits on `.app-side-nav` (6 matches in `src`). `AUDIT.md:195` records finding G1 as fixed during the audit. |
| F2 | One-off probe scripts must not be committed | NONE (done) | Already ignored; nothing to clean up, and one named file does not exist | `git check-ignore -v scripts/_card-shot.mjs` → exit 0, `.gitignore:47:scripts/_*.mjs`; same for `scripts/_nav-probe.mjs` and `scripts/_probe-shell.mjs`. `Test-Path scripts\_probe-columns.mjs` → `False`. |
| F3 | `mobile/` is untracked | NONE (stale) | Tracked | `git ls-files mobile` → 26 files. `git ls-files --error-unmatch mobile` → exit 0. |
| F4 | `scripts/responsive-audit.mjs` is untracked | NONE (stale) | Tracked | `git ls-files --error-unmatch scripts/responsive-audit.mjs` → exit 0. Committed in `ca8da20 Track the native member app and the responsive audit harness`. |
| F5 | Duplicate animation systems | NONE (stale) | Never duplicated; one direct dependency | `npm ls framer-motion` → exit 0, `└─ motion@14.9.0` then `└── framer-motion@14.9.0`, a transitive dependency. `package.json` read via `node -e` → `framer-motion: none`, `motion: ^14.9.0`, devDeps none. All four named files import `motion/react`: `animated-number.tsx`, `gooey-search.tsx`, `social-flip-button.tsx`, `spotlight-navbar.tsx`. Six `motion/react` importers total. |
| F6 | `App.tsx` is 184 KB in one component | ACTIONABLE | Real debt, but the checkpoint deliberately defers it, so open and unblocked | `Get-Item src\App.tsx` → 188,551 bytes, 4430 lines. `ISSUES.md` S3 records 47 `useState` in one component. 23 `.tsx` files under `src/components` (checkpoint said 25). |
| F7 | Skills tooling | NONE (fact) | Works, with one caveat | `npx skills --version` → `1.7.6`. `.agents\skills` holds 17 directories including `vercel-react-best-practices`. `git check-ignore -v .agents/skills/vercel-react-best-practices/SKILL.md` → exit 0 via `.gitignore:65`, so new skill installs are local-only while 261 older files under `.agents` stay tracked. |
| F8 | Design and status docs claimed absent | NONE (stale) | The checkpoint is wrong in both directions | `Test-Path` → `DESIGN.md` True, `DESIGN_AUDIT.md` True, `DESIGN_IMPLEMENTATION_PLAN.md` True, `AUDIT.md` True, `IMPLEMENTATION_PLAN.md` True, `SKILL_PROGRESS.md` True, `ISSUES.md` True. The checkpoint said the last four do not exist. `TWOPLUS_DESIGN.md` is False, but five other `TWOPLUS_*` docs exist. Do not create duplicates. |
| F9 | Stale comment in `.env.local` | ACTIONABLE | Cosmetic, local only, comment text only | `Select-String .env.local -Pattern '^# Migrations'` → exit 0, `L2: # Migrations 0001-0009 are applied. Probed 2026-11: every table the app queries`. D4 shows later migrations applied while D2 and D3 show `0005` and `0016` are not, so the claim is wrong. The file is gitignored (B6); edit the comment, never the values. |

---

## Verdict summary

Counts below are from the Status column above: 11 blocked, 5 actionable, 9 done,
7 stale claims, 16 verification rows.

**Blocked (11), all on the owner or on credentials:** `PGPASSWORD` (B2),
`SUPABASE_ACCESS_TOKEN` (B3), the sign-in test credentials that gate 11 tests and
the 4.5 contrast check (A8, B4), backup scheduling (C4), storage coverage (C5),
rehearsal re-run (C3), applying `0005` (D2) and `0016` (D3), migration-history
repair (D5), and the licence, legal and store items (E9). Both secrets are unset
at process, user and machine scope, so no migration, restore or gated test run can
happen on this host.

**Actionable now (5):** install the PostgreSQL client tools (B1, `winget`
`v1.29.380` is available), optionally add `supabase/config.toml` (B5, little
value without Docker), reconcile the `--glass-*` tokens with the
`--shell-bg`/`--topbar-bg` surfaces (E5), split `App.tsx` (F6, unblocked but
deliberately deferred by the checkpoint), and fix the stale `.env.local` comment
(F9).

**Done, remove from the backlog (9):** backup/restore rehearsal (C1) and its
runbook fixes (C2), migration dry-runs (D6), deploy and public site (E1), Login
one-time code (E6), sidebar flatten (E7), wave backdrop and bundled photo (E8),
the `shots.mjs` rewrite (F1), and probe-script exclusion (F2).

**Stale checkpoint claims (7):** HEAD `246a67d` (A1, A3), `.env` absent while
`.env.local` exists (B6), `mobile/` untracked (F3), `scripts/responsive-audit.mjs`
untracked (F4), duplicate `framer-motion` (F5), and four docs "missing" that exist
(F8). Separately, three done items were also claimed unfinished: the rehearsal
(C1), the deploy (E1) and the `shots.mjs` rewrite (F1).

**Do not follow from the checkpoint:** the `--disable-triggers` restore step
(C2), and the instruction not to commit `mobile/` or
`scripts/responsive-audit.mjs` (both already tracked, F3 and F4).
