import React, { useState, useMemo } from "react";
import { SectionTitle, Field, Button, Pill, currency, fmtDate, todayISO } from "../components.jsx";
import { updateBooking, upsertNightAudit } from "../lib/api.js";

export default function NightAudit({ rooms, bookings, guests, expenses, nightAudits, role, runByEmail, reload }) {
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [running, setRunning] = useState(false);

  const arrivalsExpected = bookings.filter((b) => b.check_in === date && b.status !== "cancelled");
  const arrivalsDone = arrivalsExpected.filter((b) => b.status === "checked-in" || b.status === "checked-out");
  const noShows = arrivalsExpected.filter((b) => b.status === "reserved" && date < todayISO());
  const departuresExpected = bookings.filter((b) => b.check_out === date && b.status !== "cancelled");
  const departuresDone = departuresExpected.filter((b) => b.status === "checked-out");

  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const occupancyPercent = rooms.length ? Math.round((occupied / rooms.length) * 100) : 0;

  const revenue = useMemo(() => {
    let total = 0;
    bookings.forEach((b) => (b.payments || []).forEach((p) => { if (p.paid_on === date) total += p.amount; }));
    return total;
  }, [bookings, date]);

  const expenseTotal = role === "owner" ? expenses.filter((e) => e.expense_date === date).reduce((s, e) => s + e.amount, 0) : null;

  const alreadyRun = nightAudits.find((a) => a.audit_date === date);

  const markNoShow = async (b) => {
    if (!confirm("Mark this reservation as a no-show? The room becomes free for these dates.")) return;
    await updateBooking(b.id, { status: "no-show" });
    reload();
  };

  const runAudit = async () => {
    setRunning(true);
    await upsertNightAudit({
      audit_date: date,
      occupancy_percent: occupancyPercent,
      rooms_occupied: occupied,
      revenue,
      expenses: expenseTotal,
      no_shows: noShows.length,
      notes: notes.trim() || null,
      run_by: runByEmail || null,
    });
    setRunning(false);
    setNotes("");
    reload();
  };

  return (
    <div>
      <SectionTitle
        eyebrow="End of day"
        title="Night audit"
        action={
          <Field label="Audit date">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        }
      />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Arrivals</div>
          <div className="value">{arrivalsDone.length}/{arrivalsExpected.length}</div>
          <div className="sub">checked in / expected</div>
        </div>
        <div className="stat-card">
          <div className="label">Departures</div>
          <div className="value">{departuresDone.length}/{departuresExpected.length}</div>
          <div className="sub">checked out / expected</div>
        </div>
        <div className="stat-card">
          <div className="label">Occupancy</div>
          <div className="value">{occupancyPercent}%</div>
          <div className="sub">{occupied} of {rooms.length} rooms</div>
        </div>
        <div className="stat-card">
          <div className="label">Revenue collected</div>
          <div className="value" style={{ color: "var(--sage)" }}>{currency(revenue)}</div>
          {role === "owner" && <div className="sub">Expenses: {currency(expenseTotal)}</div>}
        </div>
      </div>

      {noShows.length > 0 && (
        <>
          <SectionTitle eyebrow="Attention" title="Possible no-shows" />
          <div style={{ marginBottom: 24 }}>
            {noShows.map((b) => {
              const g = guests.find((x) => x.id === b.guest_id);
              const r = rooms.find((x) => x.id === b.room_id);
              return (
                <div className="card" key={b.id}>
                  <div className="card-col">
                    <div className="title">{g ? g.name : "Guest removed"}</div>
                    <div className="sub">Room {r ? r.number : "—"} · was due {fmtDate(b.check_in)}</div>
                  </div>
                  <Button variant="danger" onClick={() => markNoShow(b)}>
                    Mark no-show
                  </Button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <SectionTitle eyebrow="Close the day" title={`Run audit for ${fmtDate(date)}`} />
      <div className="stat-card" style={{ marginBottom: 30 }}>
        {alreadyRun && (
          <p style={{ fontSize: 12.5, color: "var(--brass)", marginTop: 0 }}>
            ⚠ This date was already audited on {fmtDate(alreadyRun.run_at?.slice(0, 10))}. Running again will overwrite that record.
          </p>
        )}
        <Field label="Notes (optional)">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering about today" />
        </Field>
        <div style={{ marginTop: 12 }}>
          <Button disabled={running} onClick={runAudit}>
            {running ? "Saving…" : alreadyRun ? "Re-run night audit" : "Run night audit"}
          </Button>
        </div>
      </div>

      <SectionTitle eyebrow="History" title="Past audits" />
      {nightAudits.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink45)" }}>No audits run yet.</p>
      ) : (
        nightAudits.slice(0, 30).map((a) => (
          <div className="card" key={a.id}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, width: 100 }}>{fmtDate(a.audit_date)}</span>
            <span style={{ fontSize: 12.5, width: 90 }}>Occ. {a.occupancy_percent}%</span>
            <span style={{ fontSize: 12.5, color: "var(--sage)", width: 110 }}>{currency(a.revenue)}</span>
            {a.no_shows > 0 && <Pill color="#a6452f">{a.no_shows} no-show{a.no_shows === 1 ? "" : "s"}</Pill>}
            <span style={{ flex: 1, fontSize: 12, color: "var(--ink45)" }}>{a.notes}</span>
          </div>
        ))
      )}
    </div>
  );
}
