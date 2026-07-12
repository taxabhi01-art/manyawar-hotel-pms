-- MANYAWAR HOTEL PMS — Migration 7
-- Adds: salary expense tracking (staff + period), and a night audit log table
-- Paste this into Supabase → SQL Editor → New Query → Run
-- (Note: booking "status" is a free-text column with no fixed list, so new
-- statuses like 'cancelled' and 'no-show' work automatically — no migration needed for that.)

alter table expenses add column if not exists staff_id uuid references staff(id) on delete set null;
alter table expenses add column if not exists salary_period text;
alter table bookings add column if not exists cancel_reason text;

create table if not exists night_audits (
  id uuid primary key default gen_random_uuid(),
  audit_date date unique not null,
  occupancy_percent numeric,
  rooms_occupied int,
  revenue numeric,
  expenses numeric,
  no_shows int,
  notes text,
  run_by text,
  run_at timestamptz default now()
);
alter table night_audits enable row level security;
drop policy if exists "staff full access" on night_audits;
create policy "staff full access" on night_audits for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
