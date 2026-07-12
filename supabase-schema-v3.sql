-- MANYAWAR HOTEL PMS — Migration 3
-- Adds: email column on staff (so the app can match a logged-in account to a staff member for task notifications)
-- Paste this into Supabase → SQL Editor → New Query → Run

alter table staff add column if not exists email text;
