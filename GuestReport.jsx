import React, { useState, useEffect } from "react";
import { SectionTitle, Field, Button, Modal, EmptyState, currency, STATUS, ROOM_TYPES } from "../components.jsx";
import { addRoom, updateRoom, deleteRoom } from "../lib/api.js";

export default function Rooms({ rooms, bookings, highlightId, reload }) {
  const [modal, setModal] = useState(null);
  const [qrModal, setQrModal] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`room-${highlightId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const saveRoom = async (form) => {
    setBusy(true);
    if (form.id) {
      const { id, ...patch } = form;
      await updateRoom(id, patch);
    } else {
      await addRoom(form);
    }
    setBusy(false);
    setModal(null);
    reload();
  };

  const removeRoom = async (room) => {
    const inUse = bookings.some((b) => b.room_id === room.id && b.status !== "checked-out");
    if (inUse) return alert("This room has an active booking and can't be removed.");
    if (!confirm(`Delete room ${room.number}?`)) return;
    await deleteRoom(room.id);
    reload();
  };

  const setStatus = async (room, status) => {
    await updateRoom(room.id, { status });
    reload();
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Inventory"
        title="Rooms"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={() => setQrModal(true)}>
              🏷 Print QR codes
            </Button>
            <Button onClick={() => setModal("new")}>+ Add room</Button>
          </div>
        }
      />
      {rooms.length === 0 ? (
        <EmptyState text="No rooms added yet." action={<Button onClick={() => setModal("new")}>Add your first room</Button>} />
      ) : (
        rooms.map((r) => (
          <div className="card" key={r.id} id={`room-${r.id}`} style={r.id === highlightId ? { outline: "2px solid var(--brass)", background: "#fff8ea" } : undefined}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 17, fontWeight: 600, width: 50 }}>{r.number}</span>
            <span style={{ fontSize: 13, color: "var(--ink70)", width: 90 }}>{r.type}</span>
            <span style={{ fontSize: 13, color: "var(--ink45)", width: 70 }}>Floor {r.floor}</span>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink70)", width: 190, lineHeight: 1.5 }}>
              <div>1 guest: {currency(r.rate_single ?? r.rate)}</div>
              <div>2 guests: {currency(r.rate_double ?? r.rate)} · +{currency(r.rate_extra_person || 0)}/extra</div>
            </div>
            <select className="input" style={{ width: 150 }} value={r.status} onChange={(e) => setStatus(r, e.target.value)}>
              {Object.entries(STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <Button variant="ghost" onClick={() => setModal(r)}>
                Edit
              </Button>
              <Button variant="danger" onClick={() => removeRoom(r)}>
                Delete
              </Button>
            </div>
          </div>
        ))
      )}
      {modal && <RoomModal room={modal === "new" ? null : modal} onClose={() => setModal(null)} onSave={saveRoom} busy={busy} />}
      {qrModal && <QrCodesModal rooms={rooms} onClose={() => setQrModal(false)} />}
    </div>
  );
}

function QrCodesModal({ rooms, onClose }) {
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  return (
    <Modal title="Room QR codes — guests scan to report issues" onClose={onClose} width={720}>
      <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: -6, marginBottom: 16 }}>
        Print these and stick one in each room. Guests scan with their phone camera — no app or login
        needed — and their issue goes straight into Maintenance with a notification to staff.
      </p>
      <div id="qr-print-area" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {rooms.map((r) => {
          const reportUrl = `${baseUrl}?report=${encodeURIComponent(r.number)}`;
          const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(reportUrl)}`;
          return (
            <div key={r.id} style={{ textAlign: "center", border: "1px solid var(--hairline)", borderRadius: 8, padding: 12 }}>
              <img src={qrImg} alt={`QR for Room ${r.number}`} style={{ width: "100%", maxWidth: 160 }} />
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15, marginTop: 6 }}>Room {r.number}</div>
              <div style={{ fontSize: 10.5, color: "var(--ink45)" }}>Scan to report an issue</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button
          onClick={() => {
            const printContents = document.getElementById("qr-print-area").outerHTML;
            const w = window.open("", "_blank");
            w.document.write(`<html><head><title>Room QR Codes</title></head><body>${printContents}</body></html>`);
            w.document.close();
            w.focus();
            setTimeout(() => w.print(), 300);
          }}
        >
          Print all
        </Button>
      </div>
    </Modal>
  );
}

function RoomModal({ room, onClose, onSave, busy }) {
  const [form, setForm] = useState(
    room || {
      number: "",
      floor: 1,
      type: "Standard",
      rate: 2000,
      rate_single: 2000,
      rate_double: 2600,
      rate_extra_person: 500,
      status: "available",
    }
  );
  return (
    <Modal title={room ? "Edit room" : "Add room"} onClose={onClose}>
      <div className="grid-2">
        <Field label="Room number">
          <input className="input" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
        </Field>
        <Field label="Floor">
          <input className="input" type="number" value={form.floor} onChange={(e) => setForm({ ...form, floor: Number(e.target.value) })} />
        </Field>
        <Field label="Type">
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {ROOM_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
      </div>

      <p style={{ fontSize: 12, color: "var(--ink45)", marginTop: 16, marginBottom: 6 }}>
        Occupancy-based tariff — the rate used at booking time depends on how many guests are staying.
      </p>
      <div className="grid-3">
        <Field label="Rate for 1 guest">
          <input
            className="input"
            type="number"
            value={form.rate_single ?? form.rate ?? 0}
            onChange={(e) => setForm({ ...form, rate_single: Number(e.target.value), rate: Number(e.target.value) })}
          />
        </Field>
        <Field label="Rate for 2 guests">
          <input
            className="input"
            type="number"
            value={form.rate_double ?? form.rate ?? 0}
            onChange={(e) => setForm({ ...form, rate_double: Number(e.target.value) })}
          />
        </Field>
        <Field label="Per extra guest (3rd+)">
          <input
            className="input"
            type="number"
            value={form.rate_extra_person ?? 0}
            onChange={(e) => setForm({ ...form, rate_extra_person: Number(e.target.value) })}
          />
        </Field>
      </div>

      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            if (!form.number.trim()) return alert("Room number is required.");
            onSave(form);
          }}
        >
          Save room
        </Button>
      </div>
    </Modal>
  );
}
