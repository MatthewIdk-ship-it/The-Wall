create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_handle text;
begin
  requested_handle := new.raw_user_meta_data ->> 'handle';
  if requested_handle is null or requested_handle !~* '^[a-z0-9._-]{3,32}$' then
    raise exception using errcode = '23514', message = 'Invalid username';
  end if;

  insert into public.profiles (id, display_name, handle)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 48),
    lower(requested_handle)
  );
  return new;
end;
$$;

grant update (display_name, handle, avatar_url) on public.profiles to authenticated;
