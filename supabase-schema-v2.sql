-- MANYAWAR HOTEL PMS — Migration 2
-- Adds: owner-vs-staff roles, and hotel/GST settings
-- Paste this into Supabase → SQL Editor → New Query → Run
-- (Safe to run even though tables already exist — this only ADDS new things.)

-- ---------- PROFILES (who is "owner" vs "staff") ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'staff' -- 'owner' or 'staff'
);

alter table profiles enable row level security;

drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles for select using (auth.uid() = id);

-- Auto-create a profile row (as 'staff') whenever a new login is created
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'staff')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill profiles for accounts that already existed before this migration
insert into public.profiles (id, email, role)
select id, email, 'staff' from auth.users
on conflict (id) do nothing;

-- ---------- SETTINGS (hotel info + GST, one row) ----------
create table if not exists settings (
  id int primary key default 1,
  hotel_name text default 'MANYAWAR HOTEL',
  address text,
  phone text,
  gst_number text,
  gst_percent numeric default 0,
  check (id = 1)
);
insert into settings (id) values (1) on conflict (id) do nothing;

alter table settings enable row level security;
drop policy if exists "staff can read settings" on settings;
create policy "staff can read settings" on settings for select using (auth.role() = 'authenticated');
drop policy if exists "staff can update settings" on settings;
create policy "staff can update settings" on settings for update using (auth.role() = 'authenticated');

-- ---------- AFTER RUNNING THIS ----------
-- 1. Go to Table Editor → profiles
-- 2. Find the row with YOUR email
-- 3. Click the "role" cell and change it from "staff" to "owner"
-- 4. That's it — only your login will now see Reports & Settings.
