import React, { useState, useEffect } from "react";
import { SectionTitle, Field, Button } from "../components.jsx";
import { getSettings, updateSettings } from "../lib/api.js";

const PDF_TOGGLES = [
  { key: "pdf_show_gst", label: "GST breakdown (base + tax split)" },
  { key: "pdf_show_payment_trail", label: "Payment mode / payment trail (history table)" },
  { key: "pdf_show_occupancy", label: "Room-wise occupancy" },
  { key: "pdf_show_checkin_checkout_time", label: "Check-in / Check-out standard time line (12 PM / 11 AM)" },
  { key: "pdf_show_deposit", label: "Deposit / advance info" },
  { key: "pdf_show_booking_id", label: "Booking ID" },
  { key: "pdf_show_reference_id", label: "Reference ID" },
  { key: "pdf_show_bill_no", label: "Bill No." },
];

export default function Settings() {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(({ data }) => setForm(data || {}));
  }, []);

  if (!form) return <p style={{ color: "var(--ink45)" }}>Loading…</p>;

  const save = async () => {
    const { id, ...patch } = form;
    await updateSettings(patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Every toggle defaults to ON until the owner explicitly turns it off —
  // matters if the DB migration added these columns but this particular
  // settings row hasn't been saved since, so the fields could still be
  // undefined/null rather than `true`.
  const toggleOn = (key) => form[key] !== false;

  return (
    <div>
      <SectionTitle eyebrow="Owner only" title="Hotel Settings" />
      <div className="stat-card" style={{ maxWidth: 480 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Hotel name (shown on invoices)">
            <input className="input" value={form.hotel_name || ""} onChange={(e) => setForm({ ...form, hotel_name: e.target.value })} />
          </Field>
          <Field label="Address">
            <input className="input" value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className="input" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="GST number">
            <input className="input" value={form.gst_number || ""} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} placeholder="e.g. 22AAAAA0000A1Z5" />
          </Field>
          <Field label="GST % (applied to invoices)">
            <input
              className="input"
              type="number"
              value={form.gst_percent || 0}
              onChange={(e) => setForm({ ...form, gst_percent: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div style={{ marginTop: 20 }}>
          <Button onClick={save}>{saved ? "Saved ✓" : "Save settings"}</Button>
        </div>
      </div>

      <SectionTitle eyebrow="Owner only" title="Bill Numbering" />
      <div className="stat-card" style={{ maxWidth: 480 }}>
        <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: 0 }}>
          Every new booking is automatically stamped with the next bill number — set the starting point here (e.g. the first
          time you set this up, or to match your existing ledger).
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Bill number prefix">
            <input
              className="input"
              value={form.bill_no_prefix || ""}
              onChange={(e) => setForm({ ...form, bill_no_prefix: e.target.value })}
              placeholder="e.g. MH/26-27/"
            />
          </Field>
          <Field label="Next bill number">
            <input
              className="input"
              type="number"
              min={1}
              value={form.bill_no_next ?? 1}
              onChange={(e) => setForm({ ...form, bill_no_next: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div style={{ marginTop: 20 }}>
          <Button onClick={save}>{saved ? "Saved ✓" : "Save settings"}</Button>
        </div>
      </div>

      <SectionTitle eyebrow="Owner only" title="Print on Bill" />
      <div className="stat-card" style={{ maxWidth: 480 }}>
        <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: 0 }}>
          Choose what shows up on the Booking Confirmation and Tax Invoice PDFs.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {PDF_TOGGLES.map((t) => (
            <label key={t.key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={toggleOn(t.key)}
                onChange={(e) => setForm({ ...form, [t.key]: e.target.checked })}
              />
              {t.label}
            </label>
          ))}
        </div>
        <div style={{ marginTop: 20 }}>
          <Button onClick={save}>{saved ? "Saved ✓" : "Save settings"}</Button>
        </div>
      </div>
    </div>
  );
}
