import React, { useState, useMemo, useEffect } from "react";
import {
  SectionTitle,
  Field,
  Button,
  Modal,
  EmptyState,
  Pill,
  IdCaptureField,
  currency,
  fmtDate,
  fmtDateTime,
  nightsBetween,
  todayISO,
  isRoomAvailableForDates,
  computeRoomRate,
  computeBookingTotal,
  isEarlyCheckin,
  isLateCheckout,
  whatsappLink,
  BOOKING_SOURCES,
  PAYMENT_MODES,
  BOOKING_STATUS_COLORS,
} from "../components.jsx";
import {
  addBooking,
  updateBooking,
  updateRoom,
  addGuest,
  updateGuest,
  addCoGuest,
  updateCoGuest,
  uploadIdProof,
  getIdProofSignedUrl,
  logActivity,
} from "../lib/api.js";

export default function Bookings({ rooms, guests, bookings, coGuests, maintenanceTickets, highlightId, onOpenCheckIn, onOpenCheckOut, reload }) {
  const [modal, setModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [confirmSendModal, setConfirmSendModal] = useState(null);
  const [cancelModal, setCancelModal] = useState(null);
  const [changeRoomModal, setChangeRoomModal] = useState(null);
  const [filter, setFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`booking-${highlightId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const roomOf = (id) => rooms.find((r) => r.id === id);
  const guestOf = (id) => guests.find((g) => g.id === id);
  const bookableRooms = rooms.filter((r) => r.status !== "maintenance");

  const createBooking = async ({ guest, roomId, checkIn, checkOut, source, deposit, depositMode, coGuestsCount, bookingRef, bookedOn }) => {
    setBusy(true);
    let guestId = guest.id;
    let fullGuest = guest;
    if (!guestId) {
      const { data } = await addGuest(guest);
      guestId = data?.id;
      fullGuest = data;
    }
    const room = roomOf(roomId);
    const nights = nightsBetween(checkIn, checkOut);
    const occupancy = 1 + (coGuestsCount || 0);
    const rate = computeRoomRate(room, occupancy);
    const subtotal = rate * nights;
    await addBooking({
      guest_id: guestId,
      room_id: roomId,
      check_in: checkIn,
      check_out: checkOut,
      status: "reserved",
      rate,
      nights,
      subtotal,
      discount: 0,
      total: subtotal,
      paid_amount: 0,
      source: source || "Walk-in",
      deposit: deposit || 0,
      deposit_mode: deposit > 0 ? depositMode || "Cash" : null,
      deposit_refunded: false,
      co_guests_count: coGuestsCount || 0,
      booking_ref: bookingRef || null,
      created_at: bookedOn ? new Date(bookedOn + "T12:00:00").toISOString() : undefined,
    });
    setBusy(false);
    setModal(null);
    reload();
    if (fullGuest?.phone) {
      setConfirmSendModal({ guest: fullGuest, room, checkIn, checkOut, total: subtotal });
    }
  };

  const cancelBooking = async (b, reason) => {
    await updateBooking(b.id, { status: "cancelled", cancel_reason: reason || null });
    if (b.status === "checked-in") {
      await updateRoom(b.room_id, { status: "available" });
    }
    const g = guestOf(b.guest_id);
    const r = roomOf(b.room_id);
    logActivity("Booking cancelled", `${g ? g.name : "Guest"} — Room ${r ? r.number : "—"}${reason ? ` (${reason})` : ""}`);
    reload();
  };

  // Room changes after check-in — e.g. maintenance issue, guest request. Moves
  // the booking to a new room, frees the old one, and optionally re-prices to
  // the new room's tariff (kept as-is by default so the agreed price sticks).
  const changeRoom = async ({ booking, newRoomId, updateRate }) => {
    const oldRoom = roomOf(booking.room_id);
    const newRoom = roomOf(newRoomId);
    const patch = { room_id: newRoomId };
    if (updateRate && newRoom) {
      const occupancy = 1 + (booking.co_guests_count || 0);
      const newRate = computeRoomRate(newRoom, occupancy);
      const newSubtotal = newRate * booking.nights;
      patch.rate = newRate;
      patch.subtotal = newSubtotal;
      patch.total = computeBookingTotal({ ...booking, subtotal: newSubtotal });
    }
    await updateBooking(booking.id, patch);
    await updateRoom(booking.room_id, { status: "cleaning" });
    await updateRoom(newRoomId, { status: "occupied" });
    const g = guestOf(booking.guest_id);
    logActivity("Room changed", `${g ? g.name : "Guest"}: Room ${oldRoom ? oldRoom.number : "—"} → ${newRoom ? newRoom.number : "—"}`);
    setChangeRoomModal(null);
    reload();
  };
  const saveBookingEdit = async (booking, { checkIn, checkOut, source, coGuestsCount, bookingRef, room }) => {
    const nights = nightsBetween(checkIn, checkOut);
    const occupancy = 1 + (Number(coGuestsCount) || 0);
    const rate = room ? computeRoomRate(room, occupancy) : booking.rate;
    const subtotal = rate * nights;
    const discount = Math.min(booking.discount || 0, subtotal);
    const total = computeBookingTotal({ ...booking, subtotal, discount });
    await updateBooking(booking.id, {
      check_in: checkIn,
      check_out: checkOut,
      nights,
      rate,
      subtotal,
      discount,
      total,
      source,
      co_guests_count: Number(coGuestsCount) || 0,
      booking_ref: bookingRef.trim() || null,
    });
    logActivity("Booking edited", `${guestOf(booking.guest_id)?.name || "Guest"} — Room ${roomOf(booking.room_id)?.number || "—"}`);
    setEditModal(null);
    reload();
  };

  const visible = bookings.filter((b) => {
    if (filter !== "all" && b.status !== filter) return false;
    if (dateFrom && b.check_in < dateFrom) return false;
    if (dateTo && b.check_in > dateTo) return false;
    return true;
  });

  return (
    <div>
      <SectionTitle
        eyebrow="Reservations"
        title="Bookings"
        action={
          <Button disabled={bookableRooms.length === 0} onClick={() => setModal(true)}>
            + New booking
          </Button>
        }
      />
      {bookableRooms.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: -10, marginBottom: 16 }}>
          No rooms available to book — all rooms are under maintenance.
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {["all", "reserved", "checked-in", "checked-out", "cancelled", "no-show"].map((f) => (
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
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="From (check-in date)">
          <input className="input" type="date" style={{ width: 160 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input className="input" type="date" style={{ width: 160 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" onClick={() => { setDateFrom(""); setDateTo(""); }}>
            Clear dates
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState text="No bookings match this view." />
      ) : (
        visible.map((b) => {
          const g = guestOf(b.guest_id);
          const r = roomOf(b.room_id);
          return (
            <div className="card" key={b.id} id={`booking-${b.id}`} style={b.id === highlightId ? { outline: "2px solid var(--brass)", background: "#fff8ea" } : undefined}>
              <div className="card-col">
                <div className="title">
                  {g ? g.name : "Guest removed"} {g?.vip && "⭐"}
                </div>
                <div className="sub">{g ? g.phone : ""}</div>
                {b.booking_ref && (
                  <div style={{ fontSize: 10.5, color: "var(--brass)", fontFamily: "var(--font-mono)" }}>Ref: {b.booking_ref}</div>
                )}
                {b.created_at && (
                  <div style={{ fontSize: 10.5, color: "var(--ink45)" }}>Booked on {fmtDate(b.created_at.slice(0, 10))}</div>
                )}
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, width: 60 }}>{r ? r.number : "—"}</span>
              <span style={{ fontSize: 13, color: "var(--ink70)", width: 190 }}>
                {fmtDate(b.check_in)} → {fmtDate(b.check_out)}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, width: 90 }}>{currency(b.total)}</span>
              <span style={{ fontSize: 11.5, color: "var(--ink45)" }}>
                {1 + (b.co_guests_count || 0)} guest{b.co_guests_count ? "s" : ""}
              </span>
              {(b.checked_in_at || b.checked_out_at) && (
                <div style={{ fontSize: 10.5, color: "var(--ink45)" }}>
                  {b.checked_in_at && <>In: {fmtDateTime(b.checked_in_at)} </>}
                  {b.checked_out_at && <>· Out: {fmtDateTime(b.checked_out_at)}</>}
                </div>
              )}
              {b.deposit > 0 && (
                <span style={{ fontSize: 11.5, color: (b.deposit_status || "held") === "held" ? "var(--brass)" : "var(--ink45)" }}>
                  Deposit {currency(b.deposit)} via {b.deposit_mode || "Cash"} ({b.deposit_status || "held"})
                </span>
              )}
              {b.items_total > 0 && (
                <span style={{ fontSize: 11.5, color: "var(--brass)" }}>+{currency(b.items_total)} items</span>
              )}
              {b.early_checkin && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "var(--brass)", borderRadius: 999, padding: "2px 9px" }}>
                  ⚡ Early check-in {b.early_checkin_fee > 0 ? `(+${currency(b.early_checkin_fee)})` : ""}
                </span>
              )}
              {b.late_checkout && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "var(--rust)", borderRadius: 999, padding: "2px 9px" }}>
                  ⏰ Late checkout {b.late_checkout_fee > 0 ? `(+${currency(b.late_checkout_fee)})` : ""}
                </span>
              )}
              <Pill color={BOOKING_STATUS_COLORS[b.status] || "#46536b"}>{b.status}</Pill>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Button variant="ghost" onClick={() => setDetailModal(b)}>
                  Guest details
                </Button>
                {b.status !== "checked-out" && b.status !== "cancelled" && b.status !== "no-show" && (
                  <Button variant="ghost" onClick={() => setEditModal(b)}>
                    Edit booking
                  </Button>
                )}
                {b.status === "reserved" && <Button onClick={() => onOpenCheckIn(b)}>Check in</Button>}
                {b.status === "checked-in" && (
                  <Button variant="ghost" onClick={() => setChangeRoomModal(b)}>
                    Change room
                  </Button>
                )}
                {b.status === "checked-in" && (
                  <Button variant="dark" onClick={() => onOpenCheckOut(b)}>
                    Check out
                  </Button>
                )}
                {(b.status === "reserved" || b.status === "checked-in") && (
                  <Button variant="danger" onClick={() => setCancelModal(b)}>
                    Cancel booking
                  </Button>
                )}
              </div>
            </div>
          );
        })
      )}

      {modal && (
        <BookingModal
          allRooms={bookableRooms}
          bookings={bookings}
          guests={guests}
          maintenanceTickets={maintenanceTickets}
          onClose={() => setModal(null)}
          onCreate={createBooking}
          busy={busy}
        />
      )}
      {editModal && (
        <EditBookingModal
          booking={editModal}
          bookings={bookings}
          rooms={rooms}
          onClose={() => setEditModal(null)}
          onSave={(d) => saveBookingEdit(editModal, d)}
        />
      )}
      {detailModal && (
        <GuestDetailModal
          booking={detailModal}
          guest={guestOf(detailModal.guest_id)}
          coGuests={coGuests.filter((c) => c.booking_id === detailModal.id)}
          onClose={() => setDetailModal(null)}
        />
      )}
      {confirmSendModal && (
        <WhatsAppConfirmModal info={confirmSendModal} onClose={() => setConfirmSendModal(null)} />
      )}
      {cancelModal && (
        <CancelBookingModal
          booking={cancelModal}
          guest={guestOf(cancelModal.guest_id)}
          room={roomOf(cancelModal.room_id)}
          onClose={() => setCancelModal(null)}
          onConfirm={(reason) => {
            cancelBooking(cancelModal, reason);
            setCancelModal(null);
          }}
        />
      )}
      {changeRoomModal && (
        <ChangeRoomModal
          booking={changeRoomModal}
          guest={guestOf(changeRoomModal.guest_id)}
          currentRoom={roomOf(changeRoomModal.room_id)}
          allRooms={rooms}
          bookings={bookings}
          maintenanceTickets={maintenanceTickets}
          onClose={() => setChangeRoomModal(null)}
          onConfirm={(payload) => changeRoom(payload)}
        />
      )}
    </div>
  );
}

function CancelBookingModal({ booking, guest, room, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="Cancel booking" onClose={onClose} width={420}>
      <div style={{ background: "#fff2ee", border: "1px solid rgba(166,69,47,0.35)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--rust)" }}>
          {guest ? guest.name : "Guest"} — Room {room ? room.number : "—"}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink70)", marginTop: 2 }}>
          {fmtDate(booking.check_in)} → {fmtDate(booking.check_out)} · {currency(booking.total)}
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: 0 }}>
        This keeps the booking on record (marked "Cancelled") instead of deleting it — useful for
        history and reporting.
      </p>
      <Field label="Reason (optional)">
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Guest changed plans" />
      </Field>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Keep booking
        </Button>
        <Button variant="danger" onClick={() => onConfirm(reason.trim())}>
          Confirm cancellation
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
// CHANGE ROOM — move a checked-in guest to a different room (e.g.
// maintenance issue, guest request). Frees the old room, occupies the new one.
// ---------------------------------------------------------------
function ChangeRoomModal({ booking, guest, currentRoom, allRooms, bookings, maintenanceTickets, onClose, onConfirm }) {
  const availableRooms = allRooms.filter(
    (r) => r.id !== booking.room_id && r.status !== "maintenance" && isRoomAvailableForDates(r.id, booking.check_in, booking.check_out, bookings, booking.id, r.status)
  );
  const [newRoomId, setNewRoomId] = useState(availableRooms[0]?.id || "");
  const [updateRate, setUpdateRate] = useState(false);
  const newRoom = availableRooms.find((r) => r.id === newRoomId);
  const activeTicket = (maintenanceTickets || []).find((t) => t.room_id === newRoomId && t.status !== "Resolved");

  const confirmMove = () => {
    if (activeTicket) {
      const proceed = confirm(
        `⚠ Room ${newRoom?.number || ""} has an open maintenance issue:\n\n"${activeTicket.issue}" (Priority: ${activeTicket.priority}, Status: ${activeTicket.status})\n\nMove the guest here anyway?`
      );
      if (!proceed) return;
    }
    onConfirm({ booking, newRoomId, updateRate });
  };

  return (
    <Modal title="Change room" onClose={onClose} width={420}>
      <p style={{ fontSize: 13, marginTop: 0 }}>
        Moving <strong>{guest ? guest.name : "this guest"}</strong> out of Room {currentRoom ? currentRoom.number : "—"}.
      </p>
      {availableRooms.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--rust)" }}>No other rooms are free for these dates right now.</p>
      ) : (
        <>
          <Field label="Move to room">
            <select className="input" value={newRoomId} onChange={(e) => setNewRoomId(e.target.value)}>
              {availableRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.number} · {r.type}
                </option>
              ))}
            </select>
          </Field>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, marginTop: 12, color: "var(--ink70)" }}>
            <input type="checkbox" checked={updateRate} onChange={(e) => setUpdateRate(e.target.checked)} style={{ marginTop: 2 }} />
            <span>
              Update rate to the new room's tariff (
              {newRoom ? currency(computeRoomRate(newRoom, 1 + (booking.co_guests_count || 0))) : "—"}/night). Leave unchecked to keep
              the guest's originally agreed price.
            </span>
          </label>
          {activeTicket && (
            <div style={{ marginTop: 12, background: "#fff2ee", border: "1px solid rgba(166,69,47,0.35)", borderRadius: 8, padding: "10px 12px", fontSize: 12.5 }}>
              ⚠ <strong>Room {newRoom?.number} has an open maintenance issue:</strong> "{activeTicket.issue}" (Priority: {activeTicket.priority}, Status: {activeTicket.status})
            </div>
          )}
        </>
      )}
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!newRoomId} onClick={confirmMove}>
          Move room
        </Button>
      </div>
    </Modal>
  );
}

function WhatsAppConfirmModal({ info, onClose }) {
  const { guest, room, checkIn, checkOut, total } = info;
  const message = `Hi ${guest.name}, your booking at MANYAWAR HOTEL is confirmed!\nRoom: ${room?.number || ""} (${room?.type || ""})\nCheck-in: ${fmtDate(checkIn)}\nCheck-out: ${fmtDate(checkOut)}\nTotal: ${currency(total)}\n\nWe look forward to hosting you!`;
  return (
    <Modal title="Booking created" onClose={onClose} width={380}>
      <p style={{ fontSize: 13 }}>Want to send a WhatsApp confirmation to {guest.name}?</p>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Skip
        </Button>
        <a
          className="btn"
          href={whatsappLink(guest.phone, message)}
          target="_blank"
          rel="noreferrer"
          style={{ textDecoration: "none" }}
          onClick={onClose}
        >
          Send WhatsApp confirmation
        </a>
      </div>
    </Modal>
  );
}

function BookingModal({ allRooms, bookings, guests, maintenanceTickets, onClose, onCreate, busy }) {
  const [guestMode, setGuestMode] = useState(guests.length ? "existing" : "new");
  const [existingId, setExistingId] = useState(guests[0]?.id || "");
  const [guestSearch, setGuestSearch] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(todayISO());
  const [source, setSource] = useState(BOOKING_SOURCES[0]);
  const [deposit, setDeposit] = useState(0);
  const [depositMode, setDepositMode] = useState(PAYMENT_MODES[0]);
  const [coGuestsCount, setCoGuestsCount] = useState(0);
  const [bookingRef, setBookingRef] = useState("");
  const [bookedOn, setBookedOn] = useState(todayISO());

  // Only rooms with no overlapping booking for the CHOSEN dates show up here —
  // this is what stops a room from being double-booked for future dates.
  const availableForDates = useMemo(
    () => allRooms.filter((r) => isRoomAvailableForDates(r.id, checkIn, checkOut, bookings, undefined, r.status)),
    [allRooms, bookings, checkIn, checkOut]
  );
  const [roomId, setRoomId] = useState("");
  useEffect(() => {
    if (!availableForDates.find((r) => r.id === roomId)) {
      setRoomId(availableForDates[0]?.id || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn, checkOut]);

  const occupancy = 1 + (Number(coGuestsCount) || 0);
  const selectedRoom = availableForDates.find((r) => r.id === roomId);
  const nights = nightsBetween(checkIn, checkOut);
  const previewRate = selectedRoom ? computeRoomRate(selectedRoom, occupancy) : 0;
  const activeTicket = (maintenanceTickets || []).find((t) => t.room_id === roomId && t.status !== "Resolved");

  const submit = () => {
    if (!bookingRef.trim()) return alert("Booking ID / reference is required.");
    if (checkOut < checkIn) return alert("Check-out can't be before check-in.");
    if (!roomId) return alert("No room is available for these dates. Try a different date range.");
    if (activeTicket) {
      const proceed = confirm(
        `⚠ Room ${selectedRoom?.number || ""} has an open maintenance issue:\n\n"${activeTicket.issue}" (Priority: ${activeTicket.priority}, Status: ${activeTicket.status})\n\nBook this room anyway?`
      );
      if (!proceed) return;
    }
    if (checkIn < todayISO()) {
      const proceed = confirm(
        `⚠ Check-in date (${checkIn}) is in the past.\n\nThis is allowed (useful for backdating a walk-in you forgot to log), but double-check it's correct.\n\nContinue?`
      );
      if (!proceed) return;
    }
    let guest;
    if (guestMode === "existing") {
      guest = guests.find((g) => g.id === existingId);
      if (!guest) return alert("Select a guest.");
    } else {
      if (!name.trim()) return alert("Guest name is required.");
      guest = { name: name.trim(), phone: phone.trim(), email: email.trim() };
    }
    onCreate({
      guest,
      roomId,
      checkIn,
      checkOut,
      source,
      deposit: Number(deposit) || 0,
      depositMode,
      bookedOn,
      coGuestsCount: Number(coGuestsCount) || 0,
      bookingRef: bookingRef.trim(),
    });
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
          <>
            <Field label="Search guest">
              <input
                className="input"
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                placeholder="Type a name or phone to filter…"
              />
            </Field>
            <Field label="Guest">
              {(() => {
                const q = guestSearch.trim().toLowerCase();
                const filteredGuests = q
                  ? guests.filter((g) => g.name?.toLowerCase().includes(q) || (g.phone || "").includes(q))
                  : guests;
                return filteredGuests.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: "var(--ink45)", margin: "4px 0 0" }}>No guests match "{guestSearch}".</p>
                ) : (
                  <select className="input" value={existingId} onChange={(e) => setExistingId(e.target.value)}>
                    {filteredGuests.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} {g.phone ? `— ${g.phone}` : ""}
                      </option>
                    ))}
                  </select>
                );
              })()}
            </Field>
          </>
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
      <div className="grid-2" style={{ marginTop: 14 }}>
        <Field label="Check-in">
          <input
            className="input"
            type="date"
            value={checkIn}
            onChange={(e) => {
              const v = e.target.value;
              setCheckIn(v);
              if (checkOut <= v) setCheckOut(v);
            }}
          />
        </Field>
        <Field label="Check-out">
          <input
            className="input"
            type="date"
            min={checkIn}
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </Field>
      </div>
      {checkIn < todayISO() && (
        <p style={{ fontSize: 12, color: "var(--brass)", marginTop: 6 }}>
          ⚠ This check-in date is in the past — allowed, but double-check it's what you meant.
        </p>
      )}
      <div className="grid-2" style={{ marginTop: 14 }}>
        <Field label={`Room (${availableForDates.length} available for these dates)`}>
          {availableForDates.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--rust)", margin: "4px 0 0" }}>
              No rooms free for this range.
            </p>
          ) : (
            <select className="input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              {availableForDates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.number} · {r.type}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Co-guests (people besides the main guest)">
          <input
            className="input"
            type="number"
            min={0}
            value={coGuestsCount}
            onChange={(e) => setCoGuestsCount(Math.max(0, Number(e.target.value)))}
          />
        </Field>
      </div>
      {selectedRoom && (
        <div style={{ marginTop: 10, background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: "8px 12px", fontSize: 12.5 }}>
          {occupancy} guest{occupancy > 1 ? "s" : ""} · Rate/night: <strong>{currency(previewRate)}</strong> · {nights} night{nights > 1 ? "s" : ""} ·
          Total: <strong>{currency(previewRate * nights)}</strong>
        </div>
      )}
      {activeTicket && (
        <div style={{ marginTop: 10, background: "#fff2ee", border: "1px solid rgba(166,69,47,0.35)", borderRadius: 8, padding: "10px 12px", fontSize: 12.5 }}>
          ⚠ <strong>Room {selectedRoom?.number} has an open maintenance issue:</strong> "{activeTicket.issue}" (Priority: {activeTicket.priority}, Status: {activeTicket.status})
        </div>
      )}
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
      {Number(deposit) > 0 && (
        <div style={{ marginTop: 14 }}>
          <Field label="Deposit paid via">
            <select className="input" value={depositMode} onChange={(e) => setDepositMode(e.target.value)}>
              {PAYMENT_MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <Field label="Booking ID / reference (required — shows on bill) *">
          <input className="input" value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} placeholder="e.g. your own ledger number, OTA ref" required />
        </Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <Field label="Booked on (change this only if entering an old/backdated record)">
          <input className="input" type="date" max={todayISO()} value={bookedOn} onChange={(e) => setBookedOn(e.target.value)} />
        </Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy || availableForDates.length === 0} onClick={submit}>
          Create booking
        </Button>
      </div>
    </Modal>
  );
}

