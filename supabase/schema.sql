-- GastroGraph human evaluation — Supabase schema.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once: it creates missing tables/columns and leaves existing data alone.

create extension if not exists pgcrypto;

-- ── Participants ───────────────────────────────────────────────────────────
create table if not exists public.participants (
  id                     uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  session_id             uuid not null unique,
  name                   text not null,
  email                  text,
  institution            text,
  age_group              text,
  gender                 text,
  profession             text,
  ingredient_familiarity smallint check (ingredient_familiarity between 1 and 5)
);

-- ── Responses (one row per answered question) ──────────────────────────────
create table if not exists public.responses (
  id                      bigint generated always as identity primary key,
  created_at              timestamptz not null default now(),
  session_id              uuid not null,
  round_number            smallint not null,
  question_number         smallint not null,
  ingredient              text not null,
  option_a                text not null,
  option_b                text not null,
  gastrograph_option      text not null,
  selected_option         text not null,
  selected_ingredient     text not null,
  is_gastrograph_selected boolean not null,
  response_time_ms        integer
);

-- Columns added for the 3-way comparison (GastroGraph vs embedding baseline vs Context Reranker).
alter table public.responses add column if not exists recipe                text;
alter table public.responses add column if not exists option_c              text;
alter table public.responses add column if not exists embedding_option      text;
alter table public.responses add column if not exists context_option        text;
alter table public.responses add column if not exists is_embedding_selected boolean;
alter table public.responses add column if not exists is_context_selected   boolean;

create index if not exists responses_session_idx on public.responses (session_id);

-- ── Row Level Security ─────────────────────────────────────────────────────
-- The site uses the public anon key, so visitors may only INSERT.
-- Nobody can read data with the anon key; you read it in the dashboard (which bypasses RLS).
alter table public.participants enable row level security;
alter table public.responses    enable row level security;

drop policy if exists "anon can insert participants" on public.participants;
create policy "anon can insert participants" on public.participants
  for insert to anon with check (true);

drop policy if exists "anon can insert responses" on public.responses;
create policy "anon can insert responses" on public.responses
  for insert to anon with check (true);

-- ── Handy summary (run in SQL editor) ──────────────────────────────────────
create or replace view public.model_win_rates
with (security_invoker = true) as
select
  count(*)                                                        as answers,
  count(distinct session_id)                                      as participants,
  round(100.0 * avg(is_gastrograph_selected::int), 1)             as gastrograph_pct,
  round(100.0 * avg(is_embedding_selected::int), 1)               as embedding_pct,
  round(100.0 * avg(is_context_selected::int), 1)                 as context_reranker_pct
from public.responses
where is_context_selected is not null;
