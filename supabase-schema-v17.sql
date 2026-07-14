-- MANYAWAR HOTEL PMS — Migration 17
-- Fixes bill numbering so bill_no always stores the FULL combined string
-- (prefix + zero-padded sequence number, e.g. "FY26-27Q3005") at insert
-- time. This is the single source of truth for bill_no — every place that
-- displays it (Bookings list, Tax Invoice PDF, Booking Confirmation PDF)
-- just reads booking.bill_no verbatim, with no prefix logic of its own.
-- Storing the combined string at insert time (rather than storing prefix
-- and number separately and concatenating at display time) means a bill's
-- printed number never changes even if the owner edits the prefix later —
-- same principle as booking_ref, which is also assigned once and kept.
--
-- If bill_no was showing as a bare number with no prefix (e.g. "59"
-- instead of "FY26-27Q3059"), the old v16 trigger had an
-- "if new.bill_no is not null then return new" guard meant to be
-- defensive — but nothing in the app ever sets bill_no client-side, so in
-- practice that guard could only be tripped by something else on the
-- bookings table (a leftover trigger from before this feature, if one was
-- ever set up directly in Supabase) assigning a plain number first. This
-- migration drops that guard so assign_bill_no is unconditionally
-- authoritative, and zero-pads the sequence number to 3 digits.
--
-- Paste this into Supabase → SQL Editor → New Query → Run.
-- Note: this only fixes bill_no for bookings created AFTER this migration
-- runs — it does not rewrite bill_no on existing bookings, since an
-- already-issued bill number shouldn't be silently changed.

create or replace function public.assign_bill_no()
returns trigger as $$
declare
  v_prefix text;
  v_used integer;
begin
  update settings
  set bill_no_next = bill_no_next + 1
  where id = 1
  returning bill_no_prefix, bill_no_next - 1 into v_prefix, v_used;
  new.bill_no := coalesce(v_prefix, '') || lpad(v_used::text, 3, '0');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_assign_bill_no on bookings;
create trigger trg_assign_bill_no
  before insert on bookings
  for each row execute procedure public.assign_bill_no();
