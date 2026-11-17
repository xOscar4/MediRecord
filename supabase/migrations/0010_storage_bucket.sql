-- 0010 · Bucket privado de fotos de medicamentos
--
-- Un único bucket, privado, con límites duros. La ruta canónica es
--   {user_id}/{medication_id}/photo.{jpg|png|webp}
-- y coincide exactamente con CHECK medications_photo_path_format (0004).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'medication-photos',
  'medication-photos',
  false,
  5242880,                                              -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Aserción: el bucket existe y es privado.
do $$
declare v_public boolean; v_limit bigint;
begin
  select b.public, b.file_size_limit into v_public, v_limit
    from storage.buckets b where b.id = 'medication-photos';

  if not found then
    raise exception 'No se pudo crear el bucket medication-photos.';
  end if;
  if v_public then
    raise exception 'El bucket medication-photos debe ser privado.';
  end if;
  if v_limit is null or v_limit > 5242880 then
    raise exception 'El límite del bucket debe ser <= 5 MB (actual: %).', v_limit;
  end if;
end $$;
