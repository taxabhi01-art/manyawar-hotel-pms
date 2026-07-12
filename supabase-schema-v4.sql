-- MANYAWAR HOTEL PMS — Migration 4
-- Adds: occupancy-based room pricing, co-guest tracking, and ID-proof photo storage
-- Paste this into Supabase → SQL Editor → New Query → Run

-- ---------- Occupancy-based room pricing ----------
alter table rooms add column if not exists rate_single numeric;
alter table rooms add column if not exists rate_double numeric;
alter table rooms add column if not exists rate_extra_person numeric default 0;

-- Backfill: use the existing single "rate" as a starting point for both tiers
update rooms
set rate_single = coalesce(rate_single, rate),
    rate_double = coalesce(rate_double, rate)
where rate_single is null or rate_double is null;

-- ---------- Co-guests (people staying with the primary guest) ----------
alter table bookings add column if not exists co_guests_count integer default 0;

create table if not exists co_guests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  name text,
  id_proof_image_path text,
  created_at timestamptz default now()
);
alter table co_guests enable row level security;
drop policy if exists "staff full access" on co_guests;
create policy "staff full access" on co_guests for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------- ID proof photo on the primary guest record ----------
alter table guests add column if not exists id_proof_image_path text;

-- ---------- Storage bucket for scanned ID photos ----------
-- Private bucket: only signed-in staff (any account created in Authentication → Users)
-- can upload or view files here. Nobody outside the app can access these photos.
insert into storage.buckets (id, name, public)
values ('id-proofs', 'id-proofs', false)
on conflict (id) do nothing;

drop policy if exists "staff can upload id proofs" on storage.objects;
create policy "staff can upload id proofs" on storage.objects
  for insert to authenticated with check (bucket_id = 'id-proofs');

drop policy if exists "staff can view id proofs" on storage.objects;
create policy "staff can view id proofs" on storage.objects
  for select to authenticated using (bucket_id = 'id-proofs');

drop policy if exists "staff can update id proofs" on storage.objects;
create policy "staff can update id proofs" on storage.objects
  for update to authenticated using (bucket_id = 'id-proofs');

drop policy if exists "staff can delete id proofs" on storage.objects;
create policy "staff can delete id proofs" on storage.objects
  for delete to authenticated using (bucket_id = 'id-proofs');
