import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { SectionTitle, Field, Button, Modal, currency, todayISO } from "../components.jsx";

export default function Reports({ rooms, guests, bookings, staff, attendance }) {
  const [exportOpen, setExportOpen] = useState(false);
  const today = todayISO();

  const last15 = useMemo(() => sumPaidInRange(bookings, daysAgo(15), today), [bookings]);
  const prev15 = useMemo(() => sumPaidInRange(bookings, daysAgo(30), daysAgo(15)), [bookings]);
  const last15Change = prev15 === 0 ? null : Math.round(((last15 - prev15) / prev15) * 100);

  const thisMonth = useMemo(() => sumPaidInRange(bookings, today.slice(0, 8) + "01", today), [bookings]);
  const lastMonthRange = lastMonthBounds(today);
  const lastMonth = useMemo(() => sumPaidInRange(bookings, lastMonthRange.start, lastMonthRange.end), [bookings]);
  const monthChange = lastMonth === 0 ? null : Math.round(((thisMonth - lastMonth) / lastMonth) * 100);

  const dailyChart = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(daysAgo(i));
    return days.map((d) => ({
      date: d.slice(5),
      revenue: (bookings || []).reduce((sum, b) => sum + (b.payments || []).filter((p) => p.paid_on === d).reduce((s, p) => s + p.amount, 0), 0),
    }));
  }, [bookings]);

  return (
    <div>
      <SectionTitle
        eyebrow="Owner only"
        title="Reports & Revenue"
        action={<Button onClick={() => setExportOpen(true)}>Export to Excel</Button>}
      />
      <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: -10, marginBottom: 24 }}>
        This page is only visible to accounts marked "owner" in Supabase — staff logins never see it.
      </p>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Last 15 days</div>
          <div className="value">{currency(last15)}</div>
          <div className="sub">
            {last15Change === null ? "—" : `${last15Change >= 0 ? "▲" : "▼"} ${Math.abs(last15Change)}% vs previous 15 days`}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">This month</div>
          <div className="value">{currency(thisMonth)}</div>
          <div className="sub">
            {monthChange === null ? "—" : `${monthChange >= 0 ? "▲" : "▼"} ${Math.abs(monthChange)}% vs last month`}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Previous 15 days</div>
          <div className="value">{currency(prev15)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Last month</div>
          <div className="value">{currency(lastMonth)}</div>
        </div>
      </div>

      <SectionTitle eyebrow="Trend" title="Daily revenue — last 14 days" />
      <div className="stat-card" style={{ marginBottom: 30 }}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dailyChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip formatter={(v) => currency(v)} />
            <Bar dataKey="revenue" fill="#b8863f" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {exportOpen && (
        <ExportModal
          onClose={() => setExportOpen(false)}
          onExport={(range) => {
            exportToExcel({ rooms, guests, bookings, staff, attendance }, range);
            setExportOpen(false);
          }}
        />
      )}
    </div>
  );
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}
function lastMonthBounds(todayIso) {
  const d = new Date(todayIso + "T00:00:00");
  const firstOfThisMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  const lastOfPrevMonth = new Date(firstOfThisMonth - 86400000);
  const firstOfPrevMonth = new Date(lastOfPrevMonth.getFullYear(), lastOfPrevMonth.getMonth(), 1);
  return { start: firstOfPrevMonth.toISOString().slice(0, 10), end: lastOfPrevMonth.toISOString().slice(0, 10) };
}
function sumPaidInRange(bookings, start, end) {
  let total = 0;
  (bookings || []).forEach((b) => {
    (b.payments || []).forEach((p) => {
      if (p.paid_on >= start && p.paid_on <= end) total += p.amount;
    });
  });
  return total;
}

function ExportModal({ onClose, onExport }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const preset = (days) => {
    setEnd(todayISO());
    setStart(daysAgo(days));
  };

  return (
    <Modal title="Export to Excel" onClose={onClose} width={400}>
      <p style={{ fontSize: 13 }}>Bookings, payments, and attendance filter to this period. Rooms, guests, and staff always export in full.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <Button variant="ghost" onClick={() => preset(7)}>Last 7 days</Button>
        <Button variant="ghost" onClick={() => preset(30)}>Last 30 days</Button>
        <Button variant="ghost" onClick={() => { setStart(""); setEnd(""); }}>All time</Button>
      </div>
      <div className="grid-2">
        <Field label="Start date">
          <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="End date">
          <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onExport({ start, end })}>Download Excel</Button>
      </div>
    </Modal>
  );
}

function exportToExcel({ rooms, guests, bookings, staff, attendance }, { start, end }) {
  const filterActive = !!(start || end);
  const inRange = (d) => {
    if (!d) return false;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  };

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(rooms.map((r) => ({ "Room No": r.number, Floor: r.floor, Type: r.type, "Rate/Night": r.rate, Status: r.status }))),
    "Rooms"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(guests.map((g) => ({ Name: g.name, Phone: g.phone, Email: g.email, VIP: g.vip ? "Yes" : "No" }))),
    "Guests"
  );

  const bookingsInRange = bookings.filter((b) => !filterActive || inRange(b.check_in));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      bookingsInRange.map((b) => {
        const g = guests.find((x) => x.id === b.guest_id);
        const r = rooms.find((x) => x.id === b.room_id);
        return {
          Guest: g ? g.name : "—",
          Room: r ? r.number : "—",
          "Check-in": b.check_in,
          "Check-out": b.check_out,
          Nights: b.nights,
          Subtotal: b.subtotal,
          Discount: b.discount || 0,
          Total: b.total,
          Paid: b.paid_amount,
          Balance: b.total - b.paid_amount,
          Deposit: b.deposit || 0,
          Status: b.status,
        };
      })
    ),
    "Bookings"
  );

  const paymentsData = [];
  bookings.forEach((b) => {
    const g = guests.find((x) => x.id === b.guest_id);
    (b.payments || []).forEach((p) => {
      if (filterActive && !inRange(p.paid_on)) return;
      paymentsData.push({ Guest: g ? g.name : "—", Date: p.paid_on, Amount: p.amount, Mode: p.mode });
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paymentsData), "Payments");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(staff.map((s) => ({ Name: s.name, Role: s.role, Phone: s.phone }))), "Staff");

  const attendanceInRange = attendance.filter((a) => !filterActive || inRange(a.date));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      attendanceInRange.map((a) => {
        const s = staff.find((x) => x.id === a.staff_id);
        return { Staff: s ? s.name : "—", Date: a.date, Status: a.status };
      })
    ),
    "Attendance"
  );

  const suffix = filterActive ? `${start || "start"}_to_${end || "end"}` : `full_${todayISO()}`;
  XLSX.writeFile(wb, `MANYAWAR_HOTEL_export_${suffix}.xlsx`);
}
