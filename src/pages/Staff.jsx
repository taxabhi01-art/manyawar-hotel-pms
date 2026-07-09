import React, { useState } from "react";
import { SectionTitle, Field, Button, Modal, EmptyState, Pill, todayISO, whatsappLink, STAFF_ROLES, ATTENDANCE_STATUS } from "../components.jsx";
import { addStaff, updateStaff, deleteStaff, addTask, updateTask, deleteTask, upsertAttendance } from "../lib/api.js";

export default function Staff({ staff, rooms, tasks, attendance, reload }) {
  const [modal, setModal] = useState(null);
  const [taskFor, setTaskFor] = useState(null);
  const [attendanceModal, setAttendanceModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const saveStaff = async (form) => {
    setSaving(true);
    try {
      let result;
      if (form.id) {
        const { id, ...patch } = form;
        result = await updateStaff(id, patch);
      } else {
        result = await addStaff(form);
      }
      if (result?.error) throw result.error;
      setModal(null);
      reload();
    } catch (err) {
      alert(`Couldn't save this staff member.\n\n${err?.message || "Please check your connection and try again."}`);
    } finally {
      setSaving(false);
    }
  };

  const removeStaff = async (s) => {
    if (!confirm(`Remove ${s.name}?`)) return;
    const { error } = await deleteStaff(s.id);
    if (error) return alert(`Couldn't remove ${s.name}: ${error.message}`);
    reload();
  };

  const addNewTask = async (staffId, roomId, task) => {
    const assignedStaff = staff.find((s) => s.id === staffId);
    const room = rooms.find((r) => r.id === roomId);
    // Open the WhatsApp tab FIRST (synchronously, tied to this click) so the
    // browser doesn't block it as a popup once we `await` the save below.
    const waWindow = assignedStaff?.phone ? window.open("", "_blank") : null;

    const { error } = await addTask({ staff_id: staffId, room_id: roomId, task, done: false });
    if (error) {
      if (waWindow) waWindow.close();
      alert(`Couldn't assign this task: ${error.message}`);
      return;
    }
    if (waWindow) {
      waWindow.location.href = whatsappLink(
        assignedStaff.phone,
        `Hi ${assignedStaff.name}, you've been assigned: "${task}" for Room ${room ? room.number : ""}. Please attend when you can. — MANYAWAR HOTEL`
      );
    }
    reload();
  };

  const toggleTask = async (task) => {
    const { error } = await updateTask(task.id, { done: !task.done });
    if (error) return alert(`Couldn't update this task: ${error.message}`);
    reload();
  };
  const removeTask = async (task) => {
    const { error } = await deleteTask(task.id);
    if (error) return alert(`Couldn't remove this task: ${error.message}`);
    reload();
  };
  const claimTask = async (task, staffId, room) => {
    const assignedStaff = staff.find((s) => s.id === staffId);
    const waWindow = assignedStaff?.phone ? window.open("", "_blank") : null;
    const { error } = await updateTask(task.id, { staff_id: staffId });
    if (error) {
      if (waWindow) waWindow.close();
      alert(`Couldn't assign this task: ${error.message}`);
      return;
    }
    if (waWindow) {
      waWindow.location.href = whatsappLink(
        assignedStaff.phone,
        `Hi ${assignedStaff.name}, you've been assigned: "${task.task}" for Room ${room ? room.number : ""}. Please attend when you can. — MANYAWAR HOTEL`
      );
    }
    reload();
  };

  const saveAttendance = async (date, records) => {
    const rows = Object.entries(records)
      .filter(([, status]) => status)
      .map(([staffId, status]) => ({ staff_id: staffId, date, status }));
    if (rows.length > 0) {
      const { error } = await upsertAttendance(rows);
      if (error) return alert(`Couldn't save attendance: ${error.message}`);
    }
    setAttendanceModal(false);
    reload();
  };

  const today = todayISO();
  const todaysAttendance = attendance.filter((a) => a.date === today);
  const attendanceOf = (staffId) => todaysAttendance.find((a) => a.staff_id === staffId)?.status;
  const attendanceColor = { Present: "#5f8863", Absent: "#a6452f", "Half Day": "#c99a3c", Leave: "#46536b" };
  const unassignedTasks = tasks.filter((t) => !t.staff_id && !t.done);

  return (
    <div>
      <SectionTitle
        eyebrow="Team"
        title="Staff & tasks"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            {staff.length > 0 && (
              <Button variant="ghost" onClick={() => setAttendanceModal(true)}>
                Mark attendance
              </Button>
            )}
            <Button onClick={() => setModal("new")}>+ Add staff</Button>
          </div>
        }
      />

      {unassignedTasks.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, margin: "0 0 10px" }}>
            🧹 Housekeeping queue ({unassignedTasks.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {unassignedTasks.map((t) => {
              const room = rooms.find((r) => r.id === t.room_id);
              return (
                <div key={t.id} className="card" style={{ padding: "8px 14px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, width: 50 }}>{room ? room.number : "—"}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{t.task}</span>
                  <select
                    className="input"
                    style={{ width: 160 }}
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      claimTask(t, e.target.value, room);
                      e.target.value = "";
                    }}
                  >
                    <option value="">Assign to…</option>
                    {staff
                      .filter((s) => s.role === "Housekeeping")
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                  <button onClick={() => toggleTask(t)} className="btn btn-ghost" style={{ marginLeft: 6 }}>
                    Mark done
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {staff.length === 0 ? (
        <EmptyState text="No staff added yet." action={<Button onClick={() => setModal("new")}>Add your first team member</Button>} />
      ) : (
        staff.map((s) => {
          const myTasks = tasks.filter((t) => t.staff_id === s.id);
          const status = attendanceOf(s.id);
          return (
            <div className="card" key={s.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div className="card-col">
                  <div className="title">{s.name}</div>
                  <div className="sub">{s.phone}{s.email ? ` · ${s.email}` : ""}</div>
                </div>
                <Pill color="#b8863f">{s.role}</Pill>
                <span style={{ fontSize: 12, color: "var(--ink45)" }}>{s.shift} shift</span>
                <Pill color={status ? attendanceColor[status] : "#46536b"}>{status ? `Today: ${status}` : "Not marked"}</Pill>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  {s.phone && myTasks.filter((t) => !t.done).length > 0 && (
                    <a
                      className="btn btn-ghost"
                      href={whatsappLink(
                        s.phone,
                        `Hi ${s.name}, your pending tasks:\n${myTasks.filter((t) => !t.done).map((t) => `- ${t.task} (Room ${rooms.find((r) => r.id === t.room_id)?.number || ""})`).join("\n")}\n— MANYAWAR HOTEL`
                      )}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: "none" }}
                    >
                      WhatsApp tasks
                    </a>
                  )}
                  <Button variant="ghost" onClick={() => setTaskFor(taskFor === s.id ? null : s.id)}>
                    Tasks ({myTasks.filter((t) => !t.done).length})
                  </Button>
                  <Button variant="ghost" onClick={() => setModal(s)}>
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => removeStaff(s)}>
                    Delete
                  </Button>
                </div>
              </div>
              {taskFor === s.id && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--hairline)" }}>
                  <TaskAdder rooms={rooms} onAdd={(roomId, task) => addNewTask(s.id, roomId, task)} />
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    {myTasks.length === 0 ? (
                      <p style={{ fontSize: 12.5, color: "var(--ink45)", margin: 0 }}>No tasks assigned.</p>
                    ) : (
                      myTasks.map((t) => {
                        const room = rooms.find((r) => r.id === t.room_id);
                        return (
                          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                            <input type="checkbox" checked={t.done} onChange={() => toggleTask(t)} />
                            <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink45)", width: 50 }}>{room ? room.number : "—"}</span>
                            <span style={{ flex: 1, textDecoration: t.done ? "line-through" : "none" }}>{t.task}</span>
                            <button onClick={() => removeTask(t)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                              ✕
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
      {modal && <StaffModal member={modal === "new" ? null : modal} onClose={() => setModal(null)} onSave={saveStaff} saving={saving} />}
      {attendanceModal && (
        <AttendanceModal staff={staff} attendance={attendance} onClose={() => setAttendanceModal(false)} onSave={saveAttendance} />
      )}
    </div>
  );
}

function TaskAdder({ rooms, onAdd }) {
  const [roomId, setRoomId] = useState(rooms[0]?.id || "");
  const [task, setTask] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <select className="input" style={{ width: 120 }} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.number}
          </option>
        ))}
      </select>
      <input
        className="input"
        style={{ flex: 1, minWidth: 160 }}
        placeholder="e.g. Deep clean bathroom"
        value={task}
        onChange={(e) => setTask(e.target.value)}
      />
      <Button
        variant="ghost"
        onClick={() => {
          if (!task.trim() || !roomId) return;
          onAdd(roomId, task.trim());
          setTask("");
        }}
      >
        Assign
      </Button>
    </div>
  );
}

function StaffModal({ member, onClose, onSave, saving }) {
  const [form, setForm] = useState(member || { name: "", role: STAFF_ROLES[0], shift: "Morning", phone: "", email: "" });
  return (
    <Modal title={member ? "Edit staff member" : "Add staff member"} onClose={onClose}>
      <div className="grid-2">
        <Field label="Full name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="WhatsApp / phone number">
          <input
            className="input"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="10-digit number"
          />
        </Field>
        <Field label="Role">
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {STAFF_ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Shift">
          <select className="input" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
            {["Morning", "Evening", "Night"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <Field label="Login email (optional — only if they need app access)">
          <input
            className="input"
            type="email"
            value={form.email || ""}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Must match their Supabase login email"
          />
        </Field>
        <p style={{ fontSize: 11.5, color: "var(--ink45)", marginTop: 6 }}>
          Task assignments and updates are sent via WhatsApp to their number above — a login email is
          only needed if this staff member should be able to open the app themselves.
        </p>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={saving}
          onClick={() => {
            if (!form.name.trim()) return alert("Name is required.");
            if (!form.phone.trim()) return alert("WhatsApp/phone number is required.");
            onSave(form);
          }}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}

function AttendanceModal({ staff, attendance, onClose, onSave }) {
  const [date, setDate] = useState(todayISO());
  const [records, setRecords] = useState(() => {
    const map = {};
    attendance.filter((a) => a.date === date).forEach((a) => (map[a.staff_id] = a.status));
    return map;
  });

  return (
    <Modal title="Mark attendance" onClose={onClose} width={440}>
      <Field label="Date">
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {staff.map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, minWidth: 120 }}>{s.name}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ATTENDANCE_STATUS.map((st) => (
                <button
                  key={st}
                  onClick={() => setRecords({ ...records, [s.id]: records[s.id] === st ? "" : st })}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: "5px 10px",
                    borderRadius: 999,
                    background: records[s.id] === st ? "var(--ink)" : "transparent",
                    color: records[s.id] === st ? "var(--parchment)" : "var(--ink70)",
                    border: "1px solid var(--hairline)",
                    cursor: "pointer",
                  }}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave(date, records)}>Save attendance</Button>
      </div>
    </Modal>
  );
}
