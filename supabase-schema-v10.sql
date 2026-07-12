-- MANYAWAR HOTEL PMS — TEST DATA CLEANUP (fixed version)
-- Deletes ALL guest/booking/operational test data.
-- KEEPS: rooms, settings, and login accounts (profiles table).
-- Paste this into Supabase → SQL Editor → New Query → Run

delete from co_guests;
delete from payments;
delete from inventory_usage;
delete from tasks;
delete from attendance;
delete from maintenance_tickets;
delete from expenses;
delete from night_audits;
delete from activity_log;
delete from bookings;
delete from guests;
delete from inventory_items;
delete from staff;
