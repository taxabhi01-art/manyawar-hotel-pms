-- MANYAWAR HOTEL PMS — Migration 15
-- Adds: maintenance tickets for common areas (not just rooms), and
-- receipt-upload support for expenses.
-- Paste this into Supabase → SQL Editor → New Query → Run

-- Maintenance: allow a ticket to be for a common area instead of a room
alter table maintenance_tickets alter column room_id drop not null;
alter table maintenance_tickets add column if not exists area_name text;

-- Expenses: track an uploaded receipt/document path
alter table expenses add column if not exists receipt_path text;

-- Storage bucket for expense receipts — if this errors ("already exists" or
-- permission issue), skip it and instead create it manually:
-- Supabase Dashboard → Storage → New bucket → name "expense-receipts" → Private
insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do nothing;

drop policy if exists "authenticated upload receipts" on storage.objects;
create policy "authenticated upload receipts" on storage.objects
  for insert to authenticated with check (bucket_id = 'expense-receipts');

drop policy if exists "authenticated view receipts" on storage.objects;
create policy "authenticated view receipts" on storage.objects
  for select to authenticated using (bucket_id = 'expense-receipts');

drop policy if exists "authenticated delete receipts" on storage.objects;
create policy "authenticated delete receipts" on storage.objects
  for delete to authenticated using (bucket_id = 'expense-receipts');