function EditBookingModal({ booking, bookings, rooms, onClose, onSave }) {
  const [checkIn, setCheckIn] = useState(booking.check_in);
  const [checkOut, setCheckOut] = useState(booking.check_out);
  const [source, setSource] = useState(booking.source || BOOKING_SOURCES[0]);
  const [coGuestsCount, setCoGuestsCount] = useState(booking.co_guests_count || 0);
  const [bookingRef, setBookingRef] = useState(booking.booking_ref || "");
  const room = rooms.find((r) => r.id === booking.room_id);
  const nights = nightsBetween(checkIn, checkOut);
  const occupancy = 1 + (Number(coGuestsCount) || 0);
  const newRate = room ? computeRoomRate(room, occupancy) : booking.rate;
  const newSubtotal = newRate * nights;
  const newTotal = computeBookingTotal({ ...booking, subtotal: newSubtotal });
  const available = isRoomAvailableForDates(booking.room_id, checkIn, checkOut, bookings, booking.id);

  return (
    <Modal title="Edit booking" onClose={onClose} width={440}>
      <div className="grid-2">
        <Field label="Check-in">
          <input className="input" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </Field>
        <Field label="Check-out">
          <input className="input" type="date" min={checkIn} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </Field>
        <Field label="Co-guests">
          <input
            className="input"
            type="number"
            min={0}
            value={coGuestsCount}
            onChange={(e) => setCoGuestsCount(Math.max(0, Number(e.target.value)))}
          />
        </Field>
        <Field label="Booking source">
          <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
            {BOOKING_SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <Field label="Booking ID / reference">
          <input className="input" value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} />
        </Field>
      </div>
      <p style={{ fontSize: 13, marginTop: 14 }}>
        {nights} nights · {occupancy} guest{occupancy > 1 ? "s" : ""} · Rate/night: <strong>{currency(newRate)}</strong> · New total: <strong>{currency(newTotal)}</strong>
      </p>
      {checkIn < todayISO() && (
        <p style={{ fontSize: 12, color: "var(--brass)" }}>
          ⚠ This check-in date is in the past — allowed, but double-check it's what you meant.
        </p>
      )}
      {!available && (
        <p style={{ fontSize: 12.5, color: "var(--rust)" }}>
          ⚠ This room already has another booking that overlaps these new dates.
        </p>
      )}
      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!available}
          onClick={() => {
            if (checkOut < checkIn) return alert("Check-out can't be before check-in.");
            if (!bookingRef.trim()) return alert("Booking ID / reference is required.");
            onSave({ checkIn, checkOut, source, coGuestsCount, bookingRef, room });
          }}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
// CHECK-IN — capture ID proof photos for the main guest and any
// co-guests, flag+charge an early check-in fee if applicable, then
// finalize check-in. Exported so it can be triggered from Dashboard too.
// ---------------------------------------------------------------
export function CheckInModal({ booking, guest, existingCoGuests, onClose, onConfirm }) {
  const [guestFront, setGuestFront] = useState(null);
  const [guestBack, setGuestBack] = useState(null);
  const [guestFrontUrl, setGuestFrontUrl] = useState(null);
  const [guestBackUrl, setGuestBackUrl] = useState(null);
  const slots = Math.max(booking.co_guests_count || 0, existingCoGuests.length);
  const [coForms, setCoForms] = useState(
    Array.from({ length: slots }, (_, i) => ({
      id: existingCoGuests[i]?.id || null,
      name: existingCoGuests[i]?.name || "",
      frontFile: null,
      backFile: null,
      frontUrl: null,
      backUrl: null,
      existingFrontPath: existingCoGuests[i]?.id_proof_front_path || null,
      existingBackPath: existingCoGuests[i]?.id_proof_back_path || null,
    }))
  );
  const [saving, setSaving] = useState(false);
  const early = isEarlyCheckin(booking);
  const [earlyFee, setEarlyFee] = useState(0);

  useEffect(() => {
    if (guest?.id_proof_front_path) {
      getIdProofSignedUrl(guest.id_proof_front_path).then(({ data }) => data && setGuestFrontUrl(data.signedUrl));
    }
    if (guest?.id_proof_back_path) {
      getIdProofSignedUrl(guest.id_proof_back_path).then(({ data }) => data && setGuestBackUrl(data.signedUrl));
    }
    coForms.forEach((f, i) => {
      if (f.existingFrontPath) {
        getIdProofSignedUrl(f.existingFrontPath).then(({ data }) => {
          if (data) setCoForms((prev) => prev.map((p, idx) => (idx === i ? { ...p, frontUrl: data.signedUrl } : p)));
        });
      }
      if (f.existingBackPath) {
        getIdProofSignedUrl(f.existingBackPath).then(({ data }) => {
          if (data) setCoForms((prev) => prev.map((p, idx) => (idx === i ? { ...p, backUrl: data.signedUrl } : p)));
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const balance = booking.total - booking.paid_amount;

  const confirm_ = async () => {
    setSaving(true);
    try {
      if (guest && (guestFront || guestBack)) {
        const patch = {};
        if (guestFront) {
          const path = `guest-${guest.id}-front-${Date.now()}.jpg`;
          const { error } = await uploadIdProof(path, guestFront);
          if (!error) patch.id_proof_front_path = path;
        }
        if (guestBack) {
          const path = `guest-${guest.id}-back-${Date.now()}.jpg`;
          const { error } = await uploadIdProof(path, guestBack);
          if (!error) patch.id_proof_back_path = path;
        }
        if (Object.keys(patch).length) await updateGuest(guest.id, patch);
      }
      for (const f of coForms) {
        if (!f.name.trim() && !f.frontFile && !f.backFile) continue;
        let frontPath = f.existingFrontPath;
        let backPath = f.existingBackPath;
        if (f.frontFile) {
          frontPath = `co-guest-${booking.id}-front-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`;
          await uploadIdProof(frontPath, f.frontFile);
        }
        if (f.backFile) {
          backPath = `co-guest-${booking.id}-back-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`;
          await uploadIdProof(backPath, f.backFile);
        }
        if (f.id) {
          await updateCoGuest(f.id, { name: f.name.trim(), id_proof_front_path: frontPath, id_proof_back_path: backPath });
        } else if (f.name.trim() || frontPath || backPath) {
          await addCoGuest({ booking_id: booking.id, name: f.name.trim(), id_proof_front_path: frontPath, id_proof_back_path: backPath });
        }
      }
    } finally {
      setSaving(false);
    }

    if (balance > 0) {
      const proceed = confirm(
        `⚠ Balance due: ${currency(balance)}\n\nThis guest still owes ${currency(balance)}. Collect payment now if possible.\n\nContinue with check-in?`
      );
      if (!proceed) return;
    }
    onConfirm({ early, earlyFee: Number(earlyFee) || 0 });
  };

  return (
    <Modal title="Check-in — verify ID" onClose={onClose} width={520}>
      <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: 0 }}>
        Take a clear photo of the front and back of each guest's ID proof. Photos are stored securely and linked to this guest's record for future stays.
      </p>

      {early && (
        <div style={{ background: "#fff8ea", border: "1px solid rgba(201,154,60,0.4)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
            ⚡ Early check-in — standard check-in is 12:00 PM
          </div>
          <Field label="Early check-in fee (optional — leave 0 to waive)">
            <input className="input" type="number" min={0} value={earlyFee} onChange={(e) => setEarlyFee(e.target.value)} />
          </Field>
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>{guest ? guest.name : "Guest"} (main guest)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <IdCaptureField label="ID proof — front" file={guestFront} onFile={setGuestFront} existingUrl={guestFrontUrl} />
          <IdCaptureField label="ID proof — back" file={guestBack} onFile={setGuestBack} existingUrl={guestBackUrl} />
        </div>
      </div>

      {coForms.map((f, i) => (
        <div key={i} style={{ background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <Field label={`Co-guest ${i + 1} name`}>
            <input
              className="input"
              value={f.name}
              onChange={(e) => setCoForms((prev) => prev.map((p, idx) => (idx === i ? { ...p, name: e.target.value } : p)))}
            />
          </Field>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            <IdCaptureField
              label="ID proof — front"
              file={f.frontFile}
              existingUrl={f.frontUrl}
              onFile={(file) => setCoForms((prev) => prev.map((p, idx) => (idx === i ? { ...p, frontFile: file } : p)))}
            />
            <IdCaptureField
              label="ID proof — back"
              file={f.backFile}
              existingUrl={f.backUrl}
              onFile={(file) => setCoForms((prev) => prev.map((p, idx) => (idx === i ? { ...p, backFile: file } : p)))}
            />
          </div>
        </div>
      ))}

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={saving} onClick={confirm_}>
          {saving ? "Saving…" : "Confirm check-in"}
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
// CHECK-OUT — balance warning + late checkout fee if applicable.
// Exported so it can be triggered from Dashboard too.
// ---------------------------------------------------------------
export function CheckOutModal({ booking, onClose, onConfirm }) {
  const balance = booking.total - booking.paid_amount;
  const late = isLateCheckout(booking);
  const [lateFee, setLateFee] = useState(0);

  return (
    <Modal title="Check-out" onClose={onClose} width={400}>
      {balance > 0 && (
        <div style={{ background: "#fff2ee", border: "1px solid rgba(166,69,47,0.35)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--rust)" }}>⚠ Balance due: {currency(balance)}</div>
          <div style={{ fontSize: 12, color: "var(--ink70)", marginTop: 2 }}>Please collect payment before the guest leaves.</div>
        </div>
      )}
      {late && (
        <div style={{ background: "#fff2ee", border: "1px solid rgba(166,69,47,0.35)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
            ⏰ Late checkout — standard check-out is 11:00 AM
          </div>
          <Field label="Late checkout fee (optional — leave 0 to waive)">
            <input className="input" type="number" min={0} value={lateFee} onChange={(e) => setLateFee(e.target.value)} />
          </Field>
        </div>
      )}
      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="dark" onClick={() => onConfirm({ late, lateFee: Number(lateFee) || 0 })}>
          Confirm check-out
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
// GUEST DETAIL — view everything on file for a booking: main guest,
// co-guests, and their scanned ID photos.
// ---------------------------------------------------------------
function GuestDetailModal({ booking, guest, coGuests, onClose }) {
  const [guestFrontUrl, setGuestFrontUrl] = useState(null);
  const [guestBackUrl, setGuestBackUrl] = useState(null);
  const [coUrls, setCoUrls] = useState({});

  useEffect(() => {
    if (guest?.id_proof_front_path) {
      getIdProofSignedUrl(guest.id_proof_front_path).then(({ data }) => data && setGuestFrontUrl(data.signedUrl));
    }
    if (guest?.id_proof_back_path) {
      getIdProofSignedUrl(guest.id_proof_back_path).then(({ data }) => data && setGuestBackUrl(data.signedUrl));
    }
    coGuests.forEach((c) => {
      if (c.id_proof_front_path) {
        getIdProofSignedUrl(c.id_proof_front_path).then(({ data }) => data && setCoUrls((prev) => ({ ...prev, [c.id + "_front"]: data.signedUrl })));
      }
      if (c.id_proof_back_path) {
        getIdProofSignedUrl(c.id_proof_back_path).then(({ data }) => data && setCoUrls((prev) => ({ ...prev, [c.id + "_back"]: data.signedUrl })));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal title="Guest details" onClose={onClose} width={480}>
      <div style={{ background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          {guest ? guest.name : "Guest removed"} {guest?.vip && "⭐"}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink45)" }}>{guest?.phone}</div>
        <div style={{ fontSize: 12.5, color: "var(--ink45)", marginBottom: 8 }}>{guest?.email}</div>
        <div style={{ display: "flex", gap: 10 }}>
          {guestFrontUrl && <img src={guestFrontUrl} alt="ID front" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6 }} />}
          {guestBackUrl && <img src={guestBackUrl} alt="ID back" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6 }} />}
        </div>
        {!guestFrontUrl && !guestBackUrl && <div style={{ fontSize: 11.5, color: "var(--rust)", marginTop: 4 }}>No ID proof on file yet</div>}
      </div>
      {coGuests.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--ink45)" }}>
          {booking.co_guests_count > 0 ? "Co-guest details haven't been captured yet — do this at check-in." : "No co-guests on this booking."}
        </p>
      ) : (
        coGuests.map((c) => (
          <div key={c.id} style={{ background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: 14, marginBottom: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 6 }}>{c.name || "Co-guest"}</div>
            <div style={{ display: "flex", gap: 10 }}>
              {coUrls[c.id + "_front"] && <img src={coUrls[c.id + "_front"]} alt="ID front" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6 }} />}
              {coUrls[c.id + "_back"] && <img src={coUrls[c.id + "_back"]} alt="ID back" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6 }} />}
            </div>
            {!coUrls[c.id + "_front"] && !coUrls[c.id + "_back"] && <div style={{ fontSize: 11.5, color: "var(--rust)" }}>No ID proof on file yet</div>}
          </div>
        ))
      )}
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
