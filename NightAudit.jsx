import React, { useState, useMemo } from "react";
import { SectionTitle, Modal, Button, currency, fmtDate, todayISO } from "../components.jsx";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function CalendarPage({ bookings, guests, rooms }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [dayModal, setDayModal] = useState(null); // ISO date string

  const activeBookings = bookings.filter((b) => b.status === "reserved" || b.status === "checked-in");

  const bookingsOnDay = (iso) => activeBookings.filter((b) => b.check_in <= iso && iso < b.check_out);

  const { cells, monthLabel } = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push(iso);
    }
    return { cells, monthLabel: `${MONTH_NAMES[month]} ${year}` };
  }, [year, month]);

  const goPrev = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };
  const goNext = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  const iso = today.toISOString().slice(0, 10);

  return (
    <div>
      <SectionTitle
        eyebrow="Occupancy"
        title="Booking calendar"
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Button variant="ghost" onClick={goPrev}>‹</Button>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 16, minWidth: 160, textAlign: "center" }}>
              {monthLabel}
            </span>
            <Button variant="ghost" onClick={goNext}>›</Button>
            <Button variant="ghost" onClick={goToday}>Today</Button>
          </div>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} style={{ fontSize: 11, fontWeight: 700, color: "var(--ink45)", textAlign: "center", textTransform: "uppercase" }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {cells.map((cellIso, i) => {
          if (!cellIso) return <div key={i} />;
          const dayBookings = bookingsOnDay(cellIso);
          const isToday = cellIso === iso;
          const dayNum = Number(cellIso.slice(-2));
          return (
            <button
              key={cellIso}
              onClick={() => dayBookings.length > 0 && setDayModal(cellIso)}
              style={{
                all: "unset",
                cursor: dayBookings.length > 0 ? "pointer" : "default",
                background: "#fff",
                border: isToday ? "2px solid var(--brass)" : "1px solid var(--hairline)",
                borderRadius: 8,
                minHeight: 74,
                padding: "6px 8px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: isToday ? "var(--brass)" : "var(--ink70)", fontWeight: isToday ? 700 : 500 }}>
                {dayNum}
              </span>
              {dayBookings.length > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#fff",
                    background: dayBookings.length >= rooms.length && rooms.length > 0 ? "var(--rust)" : "var(--sage)",
                    borderRadius: 999,
                    padding: "1px 8px",
                    alignSelf: "flex-start",
                  }}
                >
                  {dayBookings.length} booked
                </span>
              )}
            </button>
          );
        })}
      </div>

      {dayModal && (
        <DayDetailModal
          date={dayModal}
          bookings={bookingsOnDay(dayModal)}
          guests={guests}
          rooms={rooms}
          onClose={() => setDayModal(null)}
        />
      )}
    </div>
  );
}

function DayDetailModal({ date, bookings, guests, rooms, onClose }) {
  return (
    <Modal title={fmtDate(date)} onClose={onClose} width={460}>
      <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: 0 }}>
        {bookings.length} room{bookings.length === 1 ? "" : "s"} occupied or reserved on this date
      </p>
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
              <div style={{ fontSize: 12, color: "var(--ink45)", marginTop: 2 }}>
                {fmtDate(b.check_in)} → {fmtDate(b.check_out)} · {currency(b.total)} · {b.status}
                {b.created_at && <> · Booked on {fmtDate(b.created_at.slice(0, 10))}</>}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
