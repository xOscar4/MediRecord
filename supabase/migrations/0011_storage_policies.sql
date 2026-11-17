-- 0011 · Políticas de Storage para medication-photos
--
-- Ruta canónica: {user_id}/{medication_id}/photo.{jpg|png|webp}
-- storage.foldername('uid/mid/photo.jpg') = {uid, mid}
--
-- Flujo de alta:        upload()  -> set_medication_photo(id, 'photo.jpg')
-- Flujo de reemplazo:   clear_medication_photo(id) -> remove(path)
--                       -> upload(nuevo) -> set_medication_photo(id, 'photo.jpg')
-- Flujo de baja:        clear_medication_photo(id) -> remove(path)
--
-- No se crea política de UPDATE a propósito: no hay sobrescrituras.
-- Reemplazar una foto exige limpiar la referencia y borrar el archivo antes.
-- Así nunca queda una referencia apuntando a un objeto inexistente ni un
-- objeto reemplazado sin dueño.

drop policy if exists medication_photos_insert on storage.objects;
create policy medication_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'medication-photos'
    -- exactamente dos carpetas: uid/medication_id/
    and array_length(storage.foldername(name), 1) = 2
    -- la primera carpeta es el propio uid
    and (storage.foldername(name))[1] = (select auth.uid())::text
    -- nombre de archivo de la lista blanca (coincide con el CHECK de 0004)
    and storage.filename(name) in ('photo.jpg', 'photo.png', 'photo.webp')
    -- la segunda carpeta es un medicamento del usuario, y su referencia
    -- está libre o ya apunta exactamente a este objeto
    and exists (
      select 1
        from public.medications m
       where m.id::text = (storage.foldername(storage.objects.name))[2]
         and m.user_id = (select auth.uid())
         and (m.photo_path is null or m.photo_path = storage.objects.name)
    )
  );

drop policy if exists medication_photos_select on storage.objects;
create policy medication_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'medication-photos'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      -- medicamento vivo del usuario
      exists (
        select 1
          from public.medications m
         where m.id::text = (storage.foldername(storage.objects.name))[2]
           and m.user_id = (select auth.uid())
      )
      -- o carpeta huérfana del propio usuario (medicamento ya eliminado)
      or not exists (
        select 1
          from public.medications m
         where m.id::text = (storage.foldername(storage.objects.name))[2]
      )
    )
  );

drop policy if exists medication_photos_delete on storage.objects;
create policy medication_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'medication-photos'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    -- nunca se borra el archivo mientras siga siendo la foto referenciada:
    -- primero clear_medication_photo(), luego remove(). Sin referencias colgantes.
    and not exists (
      select 1
        from public.medications m
       where m.id::text = (storage.foldername(storage.objects.name))[2]
         and m.user_id = (select auth.uid())
         and m.photo_path = storage.objects.name
    )
  );

-- Aserción: exactamente tres políticas para este bucket.
do $$
declare v_count integer;
begin
  select count(*) into v_count
    from pg_catalog.pg_policies
   where schemaname = 'storage'
     and tablename  = 'objects'
     and policyname like 'medication_photos_%';

  if v_count <> 3 then
    raise exception 'Se esperaban 3 políticas de Storage (encontradas %).', v_count;
  end if;
end $$;
