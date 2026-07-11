-- MANYAWAR HOTEL PMS — Migration 14
-- Adds: push notification subscriptions (for real push, even when the app
-- tab isn't open)
-- Paste this into Supabase → SQL Editor → New Query → Run

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists "staff full access" on push_subscriptions;
create policy "staff full access" on push_subscriptions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
