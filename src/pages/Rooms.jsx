import React, { useState } from "react";
import { SectionTitle, Field, Button, Modal, EmptyState, currency, STATUS, ROOM_TYPES } from "../components.jsx";
import { addRoom, updateRoom, deleteRoom } from "../lib/api.js";

export default function Rooms({ rooms, bookings, reload }) {
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);

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
        action={<Button onClick={() => setModal("new")}>+ Add room</Button>}
      />
      {rooms.length === 0 ? (
        <EmptyState text="No rooms added yet." action={<Button onClick={() => setModal("new")}>Add your first room</Button>} />
      ) : (
        rooms.map((r) => (
          <div className="card" key={r.id}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 17, fontWeight: 600, width: 50 }}>{r.number}</span>
            <span style={{ fontSize: 13, color: "var(--ink70)", width: 90 }}>{r.type}</span>
            <span style={{ fontSize: 13, color: "var(--ink45)", width: 80 }}>Floor {r.floor}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, width: 90 }}>{currency(r.rate)}/night</span>
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
    </div>
  );
}

function RoomModal({ room, onClose, onSave, busy }) {
  const [form, setForm] = useState(room || { number: "", floor: 1, type: "Standard", rate: 2000, status: "available" });
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
        <Field label="Rate / night">
          <input className="input" type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} />
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
