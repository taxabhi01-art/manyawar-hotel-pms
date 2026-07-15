-- MANYAWAR HOTEL PMS — READ-ONLY AUDIT: overpaid bookings
-- Finds every booking where total payments received (sum of that booking's
-- payments rows) exceed its current grand total (bookings.total, which
-- already folds in discounts/fees/items_total/services_total — see
-- computeBookingTotal in src/components.jsx). This is the same "excess"
-- the app now surfaces via the "Excess amount received" line on the Tax
-- Invoice PDF and the "Settle excess" button in the Billing tab.
--
-- SELECT only — makes no changes. Paste into Supabase → SQL Editor → New
-- Query → Run.

select
  coalesce(g.name, 'Guest removed') as guest_name,
  b.booking_ref,
  b.bill_no,
  b.total as grand_total,
  p.total_paid,
  p.total_paid - b.total as excess_amount
from bookings b
join (
  select booking_id, sum(amount) as total_paid
  from payments
  group by booking_id
) p on p.booking_id = b.id
left join guests g on g.id = b.guest_id
where p.total_paid > b.total
order by excess_amount desc;
