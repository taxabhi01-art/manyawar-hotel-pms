import React, { useState, useEffect } from "react";
import { SectionTitle, Pill, Button, Modal, currency, fmtDate, fmtDateTimeDayIST, todayISO, addDaysISO, STATUS, sumPayments, groupPaid, groupTotal } from "../components.jsx";

export default function Dashboard({ rooms, bookings, guests, setTab, onOpenCheckIn, onOpenCheckOut }) {
  const [reservedModalOpen, setReservedModalOpen] = useState(false);
  const [arrivalsModalOpen, setArrivalsModalOpen] = useState(false);
  const [departuresModalOpen, setDeparturesModalOpen] = useState(false);
  const [arrivalsTomorrowModalOpen, setArrivalsTomorrowModalOpen] = useState(false);
  const [departuresTomorrowModalOpen, setDeparturesTomorrowModalOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const today = todayISO();
  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const occupancy = rooms.length ? Math.round((occupied / rooms.length) * 100) : 0;
  const checkinsToday = bookings.filter((b) => b.check_in === today && b.status === "reserved");
  const checkoutsToday = bookings.filter((b) => b.check_out === today && b.status === "checked-in");
  const tomorrow = addDaysISO(today, 1);
  const checkinsTomorrow = bookings.filter((b) => b.check_in === tomorrow && b.status === "reserved");
  const checkoutsTomorrow = bookings.filter((b) => b.check_out === tomorrow && b.status === "checked-in");
  const monthPrefix = today.slice(0, 7);
  const revenueThisMonth = bookings
    .filter((b) => (b.check_in || "").startsWith(monthPrefix))
    .reduce((sum, b) => sum + sumPayments(b), 0);
  const overstays = bookings.filter((b) => b.status === "checked-in" && b.check_out < today);
  const reservedBookings = bookings.filter((b) => b.status === "reserved").sort((a, b) => (a.check_in < b.check_in ? -1 : 1));
  const statusCounts = {
    available: rooms.filter((r) => r.status === "available").length,
    occupied: rooms.filter((r) => r.status === "occupied").length,
    cleaning: rooms.filter((r) => r.status === "cleaning").length,
    maintenance: rooms.filter((r) => r.status === "maintenance").length,
  };

  const stats = [
    { label: "Occupancy", value: `${occupancy}%`, sub: `${occupied} of ${rooms.length} rooms` },
    {
      label: "Arriving today",
      value: checkinsToday.length,
      sub: checkinsToday.length > 0 ? "Click to check guests in" : "reserved guests",
      onClick: checkinsToday.length > 0 ? () => setArrivalsModalOpen(true) : null,
    },
    {
      label: "Departing today",
      value: checkoutsToday.length,
      sub: checkoutsToday.length > 0 ? "Click to check guests out" : "checked-in guests",
      onClick: checkoutsToday.length > 0 ? () => setDeparturesModalOpen(true) : null,
    },
    { label: "Revenue this month", value: currency(revenueThisMonth), sub: "amount collected" },
  ];

  return (
    <div>
      {overstays.length > 0 && (
        <div className="error-banner" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <strong>{overstays.length} guest(s) past checkout date.</strong>{" "}
            {overstays
              .map((b) => {
                const g = guests.find((x) => x.id === b.guest_id);
                const r = rooms.find((x) => x.id === b.room_id);
                return `${g ? g.name : "Guest"} · Room ${r ? r.number : "—"}`;
              })
              .join("  ·  ")}
          </div>
          <button className="btn btn-dark" onClick={() => setTab("bookings")}>
            Review
          </button>
        </div>
      )}

      <SectionTitle
        eyebrow="Front desk"
        title="Today at a glance"
        action={
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink70)" }}>
            {fmtDateTimeDayIST(now)}
          </div>
        }
      />
      <div className="stat-grid">
        {stats.map((s) =>
          s.onClick ? (
            <button key={s.label} onClick={s.onClick} className="stat-card" style={{ all: "unset", cursor: "pointer", display: "block" }}>
              <div className="stat-card">
                <div className="label">{s.label}</div>
                <div className="value">{s.value}</div>
                <div className="sub" style={{ color: "var(--brass)", fontWeight: 600 }}>{s.sub}</div>
              </div>
            </button>
          ) : (
            <div className="stat-card" key={s.label}>
              <div className="label">{s.label}</div>
              <div className="value">{s.value}</div>
              <div className="sub">{s.sub}</div>
            </div>
          )
        )}
      </div>

      {(checkinsTomorrow.length > 0 || checkoutsTomorrow.length > 0) && (
        <>
          <SectionTitle eyebrow="Reminder" title="Tomorrow's schedule" />
          <div className="stat-grid" style={{ marginBottom: 20 }}>
            <button
              className="stat-card"
              onClick={() => checkinsTomorrow.length > 0 && setArrivalsTomorrowModalOpen(true)}
              style={{ all: "unset", cursor: checkinsTomorrow.length > 0 ? "pointer" : "default", display: "block" }}
            >
              <div className="stat-card">
                <div className="label">Arriving tomorrow</div>
                <div className="value">{checkinsTomorrow.length}</div>
                {checkinsTomorrow.length > 0 && <div className="sub">Click to see details</div>}
              </div>
            </button>
            <button
              className="stat-card"
              onClick={() => checkoutsTomorrow.length > 0 && setDeparturesTomorrowModalOpen(true)}
              style={{ all: "unset", cursor: checkoutsTomorrow.length > 0 ? "pointer" : "default", display: "block" }}
            >
              <div className="stat-card">
                <div className="label">Departing tomorrow</div>
                <div className="value">{checkoutsTomorrow.length}</div>
                {checkoutsTomorrow.length > 0 && <div className="sub">Click to see details</div>}
              </div>
            </button>
          </div>
        </>
      )}

      {arrivalsModalOpen && (
        <ArrivalsModal
          bookings={checkinsToday}
          guests={guests}
          rooms={rooms}
          onClose={() => setArrivalsModalOpen(false)}
          onCheckIn={(b) => {
            setArrivalsModalOpen(false);
            onOpenCheckIn(b);
          }}
        />
      )}
      {departuresModalOpen && (
        <DeparturesModal
          bookings={checkoutsToday}
          allBookings={bookings}
          guests={guests}
          rooms={rooms}
          onClose={() => setDeparturesModalOpen(false)}
          onCheckOut={(b) => {
            setDeparturesModalOpen(false);
            onOpenCheckOut(b);
          }}
        />
      )}
      {arrivalsTomorrowModalOpen && (
        <TomorrowListModal
          title="Arriving tomorrow"
          bookings={checkinsTomorrow}
          guests={guests}
          rooms={rooms}
          onClose={() => setArrivalsTomorrowModalOpen(false)}
        />
      )}
      {departuresTomorrowModalOpen && (
        <TomorrowListModal
          title="Departing tomorrow"
          bookings={checkoutsTomorrow}
          guests={guests}
          rooms={rooms}
          onClose={() => setDeparturesTomorrowModalOpen(false)}
        />
      )}

      <SectionTitle eyebrow="Room status" title="Right now" />
      <div className="stat-grid">
        {Object.entries(STATUS).map(([k, v]) => (
          <div className="stat-card" key={k}>
            <div className="label">{v.label}</div>
            <div className="value" style={{ color: v.color }}>{statusCounts[k]}</div>
          </div>
        ))}
        <button
          className="stat-card"
          onClick={() => reservedBookings.length > 0 && setReservedModalOpen(true)}
          style={{ all: "unset", cursor: reservedBookings.length > 0 ? "pointer" : "default", display: "block" }}
        >
          <div className="stat-card">
            <div className="label">Reserved (upcoming)</div>
            <div className="value">{reservedBookings.length}</div>
            {reservedBookings.length > 0 && <div className="sub">Click to see details</div>}
          </div>
        </button>
      </div>

      {reservedModalOpen && (
        <Modal title="Upcoming reservations" onClose={() => setReservedModalOpen(false)} width={480}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {reservedBookings.map((b) => {
              const g = guests.find((x) => x.id === b.guest_id);
              const r = rooms.find((x) => x.id === b.room_id);
              return (
                <div key={b.id} style={{ background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 600 }}>
                    <span>{g ? g.name : "Guest removed"}</span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>Room {r ? r.number : "—"}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink45)", marginTop: 2 }}>
                    {fmtDate(b.check_in)} → {fmtDate(b.check_out)} · {currency(b.total)} · {g ? g.phone : ""}
                    {b.created_at && <> · Booked on {fmtDate(b.created_at.slice(0, 10))}</>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <Button
              variant="ghost"
              onClick={() => {
                setReservedModalOpen(false);
                setTab("bookings");
              }}
            >
              Go to Bookings
            </Button>
          </div>
        </Modal>
      )}

      <SectionTitle
        eyebrow="Room board"
        title="Every key, at a glance"
        action={
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {Object.entries(STATUS).map(([k, v]) => (
              <Pill key={k} color={v.color}>
                {v.label}
              </Pill>
            ))}
          </div>
        }
      />
      {rooms.length === 0 ? (
        <p style={{ color: "var(--ink45)" }}>No rooms yet. Add rooms to see them here.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 12 }}>
          {rooms.map((r) => {
            const s = STATUS[r.status];
            return (
              <div key={r.id} style={{ background: "#fff", border: "1px solid var(--hairline)", borderRadius: 10, padding: "14px 12px 10px", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 600 }}>{r.number}</div>
                <div style={{ fontSize: 11, color: "var(--ink45)", textTransform: "uppercase" }}>{r.type}</div>
                <div style={{ marginTop: 6, height: 4, borderRadius: 999, background: s?.color }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ArrivalsModal({ bookings, guests, rooms, onClose, onCheckIn }) {
  return (
    <Modal title="Arriving today" onClose={onClose} width={460}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {bookings.map((b) => {
          const g = guests.find((x) => x.id === b.guest_id);
          const r = rooms.find((x) => x.id === b.room_id);
          return (
            <div key={b.id} style={{ background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{g ? g.name : "Guest removed"}</div>
                <div style={{ fontSize: 12, color: "var(--ink45)" }}>
                  Room {r ? r.number : "—"} · {currency(b.total)}
                </div>
              </div>
              <Button onClick={() => onCheckIn(b)}>Check in</Button>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}

// Plain listing for tomorrow's arrivals/departures — no check-in/out
// action, this is a heads-up view, not a workflow (see ArrivalsModal /
// DeparturesModal above for the today-and-actionable equivalents).
function TomorrowListModal({ title, bookings, guests, rooms, onClose }) {
  return (
    <Modal title={title} onClose={onClose} width={460}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {bookings.map((b) => {
          const g = guests.find((x) => x.id === b.guest_id);
          const r = rooms.find((x) => x.id === b.room_id);
          return (
            <div key={b.id} style={{ background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 600 }}>
                <span>{g ? g.name : "Guest removed"}</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>Room {r ? r.number : "—"}</span>
              </div>
              {b.booking_ref && (
                <div style={{ fontSize: 12, color: "var(--ink45)", marginTop: 2, fontFamily: "var(--font-mono)" }}>Ref: {b.booking_ref}</div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}

// A departing room that's part of a multi-room booking only ever holds its
// own room's payments/total — the deposit/payments concentrate on the
// primary room (see createBooking in Bookings.jsx) — so this needs the
// GROUP's balance, not this row's own, or a secondary room would show a
// misleading "Due ₹X" for the full room charge even though the group's
// deposit already covers it.
function DeparturesModal({ bookings, allBookings, guests, rooms, onClose, onCheckOut }) {
  return (
    <Modal title="Departing today" onClose={onClose} width={460}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {bookings.map((b) => {
          const g = guests.find((x) => x.id === b.guest_id);
          const r = rooms.find((x) => x.id === b.room_id);
          const balance = groupTotal(b, allBookings) - groupPaid(b, allBookings);
          return (
            <div key={b.id} style={{ background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{g ? g.name : "Guest removed"}</div>
                <div style={{ fontSize: 12, color: balance > 0 ? "var(--rust)" : "var(--ink45)" }}>
                  Room {r ? r.number : "—"} · {balance > 0 ? `Due ${currency(balance)}` : "Settled"}
                </div>
              </div>
              <Button variant="dark" onClick={() => onCheckOut(b)}>
                Check out
              </Button>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
