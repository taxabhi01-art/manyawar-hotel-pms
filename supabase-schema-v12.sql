-- MANYAWAR HOTEL PMS — Migration 12
-- Adds: payment mode tracking on the deposit/advance field
-- Paste this into Supabase → SQL Editor → New Query → Run

alter table bookings add column if not exists deposit_mode text default 'Cash';
