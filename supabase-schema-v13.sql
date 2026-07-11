-- MANYAWAR HOTEL PMS — Migration 13
-- Adds: payment mode on expenses (Cash/UPI/Bank/etc), and lets staff ADD
-- expenses even though only the owner can view/edit the full expense ledger
-- Paste this into Supabase → SQL Editor → New Query → Run

alter table expenses add column if not exists mode text default 'Cash';

-- Staff can INSERT expense entries, but only the owner can view/edit/delete
-- them (keeps the full financial picture private while letting staff log
-- day-to-day cash outflows like buying supplies or paying a repair person).
drop policy if exists "owner only" on expenses;
create policy "owner full access" on expenses for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists "staff can add expenses" on expenses;
create policy "staff can add expenses" on expenses for insert with check (auth.role() = 'authenticated');
