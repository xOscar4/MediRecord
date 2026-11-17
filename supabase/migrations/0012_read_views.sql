-- 0012 · Vistas de lectura y utilidad de limpieza de fotos
--
-- La vista corre con los privilegios de quien consulta (security_invoker = true):
-- las políticas RLS y los permisos de columna de dose_occurrences/medications
-- se aplican igual que en un SELECT directo. No amplía nada.
--
-- No expone resolved_at ni resolution_reason: esos datos son internos y el rol
-- authenticated no tiene privilegio de columna sobre ellos (0009).

create or replace view public.dose_occurrences_view
with (security_invoker = true)
as
select
  d.id,
  d.user_id,
  d.medication_id,
  d.schedule_id,
  d.scheduled_at,
  d.local_date,
  d.local_time,
  d.timezone,
  d.status,
  (d.status = 'pending' and d.scheduled_at < now()) as is_overdue,
  d.medication_name_snapshot,
  d.dose_snapshot,
  d.notes,
  d.created_at,
  d.updated_at,
  m.name          as medication_name,
  m.dose_amount   as medication_dose_amount,
  m.is_active     as medication_is_active,
  m.photo_path    as medication_photo_path
from public.dose_occurrences d
left join public.medications m on m.id = d.medication_id;

comment on view public.dose_occurrences_view is
  'Timeline de tomas con is_overdue y datos vivos del medicamento (puede ser null si fue eliminado).';

revoke all on public.dose_occurrences_view from public, anon;
grant select on public.dose_occurrences_view to authenticated;

-- Archivos del propio usuario en el bucket que no coinciden con la foto
-- referenciada por su medicamento (o cuyo medicamento ya no existe).
-- Sirve para limpieza explícita desde la app; nunca borra por sí sola.
create or replace function public.list_orphan_photo_paths()
returns table (
  path          text,
  medication_id uuid,
  reason        text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  return query
    select o.name,
           m.id,
           case when m.id is null then 'medication_missing' else 'not_referenced' end
      from storage.objects o
      left join public.medications m
        on m.user_id = v_uid
       and m.id::text = split_part(o.name, '/', 2)
     where o.bucket_id = 'medication-photos'
       and split_part(o.name, '/', 1) = v_uid::text
       and (m.id is null or m.photo_path is distinct from o.name)
     order by o.name;
end $$;

revoke all on function public.list_orphan_photo_paths() from public, anon, authenticated;
grant execute on function public.list_orphan_photo_paths() to authenticated;

-- Aserciones: vista no privilegiada y con security_invoker activo.
do $$
declare v_opts text[];
begin
  select c.reloptions into v_opts
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'dose_occurrences_view';

  if v_opts is null or not ('security_invoker=true' = any (v_opts)) then
    raise exception 'dose_occurrences_view debe tener security_invoker = true.';
  end if;

  if has_table_privilege('anon', 'public.dose_occurrences_view', 'select') then
    raise exception 'anon no debe leer dose_occurrences_view.';
  end if;

  if not has_table_privilege('authenticated', 'public.dose_occurrences_view', 'select') then
    raise exception 'authenticated debe leer dose_occurrences_view.';
  end if;

  if has_function_privilege('anon', 'public.list_orphan_photo_paths()', 'execute') then
    raise exception 'anon no debe ejecutar list_orphan_photo_paths().';
  end if;
end $$;
