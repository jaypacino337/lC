-- SLUDGE batches: run once in the Supabase SQL editor (or `supabase db push`).
-- RLS is ON with NO policies: the anon/public key can't touch these tables.
-- Only the server (SUPABASE_SERVICE_ROLE_KEY, never exposed to the browser) reads/writes.

create table if not exists public.sludge_batches (
  mint        text primary key,             -- one row per coin the vat launched
  creator     text not null,                -- wallet that signed (fee payer)
  data        jsonb not null,               -- the whole Batch (name, symbol, image, signature, at…)
  created_at  timestamptz not null default now()
);

create table if not exists public.sludge_pending (
  mint        text primary key,             -- brews waiting for their create tx to confirm
  data        jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.sludge_batches enable row level security;
alter table public.sludge_pending enable row level security;

create index if not exists sludge_batches_created_at on public.sludge_batches (created_at desc);
create index if not exists sludge_batches_creator on public.sludge_batches (creator);
