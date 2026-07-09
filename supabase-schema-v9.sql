-- MANYAWAR HOTEL PMS — Migration 9
-- Adds: early check-in / late checkout counts on the night_audits log
-- Paste this into Supabase → SQL Editor → New Query → Run

alter table night_audits add column if not exists early_checkins int default 0;
alter table night_audits add column if not exists late_checkouts int default 0;
