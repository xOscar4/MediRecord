-- 0006 · Ocurrencias de dosis: historial inmutable
create table if not exists public.dose_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  medication_id uuid references public.medications (id) on delete set null,
  schedule_id uuid references public.medication_schedules (id) on delete set null,
  scheduled_at timestamptz not null,
  local_date date not null,
  local_time time not null,
  timezone text not null,
  status text not null default 'pending',
  resolved_at timestamptz,
  resolution_reason text,
  notes text,
  medication_name_snapshot text not null,
  dose_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint occurrences_status check (status in ('pending','taken','skipped')),
  constraint occurrences_reason check (resolution_reason is null or resolution_reason in
    ('manual','schedule_changed','medication_archived')),
  constraint occurrences_resolution_consistency check (
    (status =  'pending' and resolved_at is null     and resolution_reason is null) or
    (status <> 'pending' and resolved_at is not null and resolution_reason is not null)
  ),
  constraint occurrences_notes_length check (notes is null or char_length(notes) <= 500),
  constraint occurrences_snapshot_length check (char_length(medication_name_snapshot) between 1 and 120),
  constraint occurrences_schedule_requires_medication
    check (schedule_id is null or medication_id is not null)
);

create unique index if not exists occurrences_schedule_instant_uniq
  on public.dose_occurrences (schedule_id, scheduled_at) where schedule_id is not null;
create unique index if not exists occurrences_orphan_instant_uniq
  on public.dose_occurrences
     (user_id, coalesce(medication_id, '00000000-0000-0000-0000-000000000000'::uuid), scheduled_at)
  where schedule_id is null;
create index if not exists occurrences_user_timeline_idx
  on public.dose_occurrences (user_id, scheduled_at desc);
create index if not exists occurrences_user_pending_idx
  on public.dose_occurrences (user_id, scheduled_at) where status = 'pending';
create index if not exists occurrences_user_local_date_idx
  on public.dose_occurrences (user_id, local_date);
create index if not exists occurrences_medication_idx on public.dose_occurrences (medication_id);
create index if not exists occurrences_schedule_idx   on public.dose_occurrences (schedule_id);

create or replace function public.dose_occurrences_guard()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tz text; v_reason text; v_reschedule boolean;
begin
  if tg_op = 'INSERT' then
    if v_uid is not null and new.user_id <> v_uid then
      raise exception 'No puedes crear tomas para otro usuario.' using errcode = '42501';
    end if;

    if new.medication_id is not null and not exists (
      select 1 from public.medications m
       where m.id = new.medication_id and m.user_id = new.user_id) then
      raise exception 'El medicamento no pertenece al usuario de la toma.' using errcode = '42501';
    end if;

    if new.schedule_id is not null then
      if new.medication_id is null then
        raise exception 'Una toma con horario debe tener medicamento.' using errcode = '23514';
      end if;
      if not exists (
        select 1 from public.medication_schedules s
          join public.medications m on m.id = s.medication_id
         where s.id = new.schedule_id
           and s.medication_id = new.medication_id
           and m.user_id = new.user_id) then
        raise exception 'El horario no pertenece al medicamento o al usuario de la toma.'
          using errcode = '42501';
      end if;
    end if;

    select p.timezone into v_tz from public.profiles p where p.id = new.user_id;
    if v_tz is null then
      raise exception 'Perfil no encontrado para la toma.' using errcode = '42501';
    end if;

    new.timezone   := v_tz;
    new.local_date := (new.scheduled_at at time zone v_tz)::date;
    new.local_time := (new.scheduled_at at time zone v_tz)::time;
    new.status := 'pending';
    new.resolved_at := null;
    new.resolution_reason := null;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if current_user in ('authenticated','anon') then
      raise exception 'Las tomas no se eliminan: se marcan como tomadas u omitidas.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  v_reschedule := coalesce(current_setting('app.occurrence_reschedule', true), '') = 'on';

  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at
     or new.medication_name_snapshot is distinct from old.medication_name_snapshot
     or new.dose_snapshot is distinct from old.dose_snapshot then
    raise exception 'Los datos históricos de la toma son inmutables.' using errcode = '42501';
  end if;

  -- Integridad: si el sistema anula el medicamento, el horario también.
  if old.medication_id is not null and new.medication_id is null and new.schedule_id is not null then
    new.schedule_id := null;
  end if;

  if new.medication_id is distinct from old.medication_id and new.medication_id is not null then
    raise exception 'No se puede reasignar el medicamento de una toma.' using errcode = '42501';
  end if;
  if new.schedule_id is distinct from old.schedule_id and new.schedule_id is not null then
    raise exception 'No se puede reasignar el horario de una toma.' using errcode = '42501';
  end if;

  if v_reschedule then
    if old.status <> 'pending' then
      raise exception 'Solo se pueden recalcular tomas pendientes.' using errcode = '42501';
    end if;
    select p.timezone into v_tz from public.profiles p where p.id = new.user_id;
    new.timezone   := coalesce(v_tz, old.timezone);
    new.local_date := (new.scheduled_at at time zone new.timezone)::date;
    new.local_time := (new.scheduled_at at time zone new.timezone)::time;
  elsif new.scheduled_at is distinct from old.scheduled_at
     or new.local_date   is distinct from old.local_date
     or new.local_time   is distinct from old.local_time
     or new.timezone     is distinct from old.timezone then
    raise exception 'La programación de una toma no se puede modificar.' using errcode = '42501';
  end if;

  if old.status <> 'pending' then
    if new.status is distinct from old.status
       or new.notes is distinct from old.notes
       or new.resolved_at is distinct from old.resolved_at
       or new.resolution_reason is distinct from old.resolution_reason then
      raise exception 'La toma ya fue resuelta y no se puede modificar.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status = 'pending' then
    new.resolved_at := null;
    new.resolution_reason := null;
  else
    v_reason := nullif(btrim(coalesce(current_setting('app.occurrence_reason', true), '')), '');
    if v_reason is null or v_reason not in ('manual','schedule_changed','medication_archived') then
      v_reason := 'manual';
    end if;
    new.resolved_at := now();
    new.resolution_reason := v_reason;
  end if;
  return new;
end $$;

drop trigger if exists dose_occurrences_guard on public.dose_occurrences;
create trigger dose_occurrences_guard
  before insert or update or delete on public.dose_occurrences
  for each row execute function public.dose_occurrences_guard();

drop trigger if exists dose_occurrences_set_updated_at on public.dose_occurrences;
create trigger dose_occurrences_set_updated_at
  before update on public.dose_occurrences
  for each row execute function public.set_updated_at();
