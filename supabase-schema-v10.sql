-- MANYAWAR HOTEL PMS — Migration 10
-- Adds: activity log (owner notifications), maintenance ticket system,
-- and full detail snapshot storage on night audits
-- Paste this into Supabase → SQL Editor → New Query → Run

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  details text,
  performed_by text,
  created_at timestamptz default now()
);
alter table activity_log enable row level security;
drop policy if exists "staff full access" on activity_log;
create policy "staff full access" on activity_log for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create table if not exists maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete set null,
  issue text not null,
  priority text default 'Medium', -- Low | Medium | High | Urgent
  status text default 'Open',     -- Open | In Progress | Resolved
  reported_by text,
  assigned_staff_id uuid references staff(id) on delete set null,
  created_at timestamptz default now(),
  resolved_at timestamptz
);
alter table maintenance_tickets enable row level security;
drop policy if exists "staff full access" on maintenance_tickets;
create policy "staff full access" on maintenance_tickets for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Stores a full itemized snapshot (arrivals, departures, no-shows, early/late
-- lists, revenue-by-mode, expenses-by-category) at the moment the audit was run,
-- so history entries can show complete detail later, not just summary numbers.
alter table night_audits add column if not exists details jsonb;
