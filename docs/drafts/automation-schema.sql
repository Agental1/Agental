-- DRAFT. NOT APPLIED. Review, try on a STAGING Supabase project first, then
-- turn it into a Prisma migration. Do not paste into production unreviewed.
-- Purpose: give n8n a tiny, pseudonymous corner of the database and nothing else.

create schema if not exists private;      -- identity mapping: backend only
create schema if not exists automation;   -- the only schema n8n can touch

-- 1. Identity mapping (backend only). Random ref, unrelated to the account id.
create table if not exists private.actor_refs (
  actor_ref   uuid primary key default gen_random_uuid(),
  profile_id  text not null unique,         -- "ArtistProfile".id
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz                   -- set when consent is withdrawn
);

-- 2. What n8n may know about an actor. Filled by the backend, read-only for n8n.
create table if not exists automation.actor_profiles (
  actor_ref         uuid primary key references private.actor_refs(actor_ref) on delete cascade,
  playing_age_min   int,
  playing_age_max   int,
  gender            text,
  languages         text[] not null default '{}',
  accents           text[] not null default '{}',
  specialties       text[] not null default '{}',
  skills            text[] not null default '{}',
  country           text,
  city              text,
  can_travel        boolean not null default false,
  min_rate_cents    int,
  active            boolean not null default true,
  updated_at        timestamptz not null default now()
);

-- 3. Castings found by n8n (public listing data only).
create table if not exists automation.castings (
  id                text primary key,        -- stable hash of the source URL
  source_url        text not null unique,
  title             text not null,
  status            text not null default 'open',
  requirements      jsonb not null default '{}',
  studio_contact    text,                    -- third-party public listing contact
  deadline          timestamptz,
  last_checked_at   timestamptz,
  created_at        timestamptz not null default now()
);

create table if not exists automation.evaluations (
  actor_ref     uuid not null references automation.actor_profiles(actor_ref) on delete cascade,
  casting_id    text not null references automation.castings(id) on delete cascade,
  status        text not null,               -- waiting_for_actor | needs_review | not_fit
  score         int,
  reasons       jsonb not null default '[]',
  evaluated_at  timestamptz not null default now(),
  primary key (actor_ref, casting_id)
);

-- Draft text with placeholders such as {{ACTOR_NAME}}. Never real identities.
create table if not exists automation.application_drafts (
  id             uuid primary key default gen_random_uuid(),
  actor_ref      uuid not null references automation.actor_profiles(actor_ref) on delete cascade,
  casting_id     text not null references automation.castings(id) on delete cascade,
  body_template  text not null,
  status         text not null default 'draft',   -- draft | approved | withdrawn
  created_at     timestamptz not null default now()
);

-- 4. The n8n role: automation schema only.
-- create role n8n_worker login password '<generate a long random one>' noinherit nocreatedb nocreaterole;
revoke all on schema public  from n8n_worker;
revoke all on schema private from n8n_worker;
grant usage on schema automation to n8n_worker;
grant select on automation.actor_profiles to n8n_worker;
grant select, insert, update on automation.castings, automation.evaluations, automation.application_drafts to n8n_worker;

-- 5. Lock the Prisma tables against Supabase's built-in REST API (anon key).
-- The app connects as a role that bypasses row-level security, so it is unaffected.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
revoke all on all tables in schema public from anon, authenticated;
