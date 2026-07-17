import React, { useState, useMemo } from "react";
import { SectionTitle, Field, Button, Pill, EmptyState, currency, fmtDate, todayISO, addDaysISO } from "../components.jsx";
import { updatePayment } from "../lib/api.js";

// A personal sign-off checklist for the owner — NOT a financial
// calculation surface. owner_reviewed/reviewed_at (supabase-schema-v19.sql)
// is purely additive metadata: this is the ONLY file in the app that reads
// or writes it. Finance.jsx, Accounts.jsx (P&L + Cash Flow), Billing.jsx,
// Reports.jsx, Dashboard.jsx, and sumPayments() in components.jsx all
// continue to sum/filter payments purely by amount/mode/date exactly as
// before this tab existed — toggling a payment's review status here
// changes zero numbers anywhere else.
//
// Incoming/outgoing are both sourced from the same payments rows already
// nested on each booking (booking.payments, from listBookings()'s
// `select("*, payments(*))")` — no new fetch, same pattern Finance.jsx and
// Accounts.jsx already use to flatten "every payment" from `bookings`.
// Outgoing = amount < 0. Nothing in the app currently creates a
// negative-amount payment row (PaymentModal/EditPaymentModal both require
// amount > 0), so this list is expected to be empty today — it's built to
// correctly show refund-style entries if the payments table ever gets one
// (e.g. a future refund feature, or a manual DB correction), not because
// any exist yet.
export default function PaymentReview({ bookings, guests, reload }) {
  const [direction, setDirection] = useState("both"); // incoming | outgoing | both
  const [reviewFilter, setReviewFilter] = useState("all"); // all | reviewed | unreviewed
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const allPayments = useMemo(() => {
    const rows = [];
    (bookings || []).forEach((b) => (b.payments || []).forEach((p) => rows.push({ ...p, booking: b })));
    return rows;
  }, [bookings]);

  const toggleReviewed = async (payment) => {
    const next = !payment.owner_reviewed;
    const { error } = await updatePayment(payment.id, { owner_reviewed: next, reviewed_at: next ? new Date().toISOString() : null });
    if (error) return alert(`Couldn't update review status: ${error.message}`);
    reload();
  };

  const filtered = useMemo(
    () =>
      allPayments.filter((p) => {
        const isOutgoing = p.amount < 0;
        if (direction === "incoming" && isOutgoing) return false;
        if (direction === "outgoing" && !isOutgoing) return false;
        if (reviewFilter === "reviewed" && !p.owner_reviewed) return false;
        if (reviewFilter === "unreviewed" && p.owner_reviewed) return false;
        if (dateFrom && p.paid_on < dateFrom) return false;
        if (dateTo && p.paid_on > dateTo) return false;
        return true;
      }),
    [allPayments, direction, reviewFilter, dateFrom, dateTo]
  );

  const incoming = filtered.filter((p) => p.amount >= 0).sort((a, b) => (a.paid_on < b.paid_on ? 1 : -1));
  const outgoing = filtered.filter((p) => p.amount < 0).sort((a, b) => (a.paid_on < b.paid_on ? 1 : -1));

  const periodPreset = (daysAgo) => {
    const today = todayISO();
    setDateFrom(addDaysISO(today, -daysAgo));
    setDateTo(today);
  };

  return (
    <div>
      <SectionTitle eyebrow="Owner only" title="Payment Review" />
      <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: -10, marginBottom: 20, maxWidth: 640 }}>
        A personal sign-off checklist — mark payments as reviewed for your own tracking. This has no effect
        anywhere else in the app: it's a display/toggle layered on top of the existing payment records, not
        part of any total.
      </p>

      <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="Show">
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { key: "both", label: "Both" },
              { key: "incoming", label: "Incoming" },
              { key: "outgoing", label: "Outgoing" },
            ].map((d) => (
              <Button key={d.key} variant={direction === d.key ? "primary" : "ghost"} onClick={() => setDirection(d.key)}>
                {d.label}
              </Button>
            ))}
          </div>
        </Field>
        <Field label="Review status">
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { key: "all", label: "All" },
              { key: "reviewed", label: "Reviewed" },
              { key: "unreviewed", label: "Not yet reviewed" },
            ].map((r) => (
              <Button key={r.key} variant={reviewFilter === r.key ? "primary" : "ghost"} onClick={() => setReviewFilter(r.key)}>
                {r.label}
              </Button>
            ))}
          </div>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Button variant="ghost" onClick={() => periodPreset(6)}>Last 7 days</Button>
        <Button variant="ghost" onClick={() => periodPreset(29)}>Last 30 days</Button>
        <Field label="From">
          <input className="input" type="date" style={{ width: 140 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input className="input" type="date" style={{ width: 140 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" onClick={() => { setDateFrom(""); setDateTo(""); }}>
            Clear dates
          </Button>
        )}
      </div>

      {(direction === "both" || direction === "incoming") && (
        <>
          <SectionTitle eyebrow="Money in" title={`Incoming (${incoming.length})`} />
          <PaymentList payments={incoming} guests={guests} onToggle={toggleReviewed} emptyText="No incoming payments match this filter." />
        </>
      )}

      {(direction === "both" || direction === "outgoing") && (
        <div style={{ marginTop: 28 }}>
          <SectionTitle eyebrow="Money out" title={`Outgoing (${outgoing.length})`} />
          <PaymentList
            payments={outgoing}
            guests={guests}
            onToggle={toggleReviewed}
            emptyText="No outgoing/refund entries recorded — nothing in the app currently creates a negative payment."
            negative
          />
        </div>
      )}
    </div>
  );
}

function PaymentList({ payments, guests, onToggle, emptyText, negative }) {
  if (payments.length === 0) return <EmptyState text={emptyText} />;
  return (
    <div>
      {payments.map((p) => {
        const g = guests.find((x) => x.id === p.booking.guest_id);
        const refBillParts = [p.booking.booking_ref ? `Ref: ${p.booking.booking_ref}` : null, p.booking.bill_no ? `Bill No: ${p.booking.bill_no}` : null].filter(
          Boolean
        );
        return (
          <div className="card" key={p.id}>
            <span style={{ fontSize: 12.5, color: "var(--ink45)", width: 90 }}>{fmtDate(p.paid_on)}</span>
            <div className="card-col">
              <div className="title">{g ? g.name : "Guest removed"}</div>
              <div className="sub">{refBillParts.length ? refBillParts.join(" · ") : "—"}</div>
            </div>
            <Pill color="#46536b">{p.mode}</Pill>
            <span
              style={{
                fontFamily: "var(--font-mono)", fontWeight: 600, width: 100, textAlign: "right",
                color: negative ? "var(--rust)" : "var(--sage)",
              }}
            >
              {currency(p.amount)}
            </span>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginLeft: "auto", cursor: "pointer" }}>
              <input type="checkbox" checked={!!p.owner_reviewed} onChange={() => onToggle(p)} />
              Reviewed
            </label>
          </div>
        );
      })}
    </div>
  );
}
