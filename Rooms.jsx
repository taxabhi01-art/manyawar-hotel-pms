import React, { useState } from "react";
import { SectionTitle, Field, Button, Modal, EmptyState, Pill, fmtDateTime, whatsappLink, MAINTENANCE_PRIORITIES } from "../components.jsx";
import { addMaintenanceTicket, updateMaintenanceTicket, deleteMaintenanceTicket, logActivity } from "../lib/api.js";

const PRIORITY_COLOR = { Low: "#46536b", Medium: "#c99a3c", High: "#a6452f", Urgent: "#7a1f0f" };
const STATUS_COLOR = { Open: "#a6452f", "In Progress": "#c99a3c", Resolved: "#5f8863" };

export default function Maintenance({ tickets, rooms, staff, reload }) {
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState("open"); // open | all

  const saveTicket = async (form) => {
    const { id, ...patch } = form;
    if (id) {
      const { error } = await updateMaintenanceTicket(id, patch);
      if (error) return alert(`Couldn't save this ticket: ${error.message}`);
    } else {
      const { error } = await addMaintenanceTicket(patch);
      if (error) return alert(`Couldn't create this ticket: ${error.message}`);
      const room = rooms.find((r) => r.id === patch.room_id);
      const where = room ? `Room ${room.number}` : patch.area_name;
      logActivity("Maintenance ticket created", `${where} — ${patch.issue} (${patch.priority})`);
    }
    setModal(null);
    reload();
  };

  const setStatus = async (ticket, status) => {
    const patch = { status };
    if (status === "Resolved") patch.resolved_at = new Date().toISOString();
    const { error } = await updateMaintenanceTicket(ticket.id, patch);
    if (error) return alert(`Couldn't update this ticket: ${error.message}`);
    if (status === "Resolved") {
      const room = rooms.find((r) => r.id === ticket.room_id);
      logActivity("Maintenance ticket resolved", `Room ${room ? room.number : "—"} — ${ticket.issue}`);
    }
    reload();
  };

  const assignStaffMember = async (ticket, staffId) => {
    const assignedStaff = staff.find((s) => s.id === staffId);
    const room = rooms.find((r) => r.id === ticket.room_id);
    const waWindow = assignedStaff?.phone ? window.open("", "_blank") : null;
    const { error } = await updateMaintenanceTicket(ticket.id, { assigned_staff_id: staffId });
    if (error) {
      if (waWindow) waWindow.close();
      return alert(`Couldn't assign this ticket: ${error.message}`);
    }
    if (waWindow) {
      waWindow.location.href = whatsappLink(
        assignedStaff.phone,
        `Hi ${assignedStaff.name}, maintenance ticket assigned: "${ticket.issue}" for ${room ? `Room ${room.number}` : ticket.area_name || "a common area"} (Priority: ${ticket.priority}). — MANYAWAR HOTEL`
      );
    }
    reload();
  };

  const removeTicket = async (ticket) => {
    if (!confirm("Delete this ticket?")) return;
    const { error } = await deleteMaintenanceTicket(ticket.id);
    if (error) return alert(`Couldn't delete this ticket: ${error.message}`);
    reload();
  };

  const visible = filter === "open" ? tickets.filter((t) => t.status !== "Resolved") : tickets;

  return (
    <div>
      <SectionTitle
        eyebrow="Repairs"
        title="Maintenance tickets"
        action={<Button onClick={() => setModal("new")}>+ New ticket</Button>}
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["open", "all"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 999, cursor: "pointer",
              background: filter === f ? "var(--ink)" : "transparent",
              color: filter === f ? "var(--parchment)" : "var(--ink70)",
              border: "1px solid var(--hairline)", textTransform: "capitalize",
            }}
          >
            {f === "open" ? "Open & In Progress" : "All"}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState text="No maintenance tickets." action={<Button onClick={() => setModal("new")}>Report an issue</Button>} />
      ) : (
        visible.map((t) => {
          const room = rooms.find((r) => r.id === t.room_id);
          const assigned = staff.find((s) => s.id === t.assigned_staff_id);
          return (
            <div className="card" key={t.id} style={{ flexDirection: "column", alignItems: "stretch", ...(t.reported_by === "Guest (QR)" ? { borderColor: "var(--brass)", background: "#fff8ea" } : {}) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, width: 50 }}>{room ? room.number : "—"}</span>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {t.issue}
                    <span style={{ fontWeight: 400, color: "var(--ink45)" }}> — {room ? `Room ${room.number}` : t.area_name || "Common area"}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink45)" }}>
                    Reported {fmtDateTime(t.created_at)}
                    {t.reported_by === "Guest (QR)" ? " by guest (QR scan) 📱" : t.reported_by ? ` by ${t.reported_by}` : ""}
                  </div>
                </div>
                <Pill color={PRIORITY_COLOR[t.priority] || "#46536b"}>{t.priority}</Pill>
                <Pill color={STATUS_COLOR[t.status] || "#46536b"}>{t.status}</Pill>
                {assigned && <span style={{ fontSize: 12, color: "var(--ink45)" }}>→ {assigned.name}</span>}
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--hairline)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  className="input"
                  style={{ width: 160 }}
                  defaultValue=""
                  onChange={(e) => e.target.value && assignStaffMember(t, e.target.value)}
                >
                  <option value="">Assign to…</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {t.status !== "In Progress" && t.status !== "Resolved" && (
                  <Button variant="ghost" onClick={() => setStatus(t, "In Progress")}>
                    Mark in progress
                  </Button>
                )}
                {t.status !== "Resolved" && (
                  <Button variant="ghost" onClick={() => setStatus(t, "Resolved")}>
                    Mark resolved
                  </Button>
                )}
                <Button variant="danger" onClick={() => removeTicket(t)}>
                  Delete
                </Button>
              </div>
            </div>
          );
        })
      )}

      {modal && <TicketModal ticket={modal === "new" ? null : modal} rooms={rooms} onClose={() => setModal(null)} onSave={saveTicket} />}
    </div>
  );
}

