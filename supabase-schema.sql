-- MANYAWAR HOTEL PMS — Supabase schema
-- Paste this whole file into Supabase → SQL Editor → New Query → Run

create extension if not exists "pgcrypto";

-- ROOMS
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  floor int default 1,
  type text default 'Standard',
  rate numeric default 0,
  status text default 'available'
);

-- GUESTS
create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  id_proof text,
  vip boolean default false
);

-- BOOKINGS
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid references guests(id) on delete set null,
  room_id uuid references rooms(id) on delete set null,
  check_in date not null,
  check_out date not null,
  status text default 'reserved', -- reserved | checked-in | checked-out
  rate numeric default 0,
  nights int default 1,
  subtotal numeric default 0,
  discount numeric default 0,
  discount_reason text,
  total numeric default 0,
  paid_amount numeric default 0,
  source text default 'Walk-in',
  deposit numeric default 0,
  deposit_refunded boolean default false,
  created_at timestamptz default now()
);

-- PAYMENTS
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  amount numeric not null,
  mode text default 'Cash',
  paid_on date default current_date
);

-- STAFF
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text default 'Front Desk',
  shift text default 'Morning',
  phone text
);

-- TASKS (housekeeping)
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id) on delete cascade,
  room_id uuid references rooms(id) on delete set null,
  task text not null,
  done boolean default false
);

-- ATTENDANCE
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id) on delete cascade,
  date date not null,
  status text not null,
  unique (staff_id, date)
);

-- ---------- SECURITY ----------
-- Row Level Security: any signed-in staff member (created by you in
-- Authentication → Users) can read and write everything. There is no
-- public access — signed-out visitors see nothing.

alter table rooms enable row level security;
alter table guests enable row level security;
alter table bookings enable row level security;
alter table payments enable row level security;
alter table staff enable row level security;
alter table tasks enable row level security;
alter table attendance enable row level security;

create policy "staff full access" on rooms for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on guests for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on bookings for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on payments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on staff for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on tasks for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access" on attendance for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
