-- 0004 · Medicamentos y una única foto por medicamento
create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  dose_amount text,
  dose_form text,
  instructions text,
  photo_path text,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medications_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint medications_name_clean  check (name = btrim(name)),
  constraint medications_dose_form
    check (dose_form is null or dose_form in
           ('tablet','capsule','liquid','drops','injection','inhaler','other')),
  constraint medications_instructions_length
    check (instructions is null or char_length(instructions) <= 1000),
  constraint medications_flag_consistency check (is_active = (archived_at is null)),
  constraint medications_photo_path_format check (
    photo_path is null
    or photo_path ~ ('^' || user_id::text || '/' || id::text || '/photo\.(jpg|png|webp)$')
  )
);

comment on column public.medications.photo_path is
  'Ruta única en el bucket privado: {user_id}/{medication_id}/photo.{jpg|png|webp}';

create index if not exists medications_user_idx        on public.medications (user_id);
create index if not exists medications_user_active_idx on public.medications (user_id) where is_active;

drop trigger if exists medications_set_archived_at on public.medications;
create trigger medications_set_archived_at
  before insert or update on public.medications
  for each row execute function public.set_archived_at();

drop trigger if exists medications_set_updated_at on public.medications;
create trigger medications_set_updated_at
  before update on public.medications
  for each row execute function public.set_updated_at();
