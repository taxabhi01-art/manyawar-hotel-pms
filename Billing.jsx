import React, { useState } from "react";
import * as XLSX from "xlsx";
import { SectionTitle, Button, fmtDateTime, todayISO } from "../components.jsx";

// Owner-only safety net: download a full snapshot of everything in the
// system as an Excel workbook (one sheet per table) — useful for offline
// backup, accountant handoff, or migrating away someday.
export default function Backup({ data }) {
  const [downloading, setDownloading] = useState(false);

  const sheets = [
    { name: "Rooms", rows: data.rooms },
    { name: "Guests", rows: data.guests.map(({ id_proof_front_path, id_proof_back_path, ...g }) => g) },
    { name: "Bookings", rows: data.bookings.map(({ payments, ...b }) => b) },
    { name: "Payments", rows: data.bookings.flatMap((b) => (b.payments || []).map((p) => ({ ...p, guest_booking_id: b.id }))) },
    { name: "Staff", rows: data.staff },
    { name: "Tasks", rows: data.tasks },
    { name: "Attendance", rows: data.attendance },
    { name: "Expenses", rows: data.expenses },
    { name: "Inventory Items", rows: data.inventoryItems },
    { name: "Inventory Usage", rows: data.inventoryUsage },
    { name: "Maintenance Tickets", rows: data.maintenanceTickets },
    { name: "Night Audits", rows: data.nightAudits.map(({ details, ...a }) => a) },
  ];

  const downloadBackup = () => {
    setDownloading(true);
    try {
      const wb = XLSX.utils.book_new();
      sheets.forEach(({ name, rows }) => {
        const sheet = XLSX.utils.json_to_sheet(rows && rows.length ? rows : [{ note: "No data" }]);
        XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
      });
      XLSX.writeFile(wb, `manyawar-hotel-backup-${todayISO()}.xlsx`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <SectionTitle eyebrow="Owner only" title="Data backup" action={<Button disabled={downloading} onClick={downloadBackup}>{downloading ? "Preparing…" : "Download full backup"}</Button>} />
      <p style={{ fontSize: 13, color: "var(--ink45)", maxWidth: 520 }}>
        Downloads everything — rooms, guests, bookings, payments, staff, expenses, inventory,
        maintenance tickets, and night audits — as one Excel file, one sheet per table. Guest ID
        photos themselves aren't included (they live in Supabase Storage); everything else is.
      </p>
      <div style={{ marginTop: 20, background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: 16, maxWidth: 480 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>What's included</div>
        {sheets.map((s) => (
          <div key={s.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0", color: "var(--ink70)" }}>
            <span>{s.name}</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{(s.rows || []).length} rows</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: "var(--ink45)", marginTop: 16, maxWidth: 480 }}>
        Tip: download a backup regularly (e.g. monthly) and save it somewhere safe — Google Drive, a
        USB drive, or email it to yourself. This isn't automatic; it only runs when you click the button.
      </p>
    </div>
  );
}
