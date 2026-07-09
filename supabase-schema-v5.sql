-- MANYAWAR HOTEL PMS — Migration 5
-- Adds: expenses (owner-only at database level), deposit adjust-vs-refund tracking,
-- and separate front/back ID proof photos
-- Paste this into Supabase → SQL Editor → New Query → Run

-- ---------- Helper: is the current logged-in user an "owner"? ----------
-- Used to restrict financial data at the DATABASE level, not just hidden in the UI.
create or replace function public.is_owner()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'owner'
  );
$$ language sql security definer stable;

-- ---------- EXPENSES (owner only, even at the database level) ----------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  amount numeric not null,
  description text,
  expense_date date not null default current_date,
  created_at timestamptz default now()
);
alter table expenses enable row level security;
drop policy if exists "owner only" on expenses;
create policy "owner only" on expenses for all using (public.is_owner()) with check (public.is_owner());

-- ---------- Deposit: adjusted-against-bill vs refunded-to-guest ----------
alter table bookings add column if not exists deposit_status text default 'held'; -- held | adjusted | refunded
update bookings
set deposit_status = case when deposit_refunded then 'refunded' else 'held' end
where deposit > 0 and (deposit_status is null or deposit_status = 'held');

-- ---------- ID proof: separate front and back photos ----------
alter table guests add column if not exists id_proof_front_path text;
alter table guests add column if not exists id_proof_back_path text;
update guests set id_proof_front_path = id_proof_image_path
where id_proof_image_path is not null and id_proof_front_path is null;

alter table co_guests add column if not exists id_proof_front_path text;
alter table co_guests add column if not exists id_proof_back_path text;
update co_guests set id_proof_front_path = id_proof_image_path
where id_proof_image_path is not null and id_proof_front_path is null;
