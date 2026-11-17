-- 0007 · Funciones de negocio (generación, archivado, edición, fotos, zona horaria)
-- Limpieza de sobrecargas antiguas: ninguna debe sobrevivir con permisos heredados.
drop function if exists public.set_schedule_end_date(uuid, date);

create or replace function public.sync_dose_occurrences(
  p_chunk_days integer default 90, p_horizon_days integer default 14)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tz text; v_today date;
  v_chunk   integer := greatest(1, least(coalesce(p_chunk_days, 90), 180));
  v_horizon integer := greatest(1, least(coalesce(p_horizon_days, 14), 30));
  v_floor date; v_sched record;
  v_from date; v_target date; v_to date;
  v_rows bigint; v_inserted bigint := 0; v_remaining integer := 0;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  select p.timezone into v_tz from public.profiles p where p.id = v_uid;
  if v_tz is null then
    raise exception 'Perfil no encontrado.' using errcode = '42501';
  end if;

  v_today := (now() at time zone v_tz)::date;
  v_floor := v_today - 3650;

  -- Los archivados solo se procesan mientras su cursor no alcance su fin:
  -- así se recupera el hueco de quien archivó sin volver a sincronizar.
  for v_sched in
    select s.id, s.medication_id, s.time_of_day, s.days_of_week,
           s.start_date, s.end_date, s.occurrences_generated_through,
           m.name as medication_name, m.dose_amount,
           (m.is_active and s.is_active) as is_open
      from public.medication_schedules s
      join public.medications m on m.id = s.medication_id
     where m.user_id = v_uid
       and ( (m.is_active and s.is_active)
             or coalesce(s.occurrences_generated_through, s.start_date - 1)
                < coalesce(s.end_date, v_today) )
     order by s.id
       for update of s
  loop
    v_from := greatest(
                coalesce(v_sched.occurrences_generated_through + 1, v_sched.start_date),
                v_floor);
    v_target := least(
                  coalesce(v_sched.end_date, v_today + v_horizon),
                  v_today + v_horizon);

    if not v_sched.is_open then
      v_target := least(v_target, v_today);
    end if;

    if v_target < v_from then
      continue;
    end if;
    v_to := least(v_target, v_from + (v_chunk - 1));

    insert into public.dose_occurrences (
      user_id, medication_id, schedule_id, scheduled_at,
      local_date, local_time, timezone,
      medication_name_snapshot, dose_snapshot, status)
    select v_uid, v_sched.medication_id, v_sched.id,
           (g.d::date + v_sched.time_of_day) at time zone v_tz,
           g.d::date, v_sched.time_of_day, v_tz,
           v_sched.medication_name, v_sched.dose_amount, 'pending'
      from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') as g(d)
     where extract(isodow from g.d)::integer = any (v_sched.days_of_week)
    on conflict do nothing;

    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;

    update public.medication_schedules
       set occurrences_generated_through = v_to
     where id = v_sched.id;

    v_remaining := greatest(v_remaining, (v_target - v_to)::integer);
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'timezone', v_tz,
    'today_local', v_today,
    'remaining_days', v_remaining,
    'more', v_remaining > 0);
end $$;

