-- 0009 · Permisos: negación por defecto y concesiones mínimas
--
-- Estrategia: primero un barrido de REVOKE sobre TODO lo existente en "public"
-- (tablas, secuencias y funciones, incluidas las heredadas de PUBLIC), y después
-- las concesiones explícitas. Así no sobrevive ningún permiso heredado ni
-- sobrecargas antiguas con privilegios residuales.
--
-- anon no recibe nada. authenticated solo lo estrictamente necesario.

revoke all on all tables    in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- Objetos futuros creados por el rol de migración: mismo criterio.
-- Sin concesión automática a authenticated: cada objeto nuevo se autoriza a mano.
alter default privileges in schema public
  revoke all on tables    from public, anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon;

grant usage on schema public to authenticated;

-- ---------------------------------------------------------------------------
-- profiles: leer el propio y editar SOLO full_name.
-- timezone no es actualizable directamente: pasa por resync_pending_timezone().
-- ---------------------------------------------------------------------------
grant select             on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- medications: sin DELETE. El borrado físico solo ocurre en delete_medication().
-- photo_path e is_active los gestionan las RPC (SECURITY DEFINER).
-- ---------------------------------------------------------------------------
grant select on public.medications to authenticated;
grant insert (user_id, name, dose_amount, dose_form, instructions)
  on public.medications to authenticated;
grant update (name, dose_amount, dose_form, instructions)
  on public.medications to authenticated;

-- ---------------------------------------------------------------------------
-- medication_schedules: end_date y cursor solo por RPC; notes es editable.
-- DELETE permitido solo si no hay historia (lo impone la política RLS de 0008).
-- ---------------------------------------------------------------------------
grant select on public.medication_schedules to authenticated;
grant insert (medication_id, time_of_day, days_of_week, start_date, end_date, notes)
  on public.medication_schedules to authenticated;
grant update (notes) on public.medication_schedules to authenticated;
grant delete on public.medication_schedules to authenticated;

-- ---------------------------------------------------------------------------
-- dose_occurrences: historial de solo lectura + resolver pendientes.
-- Sin INSERT (solo sync_dose_occurrences) y sin DELETE.
-- resolved_at y resolution_reason no se exponen al cliente.
-- ---------------------------------------------------------------------------
grant select (id, user_id, medication_id, schedule_id, scheduled_at,
              local_date, local_time, timezone, status, notes,
              medication_name_snapshot, dose_snapshot, created_at, updated_at)
  on public.dose_occurrences to authenticated;
grant update (status, notes) on public.dose_occurrences to authenticated;

-- ---------------------------------------------------------------------------
-- Funciones
-- ---------------------------------------------------------------------------

-- Alta de perfil: la ejecuta el trigger de auth.users, nunca el cliente.
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- Triggers: jamás ejecutables como RPC.
revoke all on function public.set_updated_at()            from public, anon, authenticated;
revoke all on function public.set_archived_at()           from public, anon, authenticated;
revoke all on function public.validate_profile_timezone() from public, anon, authenticated;
revoke all on function public.validate_schedule()         from public, anon, authenticated;
revoke all on function public.dose_occurrences_guard()    from public, anon, authenticated;

-- La usan triggers que corren con el search_path del invocador.
grant execute on function public.current_local_date() to authenticated;

-- API de negocio (firmas exactas, sin sobrecargas).
grant execute on function public.sync_dose_occurrences(integer, integer)                    to authenticated;
grant execute on function public.archive_schedule(uuid, boolean)                            to authenticated;
grant execute on function public.replace_schedule(uuid, time, integer[], date, text, boolean) to authenticated;
grant execute on function public.archive_medication(uuid, boolean)                          to authenticated;
grant execute on function public.restore_medication(uuid)                                   to authenticated;
grant execute on function public.set_schedule_end_date(uuid, date, boolean)                 to authenticated;
grant execute on function public.delete_schedule(uuid)                                      to authenticated;
grant execute on function public.delete_medication(uuid)                                    to authenticated;
grant execute on function public.set_medication_photo(uuid, text)                           to authenticated;
grant execute on function public.clear_medication_photo(uuid)                               to authenticated;
grant execute on function public.resync_pending_timezone(text)                              to authenticated;

