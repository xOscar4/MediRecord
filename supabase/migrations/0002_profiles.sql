-- 0002 · Perfil mínimo, helpers y fecha local del usuario
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  timezone  text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (char_length(btrim(full_name)) between 1 and 120),
  constraint profiles_full_name_clean  check (full_name = btrim(full_name)),
  constraint profiles_timezone_format
    check (timezone ~ '^[A-Za-z][A-Za-z0-9_+\-]*(/[A-Za-z0-9_+\-]+)*$')
);

comment on table  public.profiles is 'Perfil mínimo: nombre visible y zona horaria IANA.';
comment on column public.profiles.timezone is 'Zona IANA; base de todos los cálculos de fecha local.';

-- Única fuente de "hoy" en todo el esquema.
create or replace function public.current_local_date()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone coalesce(
            (select p.timezone from public.profiles p where p.id = (select auth.uid())),
            'UTC'
          ))::date;
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.set_archived_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.is_active then
    new.archived_at := null;
  elsif new.archived_at is null then
    new.archived_at := now();
  end if;
  return new;
end $$;

create or replace function public.validate_profile_timezone()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.timezone is null
     or not exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = new.timezone) then
    raise exception 'Zona horaria no válida: %', coalesce(new.timezone, '(nula)')
      using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists profiles_validate_timezone on public.profiles;
create trigger profiles_validate_timezone
  before insert or update of timezone on public.profiles
  for each row execute function public.validate_profile_timezone();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