create or replace function public.archive_schedule(
  p_schedule_id uuid, p_skip_future boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_sched public.medication_schedules;
  v_skipped bigint := 0;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select s.* into v_sched
    from public.medication_schedules s
    join public.medications m on m.id = s.medication_id
   where s.id = p_schedule_id and m.user_id = v_uid
     for update of s;

  if v_sched.id is null then
    raise exception 'Horario no encontrado.' using errcode = '42501';
  end if;
  if not v_sched.is_active then
    return jsonb_build_object('schedule_id', p_schedule_id, 'archived', true,
                              'already_archived', true, 'skipped_future', 0);
  end if;

  update public.medication_schedules set is_active = false where id = p_schedule_id;

  if p_skip_future then
    perform set_config('app.occurrence_reason', 'schedule_changed', true);
    update public.dose_occurrences
       set status = 'skipped'
     where user_id = v_uid
       and schedule_id = p_schedule_id
       and status = 'pending'
       and scheduled_at >= now();
    get diagnostics v_skipped = row_count;
    perform set_config('app.occurrence_reason', '', true);
  end if;

  return jsonb_build_object('schedule_id', p_schedule_id, 'archived', true,
                            'already_archived', false, 'skipped_future', v_skipped);
end $$;

create or replace function public.replace_schedule(
  p_schedule_id uuid,
  p_time_of_day time default null,
  p_days_of_week integer[] default null,
  p_start_date date default null,
  p_notes text default null,
  p_skip_future boolean default true)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_old public.medication_schedules;
  v_tz text; v_today date; v_start date;
  v_start_instant timestamptz;
  v_new_id uuid; v_skipped bigint := 0;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select s.* into v_old
    from public.medication_schedules s
    join public.medications m on m.id = s.medication_id
   where s.id = p_schedule_id and m.user_id = v_uid
     for update of s;

  if v_old.id is null then
    raise exception 'Horario no encontrado.' using errcode = '42501';
  end if;
  if not v_old.is_active then
    raise exception 'El horario ya está cerrado. Crea uno nuevo.' using errcode = '23514';
  end if;

  select p.timezone into v_tz from public.profiles p where p.id = v_uid;
  v_today := (now() at time zone v_tz)::date;

  if p_start_date is not null and p_start_date < v_today then
    raise exception 'La nueva fecha de inicio no puede ser anterior a hoy (%).', v_today
      using errcode = '22023';
  end if;

  v_start := coalesce(p_start_date, v_today);

  -- Si empieza hoy pero esa hora ya pasó, se traslada a mañana.
  if v_start = v_today
     and (v_today + coalesce(p_time_of_day, v_old.time_of_day)) at time zone v_tz <= now() then
    v_start := v_today + 1;
  end if;
  v_start_instant := (v_start::timestamp at time zone v_tz);

  update public.medication_schedules
     set is_active = false,
         end_date = case
                      when v_start - 1 >= start_date
                        then least(coalesce(end_date, v_start - 1), v_start - 1)
                      else end_date
                    end
   where id = p_schedule_id;

  insert into public.medication_schedules
    (medication_id, time_of_day, days_of_week, start_date, notes)
  values
    (v_old.medication_id,
     coalesce(p_time_of_day, v_old.time_of_day),
     coalesce(p_days_of_week, v_old.days_of_week),
     v_start,
     coalesce(p_notes, v_old.notes))
  returning id into v_new_id;

  if p_skip_future then
    perform set_config('app.occurrence_reason', 'schedule_changed', true);
    update public.dose_occurrences
       set status = 'skipped'
     where user_id = v_uid
       and schedule_id = p_schedule_id
       and status = 'pending'
       and scheduled_at >= greatest(now(), v_start_instant);
    get diagnostics v_skipped = row_count;
    perform set_config('app.occurrence_reason', '', true);
  end if;

  perform public.sync_dose_occurrences();

  return jsonb_build_object('closed_schedule_id', p_schedule_id,
                            'new_schedule_id', v_new_id,
                            'start_date', v_start,
                            'skipped_future', v_skipped);
end $$;

create or replace function public.archive_medication(
  p_medication_id uuid, p_skip_future boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_med public.medications;
  v_already boolean;
  v_skipped bigint := 0;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select * into v_med from public.medications
   where id = p_medication_id and user_id = v_uid
     for update;
  if v_med.id is null then
    raise exception 'Medicamento no encontrado.' using errcode = '42501';
  end if;

  v_already := not v_med.is_active;

  update public.medications set is_active = false where id = p_medication_id;

  update public.medication_schedules
     set is_active = false
   where medication_id = p_medication_id and is_active;

  if p_skip_future then
    perform set_config('app.occurrence_reason', 'medication_archived', true);
    update public.dose_occurrences
       set status = 'skipped'
     where user_id = v_uid and medication_id = p_medication_id
       and status = 'pending' and scheduled_at >= now();
    get diagnostics v_skipped = row_count;
    perform set_config('app.occurrence_reason', '', true);
  end if;

  return jsonb_build_object('medication_id', p_medication_id, 'archived', true,
                            'already_archived', v_already, 'skipped_future', v_skipped);
end $$;

create or replace function public.restore_medication(p_medication_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_sched integer := 0;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  update public.medications
     set is_active = true
   where id = p_medication_id and user_id = v_uid;

  if not found then
    raise exception 'Medicamento no encontrado.' using errcode = '42501';
  end if;

  select count(*) into v_sched
    from public.medication_schedules
   where medication_id = p_medication_id;

  return jsonb_build_object('medication_id', p_medication_id, 'restored', true,
                            'archived_schedules', v_sched,
                            'requires_new_schedule', v_sched > 0);
end $$;

create or replace function public.set_schedule_end_date(
  p_schedule_id uuid, p_end_date date, p_skip_after_end boolean default true)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_sched public.medication_schedules;
  v_skipped bigint := 0;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select s.* into v_sched
    from public.medication_schedules s
    join public.medications m on m.id = s.medication_id
   where s.id = p_schedule_id and m.user_id = v_uid
     for update of s;

  if v_sched.id is null then
    raise exception 'Horario no encontrado.' using errcode = '42501';
  end if;
  if not v_sched.is_active then
    raise exception 'El horario está archivado; su fecha de fin no es editable.'
      using errcode = '23514';
  end if;
  if p_end_date is not null and p_end_date < v_sched.start_date then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio.'
      using errcode = '22023';
  end if;

  update public.medication_schedules set end_date = p_end_date where id = p_schedule_id;

  -- Solo pendientes FUTURAS y posteriores al cierre. Nunca atrasadas ni resueltas.
  if p_end_date is not null and p_skip_after_end then
    perform set_config('app.occurrence_reason', 'schedule_changed', true);
    update public.dose_occurrences
       set status = 'skipped'
     where user_id = v_uid
       and schedule_id = p_schedule_id
       and status = 'pending'
       and local_date > p_end_date
       and scheduled_at >= now();
    get diagnostics v_skipped = row_count;
    perform set_config('app.occurrence_reason', '', true);
  end if;

  perform public.sync_dose_occurrences();

  return jsonb_build_object('schedule_id', p_schedule_id,
                            'end_date', p_end_date,
                            'skipped_after_end', v_skipped);
end $$;

create or replace function public.delete_schedule(p_schedule_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_count bigint;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select m.user_id into v_owner
    from public.medication_schedules s
    join public.medications m on m.id = s.medication_id
   where s.id = p_schedule_id
     for update of s;

  if v_owner is null or v_owner <> v_uid then
    raise exception 'Horario no encontrado.' using errcode = '42501';
  end if;

  select count(*) into v_count
    from public.dose_occurrences where schedule_id = p_schedule_id;

  if v_count > 0 then
    raise exception 'El horario tiene % tomas registradas: archívalo en lugar de eliminarlo.',
      v_count using errcode = '23503';
  end if;

  delete from public.medication_schedules where id = p_schedule_id;
  return jsonb_build_object('schedule_id', p_schedule_id, 'deleted', true);
end $$;

create or replace function public.delete_medication(p_medication_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_med public.medications;
  v_count bigint;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select * into v_med from public.medications
   where id = p_medication_id and user_id = v_uid
     for update;
  if v_med.id is null then
    raise exception 'Medicamento no encontrado.' using errcode = '42501';
  end if;

  if v_med.photo_path is not null then
    raise exception 'Elimina primero la foto del medicamento (clear_medication_photo).'
      using errcode = '23514';
  end if;

  select count(*) into v_count
    from public.dose_occurrences where medication_id = p_medication_id;
  if v_count > 0 then
    raise exception 'El medicamento tiene % tomas registradas: archívalo en lugar de eliminarlo.',
      v_count using errcode = '23503';
  end if;

  delete from public.medications where id = p_medication_id;
  return jsonb_build_object('medication_id', p_medication_id, 'deleted', true);
end $$;

create or replace function public.set_medication_photo(
  p_medication_id uuid, p_filename text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_med public.medications;
  v_path text;
  v_others integer;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  if p_filename is null
     or p_filename not in ('photo.jpg','photo.png','photo.webp') then
    raise exception 'Nombre de archivo no permitido: %', coalesce(p_filename,'(nulo)')
      using errcode = '22023';
  end if;

  select * into v_med from public.medications
   where id = p_medication_id and user_id = v_uid
     for update;
  if v_med.id is null then
    raise exception 'Medicamento no encontrado.' using errcode = '42501';
  end if;

  v_path := v_uid::text || '/' || p_medication_id::text || '/' || p_filename;

  -- No se cambia de archivo sin limpiar el anterior.
  if v_med.photo_path is not null and v_med.photo_path <> v_path then
    raise exception 'Ya hay una foto registrada (%). Ejecuta clear_medication_photo() y elimina el archivo antes de subir otra.',
      v_med.photo_path using errcode = '23514';
  end if;

  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'medication-photos' and o.name = v_path) then
    raise exception 'El archivo % no existe en Storage.', v_path using errcode = '23514';
  end if;

  select count(*) into v_others
    from storage.objects o
   where o.bucket_id = 'medication-photos'
     and o.name like v_uid::text || '/' || p_medication_id::text || '/%'
     and o.name <> v_path;

  if v_others > 0 then
    raise exception 'Hay % archivo(s) adicional(es) en la carpeta del medicamento: elimínalos antes de fijar la foto.',
      v_others using errcode = '23514';
  end if;

  update public.medications set photo_path = v_path where id = p_medication_id;

  return jsonb_build_object('photo_path', v_path,
                            'previous_photo_path', v_med.photo_path);
end $$;

create or replace function public.clear_medication_photo(p_medication_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_med public.medications;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select * into v_med from public.medications
   where id = p_medication_id and user_id = v_uid
     for update;
  if v_med.id is null then
    raise exception 'Medicamento no encontrado.' using errcode = '42501';
  end if;

  if v_med.photo_path is null then
    return jsonb_build_object('photo_path', null, 'cleared', false, 'already_clear', true);
  end if;

  update public.medications set photo_path = null where id = p_medication_id;

  return jsonb_build_object('photo_path', v_med.photo_path, 'cleared', true, 'already_clear', false);
end $$;

create or replace function public.resync_pending_timezone(p_timezone text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_actual text;
  v_count bigint := 0;
  v_adjusted bigint := 0;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  if p_timezone is null
     or not exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = p_timezone) then
    raise exception 'Zona horaria no válida: %', coalesce(p_timezone,'(nula)')
      using errcode = '22023';
  end if;

  select p.timezone into v_actual from public.profiles p where p.id = v_uid;

  select count(*) into v_adjusted
    from public.dose_occurrences d
   where d.user_id = v_uid
     and d.status = 'pending'
     and d.scheduled_at > now()
     and ((((d.local_date + d.local_time) at time zone p_timezone) at time zone p_timezone)
          is distinct from (d.local_date + d.local_time));

  if v_actual is distinct from p_timezone then
    update public.profiles set timezone = p_timezone where id = v_uid;
  end if;

  perform set_config('app.occurrence_reschedule', 'on', true);

  update public.dose_occurrences d
     set scheduled_at = ((d.local_date + d.local_time) at time zone p_timezone)
   where d.user_id = v_uid
     and d.status = 'pending'
     and d.scheduled_at > now()
     and ((d.local_date + d.local_time) at time zone p_timezone) is distinct from d.scheduled_at;

  get diagnostics v_count = row_count;
  perform set_config('app.occurrence_reschedule', '', true);

  return jsonb_build_object('timezone', p_timezone,
                            'changed', v_actual is distinct from p_timezone,
                            'rescheduled', v_count,
                            'dst_adjusted', v_adjusted);
end $$;
