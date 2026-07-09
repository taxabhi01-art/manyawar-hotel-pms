import React, { useState } from "react";
import { SectionTitle, Field, Button, Modal, EmptyState, Pill } from "../components.jsx";
import { addGuest, updateGuest, deleteGuest, getIdProofSignedUrl } from "../lib/api.js";

export default function Guests({ guests, bookings, reload }) {
  const [modal, setModal] = useState(null);
  const [idModal, setIdModal] = useState(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const saveGuest = async (form) => {
    setBusy(true);
    if (form.id) {
      const { id, ...patch } = form;
      await updateGuest(id, patch);
    } else {
      await addGuest(form);
    }
    setBusy(false);
    setModal(null);
    reload();
  };

  const removeGuest = async (guest) => {
    if (bookings.some((b) => b.guest_id === guest.id)) {
      return alert("This guest has bookings on record and can't be removed.");
    }
    if (!confirm(`Delete ${guest.name}?`)) return;
    await deleteGuest(guest.id);
    reload();
  };

  const toggleVip = async (guest) => {
    await updateGuest(guest.id, { vip: !guest.vip });
    reload();
  };

  const viewId = async (guest) => {
    if (!guest.id_proof_image_path) return;
    const { data } = await getIdProofSignedUrl(guest.id_proof_image_path);
    if (data) setIdModal({ name: guest.name, url: data.signedUrl });
  };

  const filtered = guests.filter((g) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return g.name?.toLowerCase().includes(q) || (g.phone || "").includes(q) || (g.email || "").toLowerCase().includes(q);
  });

  return (
    <div>
      <SectionTitle eyebrow="Directory" title="Guests" action={<Button onClick={() => setModal("new")}>+ Add guest</Button>} />
      {guests.length > 0 && (
        <input
          className="input"
          style={{ marginBottom: 14 }}
          placeholder="Search by name, phone, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      {filtered.length === 0 ? (
        <EmptyState text={guests.length === 0 ? "No guests yet." : "No guests match your search."} />
      ) : (
        filtered.map((g) => {
          const stays = bookings.filter((b) => b.guest_id === g.id).length;
          return (
            <div className="card" key={g.id}>
              <div className="card-col">
                <div className="title">
                  {g.name} {g.vip && "⭐"}
                </div>
                <div className="sub">{g.phone || "No phone on file"}</div>
              </div>
              <span style={{ fontSize: 13, color: "var(--ink70)" }}>{g.email || "—"}</span>
              <span style={{ fontSize: 12, color: "var(--ink45)" }}>
                {stays} stay{stays === 1 ? "" : "s"}
              </span>
              {stays > 1 && <Pill color="#5f8863">Repeat guest</Pill>}
              {g.id_proof_image_path ? (
                <Pill color="#5f8863">ID on file</Pill>
              ) : (
                <Pill color="#a6452f">No ID scan</Pill>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {g.id_proof_image_path && (
                  <Button variant="ghost" onClick={() => viewId(g)}>
                    View ID
                  </Button>
                )}
                <Button variant="ghost" onClick={() => toggleVip(g)}>
                  {g.vip ? "Remove VIP" : "Mark VIP"}
                </Button>
                <Button variant="ghost" onClick={() => setModal(g)}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => removeGuest(g)}>
                  Delete
                </Button>
              </div>
            </div>
          );
        })
      )}
      {modal && <GuestModal guest={modal === "new" ? null : modal} onClose={() => setModal(null)} onSave={saveGuest} busy={busy} />}
      {idModal && (
        <Modal title={`${idModal.name} — ID proof`} onClose={() => setIdModal(null)} width={420}>
          <img src={idModal.url} alt="ID proof" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--hairline)" }} />
        </Modal>
      )}
    </div>
  );
}

function GuestModal({ guest, onClose, onSave, busy }) {
  const [form, setForm] = useState(guest || { name: "", phone: "", email: "", id_proof: "", vip: false });
  return (
    <Modal title={guest ? "Edit guest" : "Add guest"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Full name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Email">
          <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="ID proof number (optional)">
          <input className="input" value={form.id_proof || ""} onChange={(e) => setForm({ ...form, id_proof: e.target.value })} />
        </Field>
        <p style={{ fontSize: 11.5, color: "var(--ink45)", margin: 0 }}>
          The scanned ID photo is captured at check-in, not here — go to Bookings → Check in.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={!!form.vip} onChange={(e) => setForm({ ...form, vip: e.target.checked })} />
          Mark as VIP guest
        </label>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            if (!form.name.trim()) return alert("Name is required.");
            onSave(form);
          }}
        >
          Save guest
        </Button>
      </div>
    </Modal>
  );
}