const COMMON_AREAS = ["Lobby", "Reception", "Corridor / Stairs", "Parking", "Garden / Lawn", "Restaurant", "Kitchen", "Terrace", "Elevator", "Generator/Electrical room", "Other"];

function TicketModal({ ticket, rooms, onClose, onSave }) {
  const [locationType, setLocationType] = useState(ticket ? (ticket.room_id ? "room" : "area") : "room");
  const [form, setForm] = useState(
    ticket || { room_id: rooms[0]?.id || "", area_name: "", issue: "", priority: "Medium", status: "Open" }
  );
  return (
    <Modal title={ticket ? "Edit ticket" : "New maintenance ticket"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant={locationType === "room" ? "primary" : "ghost"} onClick={() => setLocationType("room")}>
            Room
          </Button>
          <Button variant={locationType === "area" ? "primary" : "ghost"} onClick={() => setLocationType("area")}>
            Common area
          </Button>
        </div>
        {locationType === "room" ? (
          <Field label="Room">
            <select className="input" value={form.room_id || ""} onChange={(e) => setForm({ ...form, room_id: e.target.value, area_name: "" })}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.number}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Common area">
            <select className="input" value={form.area_name || ""} onChange={(e) => setForm({ ...form, area_name: e.target.value, room_id: null })}>
              <option value="">Select…</option>
              {COMMON_AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Issue">
          <input className="input" value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} placeholder="e.g. AC not cooling" />
        </Field>
        <Field label="Priority">
          <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {MAINTENANCE_PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (locationType === "room" && !form.room_id) return alert("Select a room.");
            if (locationType === "area" && !form.area_name) return alert("Select a common area.");
            if (!form.issue.trim()) return alert("Describe the issue.");
            onSave(form);
          }}
        >
          Save ticket
        </Button>
      </div>
    </Modal>
  );
}
