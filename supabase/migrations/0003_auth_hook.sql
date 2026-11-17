-- 0003 · Alta automática del perfil al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_full_name text;
  v_timezone  text;
begin
  v_full_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  if v_full_name is null then
    v_full_name := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
  end if;
  v_full_name := left(coalesce(v_full_name, 'Usuario'), 120);

  v_timezone := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'timezone', '')), '');
  if v_timezone is null
     or not exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = v_timezone) then
    v_timezone := 'UTC';
  end if;

  insert into public.profiles (id, full_name, timezone)
  values (new.id, v_full_name, v_timezone)
  on conflict (id) do nothing;

  return new;
end $$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.handle_new_user() to supabase_auth_admin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
