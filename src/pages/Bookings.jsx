import React, { useState } from "react";
import { SectionTitle, Field, Button, Modal, EmptyState, Pill, currency, fmtDate, nightsBetween, todayISO, BOOKING_SOURCES } from "../components.jsx";
import { addBooking, updateBooking, deleteBooking, addGuest, updateRoom, addTask } from "../lib/api.js";

export default function Bookings({ rooms, guests, bookings, reload }) {
  const [modal, setModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);

  const roomOf = (id) => rooms.find((r) => r.id === id);
  const guestOf = (id) => guests.find((g) => g.id === id);
  const availableRooms = rooms.filter((r) => r.status === "available");

  const createBooking = async ({ guest, roomId, checkIn, checkOut, source, deposit }) => {
    setBusy(true);
    let guestId = guest.id;
    if (!guestId) {
      const { data } = await addGuest(guest);
      guestId = data?.id;
    }
    const room = roomOf(roomId);
    const nights = nightsBetween(checkIn, checkOut);
    const subtotal = room.rate * nights;
    await addBooking({
      guest_id: guestId,
      room_id: roomId,
      check_in: checkIn,
      check_out: checkOut,
      status: "reserved",
      rate: room.rate,
      nights,
      subtotal,
      discount: 0,
      total: subtotal,
      paid_amount: 0,
      source: source || "Walk-in",
      deposit: deposit || 0,
      deposit_refunded: false,
    });
    setBusy(false);
    setModal(null);
    reload();
  };

  const doCheckIn = async (b) => {
    const balance = b.total - b.paid_amount;
    if (balance > 0) {
      const proceed = confirm(
        `⚠ Balance due: ${currency(balance)}\n\nThis guest still owes ${currency(balance)}. Collect payment now if possible.\n\nContinue with check-in?`
      );
      if (!proceed) return;
    }
    await updateBooking(b.id, { status: "checked-in" });
    await updateRoom(b.room_id, { status: "occupied" });
    reload();
  };
  const doCheckOut = async (b) => {
    const balance = b.total - b.paid_amount;
    if (balance > 0) {
      const proceed = confirm(
        `⚠ Balance due: ${currency(balance)}\n\nThis guest still owes ${currency(balance)}. Please collect payment before they leave.\n\nContinue with check-out anyway?`
      );
      if (!proceed) return;
    }
    await updateBooking(b.id, { status: "checked-out" });
    await updateRoom(b.room_id, { status: "cleaning" });
    // Auto-queue a cleaning task — any Housekeeping staff can pick it up (see Staff tab)
    await addTask({ staff_id: null, room_id: b.room_id, task: "Clean room after checkout", done: false });
    reload();
  };
  const cancelBooking = async (b) => {
    if (!confirm("Cancel this booking?")) return;
    await deleteBooking(b.id);
    if (b.status === "checked-in") {
      await updateRoom(b.room_id, { status: "available" });
    }
    reload();
  };
  const refundDeposit = async (b) => {
    await updateBooking(b.id, { deposit_refunded: true });
    reload();
  };
  const saveDates = async (booking, { checkIn, checkOut }) => {
    const nights = nightsBetween(checkIn, checkOut);
    const subtotal = booking.rate * nights;
    const discount = Math.min(booking.discount || 0, subtotal);
    await updateBooking(booking.id, {
      check_in: checkIn,
      check_out: checkOut,
      nights,
      subtotal,
      discount,
      total: subtotal - discount,
    });
    setEditModal(null);
    reload();
  };

  const visible = bookings.filter((b) => filter === "all" || b.status === filter);

  return (
    <div>
      <SectionTitle
        eyebrow="Reservations"
        title="Bookings"
        action={
          <Button disabled={availableRooms.length === 0} onClick={() => setModal(true)}>
            + New booking
          </Button>
        }
      />
      {availableRooms.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: -10, marginBottom: 16 }}>
          No rooms are currently available.
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["all", "reserved", "checked-in", "checked-out"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="btn-ghost"
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: 999,
              background: filter === f ? "var(--ink)" : "transparent",
              color: filter === f ? "var(--parchment)" : "var(--ink70)",
              border: "1px solid var(--hairline)",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState text="No bookings match this view." />
      ) : (
        visible.map((b) => {
          const g = guestOf(b.guest_id);
          const r = roomOf(b.room_id);
          return (
            <div className="card" key={b.id}>
              <div className="card-col">
                <div className="title">
                  {g ? g.name : "Guest removed"} {g?.vip && "⭐"}
                </div>
                <div className="sub">{g ? g.phone : ""}</div>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, width: 60 }}>{r ? r.number : "—"}</span>
              <span style={{ fontSize: 13, color: "var(--ink70)", width: 190 }}>
                {fmtDate(b.check_in)} → {fmtDate(b.check_out)}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, width: 90 }}>{currency(b.total)}</span>
              {b.deposit > 0 && (
                <span style={{ fontSize: 11.5, color: b.deposit_refunded ? "var(--ink45)" : "var(--brass)" }}>
                  Deposit {currency(b.deposit)}
                  {b.deposit_refunded ? " (refunded)" : ""}
                </span>
              )}
              <Pill color={b.status === "reserved" ? "#c99a3c" : b.status === "checked-in" ? "#5f8863" : "#46536b"}>{b.status}</Pill>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {b.status !== "checked-out" && (
                  <Button variant="ghost" onClick={() => setEditModal(b)}>
                    Edit dates
                  </Button>
                )}
                {b.status === "checked-out" && b.deposit > 0 && !b.deposit_refunded && (
                  <Button variant="ghost" onClick={() => refundDeposit(b)}>
                    Refund deposit
                  </Button>
                )}
                {b.status === "reserved" && <Button onClick={() => doCheckIn(b)}>Check in</Button>}
                {b.status === "checked-in" && (
                  <Button variant="dark" onClick={() => doCheckOut(b)}>
                    Check out
                  </Button>
                )}
                {b.status !== "checked-out" && (
                  <Button variant="danger" onClick={() => cancelBooking(b)}>
                    ✕
                  </Button>
                )}
              </div>
            </div>
          );
        })
      )}

      {modal && (
        <BookingModal rooms={availableRooms} guests={guests} onClose={() => setModal(null)} onCreate={createBooking} busy={busy} />
      )}
      {editModal && (
        <EditDatesModal booking={editModal} onClose={() => setEditModal(null)} onSave={(d) => saveDates(editModal, d)} />
      )}
    </div>
  );
}

