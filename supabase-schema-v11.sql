-- MANYAWAR HOTEL PMS — Migration 11
-- Adds: a note field on inventory usage (used for self-use/internal entries
-- that aren't tied to any guest booking)
-- Paste this into Supabase → SQL Editor → New Query → Run

alter table inventory_usage add column if not exists note text;
