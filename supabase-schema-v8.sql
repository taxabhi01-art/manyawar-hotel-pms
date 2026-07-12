-- MANYAWAR HOTEL PMS — Migration 8
-- Adds: inventory catalog (minibar/room-service items), usage tracking linked
-- to bookings (auto-deducts stock, auto-adds to bill), and bookings.items_total
-- Paste this into Supabase → SQL Editor → New Query → Run

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null default 0,
  stock_qty numeric not null default 0,
  unit text default 'pcs',
  created_at timestamptz default now()
);
alter table inventory_items enable row level security;
drop policy if exists "staff full access" on inventory_items;
create policy "staff full access" on inventory_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create table if not exists inventory_usage (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  item_id uuid references inventory_items(id) on delete set null,
  item_name text,          -- snapshot of the item name at the time (survives item edits/deletion)
  quantity numeric not null,
  unit_price numeric not null,
  amount numeric not null,
  used_at timestamptz default now()
);
alter table inventory_usage enable row level security;
drop policy if exists "staff full access" on inventory_usage;
create policy "staff full access" on inventory_usage for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter table bookings add column if not exists items_total numeric default 0;
