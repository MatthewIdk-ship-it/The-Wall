create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 48),
  handle text not null unique check (handle ~ '^[a-z0-9._-]{3,32}$'),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 1000),
  image_url text,
  created_at timestamptz not null default now(),
  check (char_length(body) > 0 or image_url is not null)
);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 500),
  image_url text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (char_length(body) > 0 or image_url is not null)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.saved_posts (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followed_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('follow', 'post', 'comment', 'mention')),
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  check (user_id <> actor_id)
);

create index posts_created_at_idx on public.posts (created_at desc);
create index posts_author_id_idx on public.posts (author_id, created_at desc);
create index stories_expires_at_idx on public.stories (expires_at desc);
create index comments_post_id_idx on public.comments (post_id, created_at);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index profiles_handle_idx on public.profiles (handle);

create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_handle text;
begin
  normalized_handle := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1)), '[^a-zA-Z0-9._-]', '', 'g'));
  normalized_handle := left(normalized_handle, 23);
  if length(normalized_handle) < 3 then
    normalized_handle := 'member';
  end if;

  insert into public.profiles (id, display_name, handle)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 48),
    normalized_handle || '-' || substr(replace(new.id::text, '-', ''), 1, 6)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();

create function public.notify_new_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, actor_id, type)
  values (new.followed_id, new.follower_id, 'follow');
  return new;
end;
$$;

create trigger on_follow_created
after insert on public.follows
for each row execute procedure public.notify_new_follow();

create function public.notify_new_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  follower record;
  mentioned_handle text[];
  mentioned_profile record;
begin
  for follower in
    select follower_id from public.follows where followed_id = new.author_id
  loop
    insert into public.notifications (user_id, actor_id, type, post_id)
    values (follower.follower_id, new.author_id, 'post', new.id);
  end loop;

  for mentioned_handle in
    select regexp_matches(coalesce(new.body, ''), '@([A-Za-z0-9_.-]+)', 'g')
  loop
    select id into mentioned_profile from public.profiles
    where handle = lower(mentioned_handle[1]);
    if found and mentioned_profile.id <> new.author_id then
      insert into public.notifications (user_id, actor_id, type, post_id)
      values (mentioned_profile.id, new.author_id, 'mention', new.id);
    end if;
  end loop;
  return new;
end;
$$;

create trigger on_post_created
after insert on public.posts
for each row execute procedure public.notify_new_post();

create function public.notify_new_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_author uuid;
  mentioned_handle text[];
  mentioned_profile record;
begin
  select author_id into post_author from public.posts where id = new.post_id;
  if post_author <> new.author_id then
    insert into public.notifications (user_id, actor_id, type, post_id, comment_id)
    values (post_author, new.author_id, 'comment', new.post_id, new.id);
  end if;

  for mentioned_handle in
    select regexp_matches(new.body, '@([A-Za-z0-9_.-]+)', 'g')
  loop
    select id into mentioned_profile from public.profiles
    where handle = lower(mentioned_handle[1]);
    if found and mentioned_profile.id not in (new.author_id, post_author) then
      insert into public.notifications (user_id, actor_id, type, post_id, comment_id)
      values (mentioned_profile.id, new.author_id, 'mention', new.post_id, new.id);
    end if;
  end loop;
  return new;
end;
$$;

create trigger on_comment_created
after insert on public.comments
for each row execute procedure public.notify_new_comment();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.stories enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.saved_posts enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;

grant select on public.profiles to anon, authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant select on public.posts to anon, authenticated;
grant insert, delete on public.posts to authenticated;
grant select on public.stories to anon, authenticated;
grant insert, delete on public.stories to authenticated;
grant select on public.comments to anon, authenticated;
grant insert, delete on public.comments to authenticated;
grant select on public.post_likes to anon, authenticated;
grant insert, delete on public.post_likes to authenticated;
grant select, insert, delete on public.saved_posts to authenticated;
grant select, insert, delete on public.follows to authenticated;
grant select, update (read) on public.notifications to authenticated;

create policy "Profiles are visible to everyone"
on public.profiles for select to anon, authenticated using (true);
create policy "Users update their own profile"
on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Posts are visible to everyone"
on public.posts for select to anon, authenticated using (true);
create policy "Users create their own posts"
on public.posts for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "Users delete their own posts"
on public.posts for delete to authenticated using ((select auth.uid()) = author_id);

create policy "Active stories are visible to everyone"
on public.stories for select to anon, authenticated using (expires_at > now());
create policy "Users create their own stories"
on public.stories for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "Users delete their own stories"
on public.stories for delete to authenticated using ((select auth.uid()) = author_id);

create policy "Comments are visible to everyone"
on public.comments for select to anon, authenticated using (true);
create policy "Authenticated users create comments"
on public.comments for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "Users delete their own comments"
on public.comments for delete to authenticated using ((select auth.uid()) = author_id);

create policy "Likes are visible to everyone"
on public.post_likes for select to anon, authenticated using (true);
create policy "Users add their own likes"
on public.post_likes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users remove their own likes"
on public.post_likes for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users view their own saved posts"
on public.saved_posts for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users save their own posts"
on public.saved_posts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users unsave their own posts"
on public.saved_posts for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Authenticated users can view follows"
on public.follows for select to authenticated using (true);
create policy "Users follow from their own account"
on public.follows for insert to authenticated with check ((select auth.uid()) = follower_id);
create policy "Users unfollow from their own account"
on public.follows for delete to authenticated using ((select auth.uid()) = follower_id);

create policy "Users read their own notifications"
on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users mark their own notifications read"
on public.notifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Post images are publicly readable"
on storage.objects for select to anon, authenticated using (bucket_id = 'post-images');
create policy "Users upload post images to their own folder"
on storage.objects for insert to authenticated with check (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "Users delete their own post images"
on storage.objects for delete to authenticated using (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
