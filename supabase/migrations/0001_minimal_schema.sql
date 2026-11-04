-- =============================================================================
-- Agental · Minimal backend schema
-- Two tables only: castings (public read) and leads (public insert).
-- RLS is ON, with narrow public policies so the publishable (anon) key can
-- read open castings and submit a lead, and nothing more.
-- =============================================================================

create table if not exists public.castings (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 3 and 140),
  category    text not null default 'background',
  city        text not null default '',
  status      text not null default 'open' check (status in ('draft', 'open', 'closed')),
  pay_min     numeric(10,2),
  pay_max     numeric(10,2),
  deadline    date,
  description text check (char_length(description) <= 4000),
  created_at  timestamptz not null default now()
);
create index if not exists castings_status_idx on public.castings (status, created_at);

create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  email      text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  kind       text not null check (kind in ('talent', 'director')),
  message    text check (char_length(message) <= 2000),
  created_at timestamptz not null default now(),
  unique (email, kind)
);

alter table public.castings enable row level security;
alter table public.leads    enable row level security;

-- Anyone (including the anonymous publishable key) may read OPEN castings.
create policy "public read open castings"
  on public.castings for select
  using (status = 'open');

-- Anyone may submit a lead. No select policy on leads, so the public key can
-- insert but never read other people's leads back.
create policy "public insert leads"
  on public.leads for insert
  with check (true);
