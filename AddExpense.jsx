import React, { useState, useMemo } from "react";
import { SectionTitle, Field, Button, Modal, Pill, currency, fmtDate, todayISO } from "../components.jsx";
import { updateBooking, upsertNightAudit, logActivity } from "../lib/api.js";

export default function NightAudit({ rooms, bookings, guests, expenses, nightAudits, role, runByEmail, reload }) {
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [running, setRunning] = useState(false);
  const [detailModal, setDetailModal] = useState(null);

  const guestOf = (id) => guests.find((g) => g.id === id);
  const roomOf = (id) => rooms.find((r) => r.id === id);

  const arrivalsExpected = bookings.filter((b) => b.check_in === date && b.status !== "cancelled");
  const arrivalsDone = arrivalsExpected.filter((b) => b.status === "checked-in" || b.status === "checked-out");
  const noShows = arrivalsExpected.filter((b) => b.status === "reserved" && date < todayISO());
  const departuresExpected = bookings.filter((b) => b.check_out === date && b.status !== "cancelled");
  const departuresDone = departuresExpected.filter((b) => b.status === "checked-out");

  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const occupancyPercent = rooms.length ? Math.round((occupied / rooms.length) * 100) : 0;

  const dayPayments = useMemo(() => {
    const rows = [];
    bookings.forEach((b) => (b.payments || []).forEach((p) => { if (p.paid_on === date) rows.push(p); }));
    return rows;
  }, [bookings, date]);
  const revenue = dayPayments.reduce((s, p) => s + p.amount, 0);
  const revenueByMode = useMemo(() => {
    const map = {};
    dayPayments.forEach((p) => (map[p.mode] = (map[p.mode] || 0) + p.amount));
    return map;
  }, [dayPayments]);

  const dayExpenses = role === "owner" ? expenses.filter((e) => e.expense_date === date) : [];
  const expenseTotal = role === "owner" ? dayExpenses.reduce((s, e) => s + e.amount, 0) : null;
  const expensesByCategory = useMemo(() => {
    const map = {};
    dayExpenses.forEach((e) => (map[e.category] = (map[e.category] || 0) + e.amount));
    return map;
  }, [dayExpenses]);

  const earlyCheckinsToday = bookings.filter((b) => b.early_checkin && b.checked_in_at && b.checked_in_at.slice(0, 10) === date);
  const lateCheckoutsToday = bookings.filter((b) => b.late_checkout && b.checked_out_at && b.checked_out_at.slice(0, 10) === date);

  const alreadyRun = nightAudits.find((a) => a.audit_date === date);

  const markNoShow = async (b) => {
    if (!confirm("Mark this reservation as a no-show? The room becomes free for these dates.")) return;
    await updateBooking(b.id, { status: "no-show" });
    const g = guestOf(b.guest_id);
    const r = roomOf(b.room_id);
    logActivity("Marked no-show", `${g ? g.name : "Guest"} — Room ${r ? r.number : "—"}`);
    reload();
  };

  const bookingLine = (b) => {
    const g = guestOf(b.guest_id);
    const r = roomOf(b.room_id);
    return { guest: g ? g.name : "Guest removed", room: r ? r.number : "—", status: b.status, total: b.total };
  };

  const runAudit = async () => {
    setRunning(true);
    const details = {
      arrivals: arrivalsExpected.map(bookingLine),
      departures: departuresExpected.map(bookingLine),
      noShows: noShows.map(bookingLine),
      earlyCheckins: earlyCheckinsToday.map((b) => ({ ...bookingLine(b), fee: b.early_checkin_fee || 0 })),
      lateCheckouts: lateCheckoutsToday.map((b) => ({ ...bookingLine(b), fee: b.late_checkout_fee || 0 })),
      revenueByMode,
      expensesByCategory: role === "owner" ? expensesByCategory : null,
    };
    await upsertNightAudit({
      audit_date: date,
      occupancy_percent: occupancyPercent,
      rooms_occupied: occupied,
      revenue,
      expenses: expenseTotal,
      no_shows: noShows.length,
      early_checkins: earlyCheckinsToday.length,
      late_checkouts: lateCheckoutsToday.length,
      notes: notes.trim() || null,
      run_by: runByEmail || null,
      details,
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
        <div className="stat-card">
          <div className="label">Early check-ins</div>
          <div className="value" style={{ color: "var(--brass)" }}>{earlyCheckinsToday.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Late checkouts</div>
          <div className="value" style={{ color: "var(--rust)" }}>{lateCheckoutsToday.length}</div>
        </div>
      </div>

      {/* ---- Full itemized detail for the selected date ---- */}
      <SectionTitle eyebrow="Detail" title={`Everything for ${fmtDate(date)}`} />

      <DetailBlock title="Arrivals" rows={arrivalsExpected} guestOf={guestOf} roomOf={roomOf} empty="No arrivals expected." />
      <DetailBlock title="Departures" rows={departuresExpected} guestOf={guestOf} roomOf={roomOf} empty="No departures expected." />

      {noShows.length > 0 && (
        <>
          <SectionTitle eyebrow="Attention" title="Possible no-shows" />
          <div style={{ marginBottom: 24 }}>
            {noShows.map((b) => {
              const g = guestOf(b.guest_id);
              const r = roomOf(b.room_id);
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

      {(earlyCheckinsToday.length > 0 || lateCheckoutsToday.length > 0) && (
        <div className="grid-2" style={{ marginBottom: 24, gap: 16 }}>
          <div>
            <SectionTitle eyebrow="Timing" title="Early check-ins" />
            {earlyCheckinsToday.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink45)" }}>None today.</p>
            ) : (
              earlyCheckinsToday.map((b) => {
                const g = guestOf(b.guest_id);
                const r = roomOf(b.room_id);
                return (
                  <div className="card" key={b.id}>
                    <span style={{ fontSize: 13, flex: 1 }}>{g ? g.name : "Guest"} — Room {r ? r.number : "—"}</span>
                    {b.early_checkin_fee > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--brass)" }}>+{currency(b.early_checkin_fee)}</span>}
                  </div>
                );
              })
            )}
          </div>
          <div>
            <SectionTitle eyebrow="Timing" title="Late checkouts" />
            {lateCheckoutsToday.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink45)" }}>None today.</p>
            ) : (
              lateCheckoutsToday.map((b) => {
                const g = guestOf(b.guest_id);
                const r = roomOf(b.room_id);
                return (
                  <div className="card" key={b.id}>
                    <span style={{ fontSize: 13, flex: 1 }}>{g ? g.name : "Guest"} — Room {r ? r.number : "—"}</span>
                    {b.late_checkout_fee > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--rust)" }}>+{currency(b.late_checkout_fee)}</span>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 24, gap: 16 }}>
        <div>
          <SectionTitle eyebrow="Money in" title="Revenue by mode" />
          <div className="stat-card">
            {Object.keys(revenueByMode).length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink45)", margin: 0 }}>No payments today.</p>
            ) : (
              Object.entries(revenueByMode).map(([mode, amt]) => (
                <div key={mode} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                  <span>{mode}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{currency(amt)}</span>
                </div>
              ))
            )}
          </div>
        </div>
        {role === "owner" && (
          <div>
            <SectionTitle eyebrow="Money out" title="Expenses by category" />
            <div className="stat-card">
              {Object.keys(expensesByCategory).length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--ink45)", margin: 0 }}>No expenses today.</p>
              ) : (
                Object.entries(expensesByCategory).map(([cat, amt]) => (
                  <div key={cat} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                    <span>{cat}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{currency(amt)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

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
            {a.early_checkins > 0 && <Pill color="#b8863f">{a.early_checkins} early check-in{a.early_checkins === 1 ? "" : "s"}</Pill>}
            {a.late_checkouts > 0 && <Pill color="#a6452f">{a.late_checkouts} late checkout{a.late_checkouts === 1 ? "" : "s"}</Pill>}
            <span style={{ flex: 1, fontSize: 12, color: "var(--ink45)" }}>{a.notes}</span>
            {a.details && (
              <Button variant="ghost" onClick={() => setDetailModal(a)}>
                View details
              </Button>
            )}
          </div>
        ))
      )}

      {detailModal && <HistoryDetailModal audit={detailModal} onClose={() => setDetailModal(null)} />}
    </div>
  );
}

function DetailBlock({ title, rows, guestOf, roomOf, empty }) {
  return (
    <>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink70)", margin: "0 0 8px" }}>{title} ({rows.length})</div>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink45)", marginBottom: 20 }}>{empty}</p>
      ) : (
        <div style={{ marginBottom: 20 }}>
          {rows.map((b) => {
            const g = guestOf(b.guest_id);
            const r = roomOf(b.room_id);
            return (
              <div className="card" key={b.id}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, width: 60 }}>{r ? r.number : "—"}</span>
                <span style={{ flex: 1, fontSize: 13 }}>{g ? g.name : "Guest removed"}</span>
                <span style={{ fontSize: 12, color: "var(--ink45)" }}>{b.status}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{currency(b.total)}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function HistoryDetailModal({ audit, onClose }) {
  const d = audit.details || {};
  return (
    <Modal title={`Full detail — ${fmtDate(audit.audit_date)}`} onClose={onClose} width={520}>
      <Section title={`Arrivals (${(d.arrivals || []).length})`} rows={d.arrivals} />
      <Section title={`Departures (${(d.departures || []).length})`} rows={d.departures} />
      <Section title={`No-shows (${(d.noShows || []).length})`} rows={d.noShows} />
      <Section title={`Early check-ins (${(d.earlyCheckins || []).length})`} rows={d.earlyCheckins} showFee />
      <Section title={`Late checkouts (${(d.lateCheckouts || []).length})`} rows={d.lateCheckouts} showFee />
      {d.revenueByMode && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Revenue by mode</div>
          {Object.entries(d.revenueByMode).map(([mode, amt]) => (
            <div key={mode} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span>{mode}</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{currency(amt)}</span>
            </div>
          ))}
        </div>
      )}
      {d.expensesByCategory && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Expenses by category</div>
          {Object.entries(d.expensesByCategory).map(([cat, amt]) => (
            <div key={cat} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span>{cat}</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{currency(amt)}</span>
            </div>
          ))}
        </div>
      )}
      {audit.notes && (
        <div style={{ fontSize: 12.5, color: "var(--ink70)", fontStyle: "italic" }}>"{audit.notes}"</div>
      )}
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}

function Section({ title, rows, showFee }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}>
          <span>{r.guest} — Room {r.room}</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>{showFee && r.fee > 0 ? `+${currency(r.fee)}` : currency(r.total)}</span>
        </div>
      ))}
    </div>
  );
}
