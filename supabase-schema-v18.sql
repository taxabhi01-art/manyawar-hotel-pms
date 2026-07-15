-- MANYAWAR HOTEL PMS — Migration 18
-- Adds: services catalog (extra-charge items like room service, laundry,
-- late checkout add-ons) and per-booking service charges, mirroring how
-- inventory_items/inventory_usage/items_total work (migration 8) but for
-- billable services instead of physical stock.
--
-- NOTE: this migration was already applied directly via Supabase → SQL
-- Editor before this file was written — it's recorded here only for
-- consistency with the rest of this migration history. Every statement is
-- idempotent (create table if not exists / add column if not exists), so
-- re-running it is a safe no-op.

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null default 0,
  description text,
  is_active boolean not null default true,
  created_at timestamptz default now()
);
alter table services enable row level security;
drop policy if exists "staff full access" on services;
create policy "staff full access" on services for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create table if not exists booking_services (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  service_name text,       -- snapshot of the service name at the time (survives service edits/deletion)
  price numeric not null,  -- snapshot of the unit price at the time
  quantity numeric not null
);
alter table booking_services enable row level security;
drop policy if exists "staff full access" on booking_services;
create policy "staff full access" on booking_services for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter table bookings add column if not exists services_total numeric default 0;
