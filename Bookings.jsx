import React, { useState, useEffect } from "react";
import { SectionTitle, Field, Button } from "../components.jsx";
import { getSettings, updateSettings } from "../lib/api.js";

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
    </div>
  );
}
