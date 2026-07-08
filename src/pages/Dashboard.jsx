import React from "react";
import { SectionTitle, Pill, currency, todayISO, STATUS } from "../components.jsx";

export default function Dashboard({ rooms, bookings, guests, setTab }) {
  const today = todayISO();
  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const occupancy = rooms.length ? Math.round((occupied / rooms.length) * 100) : 0;
  const checkinsToday = bookings.filter((b) => b.check_in === today && b.status === "reserved");
  const checkoutsToday = bookings.filter((b) => b.check_out === today && b.status === "checked-in");
  const monthPrefix = today.slice(0, 7);
  const revenueThisMonth = bookings
    .filter((b) => (b.check_in || "").startsWith(monthPrefix))
    .reduce((sum, b) => sum + (b.paid_amount || 0), 0);
  const overstays = bookings.filter((b) => b.status === "checked-in" && b.check_out < today);
  const reservedCount = bookings.filter((b) => b.status === "reserved").length;
  const statusCounts = {
    available: rooms.filter((r) => r.status === "available").length,
    occupied: rooms.filter((r) => r.status === "occupied").length,
    cleaning: rooms.filter((r) => r.status === "cleaning").length,
    maintenance: rooms.filter((r) => r.status === "maintenance").length,
  };

  const stats = [
    { label: "Occupancy", value: `${occupancy}%`, sub: `${occupied} of ${rooms.length} rooms` },
    { label: "Arriving today", value: checkinsToday.length, sub: "reserved guests" },
    { label: "Departing today", value: checkoutsToday.length, sub: "checked-in guests" },
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

      <SectionTitle eyebrow="Front desk" title="Today at a glance" />
      <div className="stat-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="label">{s.label}</div>
            <div className="value">{s.value}</div>
            <div className="sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <SectionTitle eyebrow="Room status" title="Right now" />
      <div className="stat-grid">
        {Object.entries(STATUS).map(([k, v]) => (
          <div className="stat-card" key={k}>
            <div className="label">{v.label}</div>
            <div className="value" style={{ color: v.color }}>{statusCounts[k]}</div>
          </div>
        ))}
        <div className="stat-card">
          <div className="label">Reserved (upcoming)</div>
          <div className="value">{reservedCount}</div>
        </div>
      </div>

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
