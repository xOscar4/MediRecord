-- 0005 · Horarios y restricción de solapamiento (GiST)
create table if not exists public.medication_schedules (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete cascade,
  time_of_day time not null,
  days_of_week integer[] not null,
  start_date date not null,
  end_date date,
  is_active boolean not null default true,
  archived_at timestamptz,
  occurrences_generated_through date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedules_time_whole_minutes check (date_trunc('minute', time_of_day)::time = time_of_day),
  constraint schedules_days_not_empty     check (cardinality(days_of_week) between 1 and 7),
  constraint schedules_days_no_nulls      check (array_position(days_of_week, null) is null),
  constraint schedules_days_range         check (days_of_week <@ array[1,2,3,4,5,6,7]),
  constraint schedules_dates_order        check (end_date is null or end_date >= start_date),
  constraint schedules_flag_consistency   check (is_active = (archived_at is null)),
  constraint schedules_notes_length       check (notes is null or char_length(notes) <= 500),
  constraint schedules_cursor_consistency
    check (occurrences_generated_through is null or occurrences_generated_through >= start_date - 1)
);

create index if not exists schedules_medication_idx on public.medication_schedules (medication_id);
create index if not exists schedules_active_idx
  on public.medication_schedules (medication_id) where is_active;

-- Preflight: opclasses y operador && de integer[] en el esquema "extensions".
do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_operator o
      join pg_catalog.pg_namespace n on n.oid = o.oprnamespace
     where n.nspname = 'extensions'
       and o.oprname = '&&'
       and o.oprleft  = 'integer[]'::pg_catalog.regtype
       and o.oprright = 'integer[]'::pg_catalog.regtype
  ) then
    raise exception 'intarray no expone extensions.&&(integer[], integer[]).';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_opclass oc
      join pg_catalog.pg_namespace n on n.oid = oc.opcnamespace
      join pg_catalog.pg_am am on am.oid = oc.opcmethod
     where am.amname = 'gist'
       and n.nspname = 'extensions'
       and oc.opcname = 'gist__int_ops'
  ) then
    raise exception 'Falta la operator class extensions.gist__int_ops.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_opclass oc
      join pg_catalog.pg_am am on am.oid = oc.opcmethod
     where am.amname = 'gist'
       and oc.opcintype = 'uuid'::pg_catalog.regtype
       and oc.opcdefault
  ) then
    raise exception 'btree_gist no ofrece opclass GiST por defecto para uuid.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_opclass oc
      join pg_catalog.pg_am am on am.oid = oc.opcmethod
     where am.amname = 'gist'
       and oc.opcintype = 'time'::pg_catalog.regtype
       and oc.opcdefault
  ) then
    raise exception 'btree_gist no ofrece opclass GiST por defecto para time.';
  end if;
end $$;

-- Los operadores del EXCLUDE se resuelven con el search_path de la sesión.
-- intarray vive en "extensions": hay que incluirlo o "days_of_week WITH &&"
-- resuelve al operador polimórfico de pg_catalog (no miembro de gist__int_ops).
set search_path = public, extensions, pg_catalog;

alter table public.medication_schedules
  drop constraint if exists medication_schedules_no_overlap;

alter table public.medication_schedules
  add constraint medication_schedules_no_overlap
  exclude using gist (
    medication_id with =,
    time_of_day   with =,
    daterange(start_date, coalesce(end_date, 'infinity'::date), '[]') with &&,
    days_of_week  extensions.gist__int_ops with &&
  ) where (is_active);

reset search_path;

create or replace function public.validate_schedule()
returns trigger language plpgsql set search_path = ''
as $$
declare v_today date; v_days integer[];
begin
  select array_agg(d order by d) into v_days
    from (select distinct unnest(new.days_of_week) as d) s;

  if v_days is null or cardinality(v_days) = 0 then
    raise exception 'Selecciona al menos un día de la semana.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_days) as d where d < 1 or d > 7) then
    raise exception 'Los días deben ir de 1 (lunes) a 7 (domingo).' using errcode = '22023';
  end if;
  new.days_of_week := v_days;

  v_today := public.current_local_date();

  if tg_op = 'INSERT' then
    new.start_date := coalesce(new.start_date, v_today);
    new.occurrences_generated_through := null;
    new.archived_at := case when new.is_active then null else now() end;
    if new.start_date < v_today - 30 or new.start_date > v_today + 365 then
      raise exception 'La fecha de inicio debe estar entre % y % (fecha local).',
        v_today - 30, v_today + 365 using errcode = '22023';
    end if;
  else
    new.start_date := old.start_date;
    new.created_at := old.created_at;
  end if;

  if not new.is_active and new.end_date is null then
    new.end_date := greatest(v_today, new.start_date);
  end if;
  if new.end_date is not null and new.end_date < new.start_date then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio.' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists schedules_validate on public.medication_schedules;
create trigger schedules_validate before insert or update on public.medication_schedules
  for each row execute function public.validate_schedule();

drop trigger if exists schedules_set_archived_at on public.medication_schedules;
create trigger schedules_set_archived_at before insert or update on public.medication_schedules
  for each row execute function public.set_archived_at();

drop trigger if exists schedules_set_updated_at on public.medication_schedules;
create trigger schedules_set_updated_at before update on public.medication_schedules
  for each row execute function public.set_updated_at();
