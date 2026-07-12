-- MANYAWAR HOTEL PMS — Migration 6
-- Adds: actual check-in/check-out timestamps, early check-in & late checkout
-- fee tracking, and a manual booking reference number
-- Paste this into Supabase → SQL Editor → New Query → Run

alter table bookings add column if not exists checked_in_at timestamptz;
alter table bookings add column if not exists checked_out_at timestamptz;
alter table bookings add column if not exists early_checkin boolean default false;
alter table bookings add column if not exists early_checkin_fee numeric default 0;
alter table bookings add column if not exists late_checkout boolean default false;
alter table bookings add column if not exists late_checkout_fee numeric default 0;
alter table bookings add column if not exists booking_ref text;
