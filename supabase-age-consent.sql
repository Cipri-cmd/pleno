begin;

create table if not exists public.user_legal_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null check (char_length(terms_version) between 1 and 20),
  accepted_at timestamptz not null default now()
);

alter table public.user_legal_consents
  add column if not exists age_confirmed_at timestamptz;

alter table public.user_legal_consents enable row level security;
revoke all on public.user_legal_consents from public, anon, authenticated;
grant select, insert, update on public.user_legal_consents to authenticated;

drop policy if exists "Users read their own legal consent" on public.user_legal_consents;
create policy "Users read their own legal consent"
  on public.user_legal_consents for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users record their own legal consent" on public.user_legal_consents;
create policy "Users record their own legal consent"
  on public.user_legal_consents for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users update their own legal consent" on public.user_legal_consents;
create policy "Users update their own legal consent"
  on public.user_legal_consents for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

commit;
