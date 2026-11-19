/**
 * In-process Postgres (PGlite) with the minimum of Supabase's platform schema
 * the migrations depend on: the anon/authenticated/service_role roles, an
 * auth.users table with auth.uid()/auth.jwt(), and storage.buckets/objects.
 *
 * shortcut: this proves SQL, RLS and RPC behaviour, not PostgREST, GoTrue or
 * the Storage API; rerun the same scenarios against a staging project before
 * any production claim.
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

const MIGRATIONS = new URL("../migrations/", import.meta.url);

const PLATFORM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as
  $$ select coalesce(auth.jwt() ->> 'role', 'anon') $$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant all on storage.objects, storage.buckets to authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant execute on all functions in schema storage to anon, authenticated, service_role;
`;

export function migrationFiles() {
  return readdirSync(MIGRATIONS).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
}

/** A fresh database with every migration applied, in filename order. */
export async function freshDb({ upTo } = {}) {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(PLATFORM);
  for (const file of migrationFiles()) {
    if (upTo && file > upTo) break;
    try {
      await db.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));
    } catch (e) {
      throw new Error(`${file}: ${e.message}`);
    }
  }
  return db;
}

/** Create an auth user (the 0001 trigger makes the profile). */
export async function user(db, email) {
  const id = randomUUID();
  await db.query(
    "insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)",
    [id, email, { full_name: email.split("@")[0] }],
  );
  return { id, email };
}

/**
 * Run `fn` as an authenticated user, inside a transaction that is rolled
 * back only on error. RLS applies because the role is not a superuser.
 */
export async function as(db, who, fn) {
  return db.transaction(async (tx) => {
    const claims = who ? { sub: who.id, email: who.email, role: "authenticated" } : { role: "anon" };
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [who?.id ?? ""]);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await tx.exec(`set local role ${who ? "authenticated" : "anon"}`);
    return fn(tx);
  });
}

/** Run as the database owner (fixtures, assertions on raw state). */
export const admin = (db, sql, params) => db.query(sql, params);
