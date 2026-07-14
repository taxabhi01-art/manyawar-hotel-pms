-- MANYAWAR HOTEL PMS — Migration 16
-- Adds: sequential bill numbering (auto-assigned on booking creation via a
-- trigger, so concurrent bookings never collide on the same number), and
-- per-section "Print on Bill" toggles for the Booking Confirmation / Tax
-- Invoice PDFs.
-- Paste this into Supabase → SQL Editor → New Query → Run

-- ---------- BILL NUMBERING ----------
-- settings.bill_no_prefix + settings.bill_no_next are owner-editable from
-- the Settings page (e.g. prefix "MH/26-27/", next number 101).
alter table settings add column if not exists bill_no_prefix text default '';
alter table settings add column if not exists bill_no_next integer default 1;

-- bookings.bill_no is assigned automatically — never set by the app itself.
alter table bookings add column if not exists bill_no text;

-- Atomically increments settings.bill_no_next and stamps the new booking
-- with "<prefix><number>" before the row is inserted. The UPDATE ... RETURNING
-- on the single settings row (id = 1) takes Postgres's normal row lock, so
-- two bookings created at the same moment still get distinct numbers.
create or replace function public.assign_bill_no()
returns trigger as $$
declare
  v_prefix text;
  v_used integer;
begin
  if new.bill_no is not null then
    return new;
  end if;
  update settings
  set bill_no_next = bill_no_next + 1
  where id = 1
  returning bill_no_prefix, bill_no_next - 1 into v_prefix, v_used;
  new.bill_no := coalesce(v_prefix, '') || v_used::text;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_assign_bill_no on bookings;
create trigger trg_assign_bill_no
  before insert on bookings
  for each row execute procedure public.assign_bill_no();

-- ---------- "PRINT ON BILL" SECTION TOGGLES ----------
-- Which blocks show on the Booking Confirmation / Tax Invoice PDFs. All
-- default true (matches current behavior, so existing bills are unaffected
-- until the owner turns something off).
alter table settings add column if not exists pdf_show_gst boolean default true;
alter table settings add column if not exists pdf_show_payment_trail boolean default true;
alter table settings add column if not exists pdf_show_occupancy boolean default true;
alter table settings add column if not exists pdf_show_checkin_checkout_time boolean default true;
alter table settings add column if not exists pdf_show_deposit boolean default true;
alter table settings add column if not exists pdf_show_booking_id boolean default true;
alter table settings add column if not exists pdf_show_reference_id boolean default true;
alter table settings add column if not exists pdf_show_bill_no boolean default true;
