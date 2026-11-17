-- 0008 · Row Level Security
alter table public.profiles             enable row level security;
alter table public.medications          enable row level security;
alter table public.medication_schedules enable row level security;
alter table public.dose_occurrences     enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists medications_select_own on public.medications;
create policy medications_select_own on public.medications
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists medications_insert_own on public.medications;
create policy medications_insert_own on public.medications
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists medications_update_own on public.medications;
create policy medications_update_own on public.medications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Sin política de DELETE: el borrado de medicamentos solo ocurre en delete_medication().

drop policy if exists schedules_select_own on public.medication_schedules;
create policy schedules_select_own on public.medication_schedules
  for select to authenticated
  using (exists (select 1 from public.medications m
                  where m.id = medication_schedules.medication_id
                    and m.user_id = (select auth.uid())));

drop policy if exists schedules_insert_own on public.medication_schedules;
create policy schedules_insert_own on public.medication_schedules
  for insert to authenticated
  with check (exists (select 1 from public.medications m
                       where m.id = medication_schedules.medication_id
                         and m.user_id = (select auth.uid())
                         and m.is_active));

drop policy if exists schedules_update_own on public.medication_schedules;
create policy schedules_update_own on public.medication_schedules
  for update to authenticated
  using (exists (select 1 from public.medications m
                  where m.id = medication_schedules.medication_id
                    and m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.medications m
                       where m.id = medication_schedules.medication_id
                         and m.user_id = (select auth.uid())
                         and m.is_active));

drop policy if exists schedules_delete_own_without_history on public.medication_schedules;
create policy schedules_delete_own_without_history on public.medication_schedules
  for delete to authenticated
  using (exists (select 1 from public.medications m
                  where m.id = medication_schedules.medication_id
                    and m.user_id = (select auth.uid()))
         and not exists (select 1 from public.dose_occurrences d
                          where d.schedule_id = medication_schedules.id));

drop policy if exists occurrences_select_own on public.dose_occurrences;
create policy occurrences_select_own on public.dose_occurrences
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists occurrences_update_own_pending on public.dose_occurrences;
create policy occurrences_update_own_pending on public.dose_occurrences
  for update to authenticated
  using (user_id = (select auth.uid()) and status = 'pending')
  with check (user_id = (select auth.uid())
              and status in ('pending','taken','skipped'));