-- ---------------------------------------------------------------------------
-- Aserciones de cierre: la migración aborta si el estado no es el esperado.
-- ---------------------------------------------------------------------------
do $$
begin
  -- 1) La sobrecarga antigua no debe existir con ningún permiso.
  if to_regprocedure('public.set_schedule_end_date(uuid, date)') is not null then
    raise exception 'Sobrecarga antigua public.set_schedule_end_date(uuid, date) aún presente.';
  end if;

  -- 2) La única firma viva debe existir.
  if to_regprocedure('public.set_schedule_end_date(uuid, date, boolean)') is null then
    raise exception 'Falta public.set_schedule_end_date(uuid, date, boolean).';
  end if;

  -- 3) anon no puede ejecutar nada (has_*_privilege evalúa también lo heredado
  --    desde PUBLIC, así que "false" prueba que PUBLIC tampoco lo tiene).
  if has_function_privilege('anon', 'public.set_schedule_end_date(uuid, date, boolean)', 'execute') then
    raise exception 'anon no debe ejecutar set_schedule_end_date.';
  end if;
  if has_function_privilege('anon', 'public.sync_dose_occurrences(integer, integer)', 'execute') then
    raise exception 'anon no debe ejecutar sync_dose_occurrences.';
  end if;
  if has_function_privilege('anon', 'public.dose_occurrences_guard()', 'execute') then
    raise exception 'anon no debe ejecutar dose_occurrences_guard.';
  end if;

  -- 4) anon sin acceso a tablas.
  if has_table_privilege('anon', 'public.profiles', 'select') then
    raise exception 'anon no debe leer profiles.';
  end if;
  if has_table_privilege('anon', 'public.medications', 'select') then
    raise exception 'anon no debe leer medications.';
  end if;
  if has_table_privilege('anon', 'public.dose_occurrences', 'select') then
    raise exception 'anon no debe leer dose_occurrences.';
  end if;

  -- 5) authenticated: borrado de medicamentos solo por RPC, nunca directo.
  if has_table_privilege('authenticated', 'public.medications', 'delete') then
    raise exception 'El borrado de medicamentos debe pasar por delete_medication().';
  end if;
  -- 6) El historial no se inserta ni se borra desde el cliente.
  if has_table_privilege('authenticated', 'public.dose_occurrences', 'insert') then
    raise exception 'Las tomas solo se generan con sync_dose_occurrences().';
  end if;
  if has_table_privilege('authenticated', 'public.dose_occurrences', 'delete') then
    raise exception 'Las tomas no se eliminan.';
  end if;
  -- 7) timezone y resolución interna no son columnas de escritura/lectura del cliente.
  if has_column_privilege('authenticated', 'public.profiles', 'timezone', 'update') then
    raise exception 'timezone solo cambia con resync_pending_timezone().';
  end if;
  if has_column_privilege('authenticated', 'public.dose_occurrences', 'resolution_reason', 'select') then
    raise exception 'resolution_reason no debe exponerse al cliente.';
  end if;
  if has_column_privilege('authenticated', 'public.dose_occurrences', 'resolved_at', 'select') then
    raise exception 'resolved_at no debe exponerse al cliente.';
  end if;

  -- 8) Lo que sí debe existir.
  if not has_table_privilege('authenticated', 'public.medications', 'select') then
    raise exception 'authenticated debe leer medications.';
  end if;
  if not has_function_privilege('authenticated', 'public.replace_schedule(uuid, time, integer[], date, text, boolean)', 'execute') then
    raise exception 'authenticated debe ejecutar replace_schedule().';
  end if;
end $$;
