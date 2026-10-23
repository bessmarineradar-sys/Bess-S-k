create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mmsi text not null check (mmsi ~ '^[0-9]{9}$'),
  vessel_name text not null,
  vessel_type text,
  destination text,
  company text,
  call_sign text,
  imo text,
  draught text,
  length_m integer,
  beam_m integer,
  eta text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'follow_up', 'qualified', 'closed', 'not_relevant')),
  notes text not null default '' check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mmsi)
);

create index if not exists prospects_user_updated_idx
  on public.prospects (user_id, updated_at desc);

alter table public.prospects enable row level security;

create policy "Users can read their own prospects"
  on public.prospects for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own prospects"
  on public.prospects for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own prospects"
  on public.prospects for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own prospects"
  on public.prospects for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_prospect_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger prospects_updated_at
  before update on public.prospects
  for each row execute function public.set_prospect_updated_at();

grant select, insert, update, delete on public.prospects to authenticated;
