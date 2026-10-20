create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 500),
  image_url text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (char_length(body) > 0 or image_url is not null)
);

create index if not exists stories_expires_at_idx on public.stories (expires_at desc);

alter table public.stories enable row level security;

grant select on public.stories to anon, authenticated;
grant insert, delete on public.stories to authenticated;

drop policy if exists "Active stories are visible to everyone" on public.stories;
create policy "Active stories are visible to everyone"
on public.stories for select to anon, authenticated using (expires_at > now());

drop policy if exists "Users create their own stories" on public.stories;
create policy "Users create their own stories"
on public.stories for insert to authenticated with check ((select auth.uid()) = author_id);

drop policy if exists "Users delete their own stories" on public.stories;
create policy "Users delete their own stories"
on public.stories for delete to authenticated using ((select auth.uid()) = author_id);
