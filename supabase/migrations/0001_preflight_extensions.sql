-- 0001 · Preflight y extensiones requeridas
do $$
declare
  v_version integer := current_setting('server_version_num')::integer;
begin
  if v_version < 170000 then
    raise exception 'Se requiere PostgreSQL 17 o superior (encontrado %).', v_version;
  end if;
  if to_regnamespace('extensions') is null then
    raise exception 'Falta el esquema "extensions".';
  end if;
  if to_regprocedure('pg_catalog.gen_random_uuid()') is null then
    raise exception 'Falta pg_catalog.gen_random_uuid().';
  end if;
  if to_regclass('pg_catalog.pg_timezone_names') is null then
    raise exception 'Falta pg_catalog.pg_timezone_names.';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'Falta auth.users.';
  end if;
  if to_regclass('storage.buckets') is null then
    raise exception 'Falta storage.buckets.';
  end if;
  if to_regprocedure('storage.foldername(text)') is null then
    raise exception 'Falta storage.foldername(text).';
  end if;
end $$;

create extension if not exists btree_gist with schema extensions;
create extension if not exists intarray   with schema extensions;
