-- MANYAWAR HOTEL PMS — Migration 19
-- Adds owner_reviewed + reviewed_at to payments, purely for the new
-- Payment Review tab — a personal sign-off checklist for the owner. This
-- is additive metadata only: no other part of the app reads these two
-- columns. Every existing calculation (Finance, Accounts P&L/Cash Flow,
-- Billing, Reports, Dashboard, sumPayments()) continues to sum/filter
-- payments purely by amount/mode/date exactly as before.
-- Paste this into Supabase → SQL Editor → New Query → Run.

alter table payments add column if not exists owner_reviewed boolean not null default false;
alter table payments add column if not exists reviewed_at timestamptz;