function BookingModal({ rooms, guests, onClose, onCreate, busy }) {
  const [guestMode, setGuestMode] = useState(guests.length ? "existing" : "new");
  const [existingId, setExistingId] = useState(guests[0]?.id || "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [roomId, setRoomId] = useState(rooms[0]?.id || "");
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(todayISO());
  const [source, setSource] = useState(BOOKING_SOURCES[0]);
  const [deposit, setDeposit] = useState(0);

  const submit = () => {
    if (!roomId) return alert("Add a room first.");
    if (checkOut <= checkIn) return alert("Check-out must be after check-in.");
    let guest;
    if (guestMode === "existing") {
      guest = guests.find((g) => g.id === existingId);
      if (!guest) return alert("Select a guest.");
    } else {
      if (!name.trim()) return alert("Guest name is required.");
      guest = { name: name.trim(), phone: phone.trim(), email: email.trim() };
    }
    onCreate({ guest, roomId, checkIn, checkOut, source, deposit: Number(deposit) || 0 });
  };

  return (
    <Modal title="New booking" onClose={onClose} width={520}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Button variant={guestMode === "existing" ? "primary" : "ghost"} onClick={() => setGuestMode("existing")}>
          Existing guest
        </Button>
        <Button variant={guestMode === "new" ? "primary" : "ghost"} onClick={() => setGuestMode("new")}>
          New guest
        </Button>
      </div>
      {guestMode === "existing" ? (
        guests.length === 0 ? (
          <p style={{ fontSize: 13 }}>No guests yet — switch to "New guest".</p>
        ) : (
          <Field label="Guest">
            <select className="input" value={existingId} onChange={(e) => setExistingId(e.target.value)}>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        )
      ) : (
        <div className="grid-2">
          <Field label="Full name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Email">
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
      )}
      <div className="grid-3" style={{ marginTop: 14 }}>
        <Field label="Room">
          <select className="input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.number} · {r.type}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Check-in">
          <input className="input" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </Field>
        <Field label="Check-out">
          <input className="input" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </Field>
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <Field label="Booking source">
          <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
            {BOOKING_SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Advance / deposit">
          <input className="input" type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        </Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy} onClick={submit}>
          Create booking
        </Button>
      </div>
    </Modal>
  );
}

function EditDatesModal({ booking, onClose, onSave }) {
  const [checkIn, setCheckIn] = useState(booking.check_in);
  const [checkOut, setCheckOut] = useState(booking.check_out);
  const nights = nightsBetween(checkIn, checkOut);
  const newTotal = Math.max(0, booking.rate * nights - (booking.discount || 0));
  return (
    <Modal title="Edit stay dates" onClose={onClose} width={400}>
      <div className="grid-2">
        <Field label="Check-in">
          <input className="input" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </Field>
        <Field label="Check-out">
          <input className="input" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </Field>
      </div>
      <p style={{ fontSize: 13, marginTop: 14 }}>
        {nights} nights · New total: <strong>{currency(newTotal)}</strong>
      </p>
      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (checkOut <= checkIn) return alert("Check-out must be after check-in.");
            onSave({ checkIn, checkOut });
          }}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}
