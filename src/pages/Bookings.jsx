import React, { useState, useMemo, useEffect, useRef } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
  splitInclusiveGst,
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
  getSettings,
} from "../lib/api.js";

// Multi-room bookings are stored as separate rows sharing the same guest +
// dates (see createBooking below), with no explicit "which room is primary"
// flag in the DB. createBooking encodes it structurally in the booking_ref
// instead: the first room's ref is left exactly as typed, and every other
// room's ref is that SAME string with "-2", "-3", … appended. To find the
// primary among a set of siblings, look for the one ref that no sibling's
// ref is derived from — comparing pairs, not pattern-matching a single ref
// in isolation, which would misfire on any user-typed ref that happens to
// end in digits (e.g. "BUG-001" looks like it has a "-001" suffix on its
// own, but isn't one unless a "BUG-001-N" sibling actually exists).
function groupKeyOf(b) {
  return `${b.guest_id}|${b.check_in}|${b.check_out}`;
}
function isDerivedRef(candidate, base) {
  if (!candidate || !base) return false;
  return candidate.startsWith(base + "-") && /^\d+$/.test(candidate.slice(base.length + 1));
}
function findPrimaryBooking(siblings) {
  if (siblings.length <= 1) return siblings[0] || null;
  return (
    siblings.find((b) => !siblings.some((other) => other.id !== b.id && isDerivedRef(b.booking_ref, other.booking_ref))) ||
    siblings[0]
  );
}
function isPrimaryInGroup(booking, allBookings) {
  const siblings = allBookings.filter((b) => groupKeyOf(b) === groupKeyOf(booking));
  const primary = findPrimaryBooking(siblings);
  return !primary || primary.id === booking.id;
}
// Orders a group's bookings primary-first, then by increasing ref suffix —
// what the confirmation PDF and the "N guests" totals both assume.
function orderGroupPrimaryFirst(siblings) {
  const primary = findPrimaryBooking(siblings);
  if (!primary) return siblings.slice();
  const rank = (b) => {
    if (b.id === primary.id) return 0;
    if (isDerivedRef(b.booking_ref, primary.booking_ref)) {
      return Number(b.booking_ref.slice(primary.booking_ref.length + 1));
    }
    return Number.MAX_SAFE_INTEGER;
  };
  return siblings.slice().sort((a, c) => rank(a) - rank(c));
}

// Diffs an edit-booking patch against the booking's previous values so the
// Activity log records exactly what changed (old → new), not just a generic
// "edited" note. Only fields present in `patch` and actually different are
// included; derived fields (nights/subtotal/total/discount) are intentionally
// left out — they follow from check-in/check-out/rate and would just repeat
// the same edit as noise.
function describeBookingChanges(before, patch, roomOf) {
  const fields = [
    { key: "room_id", label: "Room", format: (v) => roomOf(v)?.number || "—" },
    { key: "check_in", label: "Check-in", format: fmtDate },
    { key: "check_out", label: "Check-out", format: fmtDate },
    { key: "rate", label: "Rate", format: currency },
    { key: "discount", label: "Discount", format: currency },
    { key: "source", label: "Source", format: (v) => v || "—" },
    { key: "co_guests_count", label: "Co-guests", format: (v) => String(v ?? 0) },
    { key: "booking_ref", label: "Booking ref", format: (v) => v || "—" },
  ];
  const changes = [];
  for (const f of fields) {
    if (!(f.key in patch)) continue;
    const oldV = before[f.key];
    const newV = patch[f.key];
    if (oldV === newV) continue;
    changes.push(`${f.label} ${f.format(oldV)} → ${f.format(newV)}`);
  }
  return changes;
}

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

  // roomSelections: [{ roomId, coGuestsCount }] — one row per room. Guest,
  // dates, source and booking ref are common to the whole submission; each
  // room becomes its own booking record (mirrors how check-in/checkout/edit
  // already operate per-booking, so a multi-room stay is just N sibling rows
  // sharing guest_id + check_in + check_out). Deposit and discount are only
  // ever attached to the first room's record, and the booking ref gets a
  // "-2", "-3", … suffix per extra room so refs stay unique without the
  // guest having to type multiple references.
  const createBooking = async ({
    guest,
    rooms: roomSelections,
    checkIn,
    checkOut,
    source,
    deposit,
    depositMode,
    discount,
    discountReason,
    bookingRef,
    bookedOn,
  }) => {
    setBusy(true);
    let guestId = guest.id;
    let fullGuest = guest;
    if (!guestId) {
      const { data } = await addGuest(guest);
      guestId = data?.id;
      fullGuest = data;
    }
    const nights = nightsBetween(checkIn, checkOut);
    const newBookings = [];
    const roomsUsed = [];
    for (let i = 0; i < roomSelections.length; i++) {
      const { roomId, coGuestsCount } = roomSelections[i];
      const room = roomOf(roomId);
      // The main guest only physically occupies the FIRST room — only that
      // room's occupancy (and rate tier) gets the "+1" for them. Every other
      // room in the group is occupied by its own co-guests only.
      const occupancy = (i === 0 ? 1 : 0) + (coGuestsCount || 0);
      const rate = computeRoomRate(room, occupancy);
      const subtotal = rate * nights;
      const clampedDiscount = i === 0 ? Math.max(0, Math.min(subtotal, discount || 0)) : 0;
      const total = computeBookingTotal({ subtotal, discount: clampedDiscount });
      const roomDeposit = i === 0 ? Math.max(0, Math.min(total, deposit || 0)) : 0;
      const ref = bookingRef ? (i === 0 ? bookingRef : `${bookingRef}-${i + 1}`) : null;
      const { data: newBooking } = await addBooking({
        guest_id: guestId,
        room_id: roomId,
        check_in: checkIn,
        check_out: checkOut,
        status: "reserved",
        rate,
        nights,
        subtotal,
        discount: clampedDiscount,
        discount_reason: clampedDiscount > 0 ? discountReason || null : null,
        total,
        // The deposit is folded straight into paid_amount — it's money
        // already collected, so the balance shown everywhere (Billing,
        // check-in/out, the confirmation PDF) is correct from the start
        // instead of needing a separate "adjust to bill" step later.
        paid_amount: roomDeposit,
        source: source || "Walk-in",
        deposit: roomDeposit,
        deposit_mode: roomDeposit > 0 ? depositMode || "Cash" : null,
        deposit_status: roomDeposit > 0 ? "adjusted" : null,
        deposit_refunded: false,
        co_guests_count: coGuestsCount || 0,
        booking_ref: ref,
        created_at: bookedOn ? new Date(bookedOn + "T12:00:00").toISOString() : undefined,
      });
      if (newBooking) {
        newBookings.push(newBooking);
        roomsUsed.push(room);
      }
    }
    setBusy(false);
    setModal(null);
    reload();
    // Confirmation PDF is on-demand only now (via the "Download confirmation"
    // button in the list) — no auto-download here.
    if (fullGuest?.phone && roomsUsed.length) {
      const grandTotal = newBookings.reduce((s, nb) => s + (nb.total || 0), 0);
      setConfirmSendModal({ guest: fullGuest, rooms: roomsUsed, checkIn, checkOut, total: grandTotal });
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
      const occupancy = (isPrimaryInGroup(booking, bookings) ? 1 : 0) + (booking.co_guests_count || 0);
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
  const saveBookingEdit = async (booking, { checkIn, checkOut, source, coGuestsCount, bookingRef, room, discount, discountReason }) => {
    const nights = nightsBetween(checkIn, checkOut);
    // Secondary rooms in a multi-room group don't get the main guest's "+1"
    // — mirrors createBooking's occupancy rule (see isPrimaryInGroup).
    const occupancy = (isPrimaryInGroup(booking, bookings) ? 1 : 0) + (Number(coGuestsCount) || 0);
    const rate = room ? computeRoomRate(room, occupancy) : booking.rate;
    const subtotal = rate * nights;
    const clampedDiscount = Math.max(0, Math.min(subtotal, Number(discount) || 0));
    const total = computeBookingTotal({ ...booking, subtotal, discount: clampedDiscount });
    const patch = {
      room_id: room ? room.id : booking.room_id,
      check_in: checkIn,
      check_out: checkOut,
      nights,
      rate,
      subtotal,
      discount: clampedDiscount,
      discount_reason: clampedDiscount > 0 ? discountReason || null : null,
      total,
      source,
      co_guests_count: Number(coGuestsCount) || 0,
      booking_ref: bookingRef.trim() || null,
    };
    await updateBooking(booking.id, patch);
    const g = guestOf(booking.guest_id);
    const r = room || roomOf(booking.room_id);
    const changes = describeBookingChanges(booking, patch, roomOf);
    if (changes.length) {
      logActivity("Booking edited", `(${g ? g.name : "Guest"}, Room ${r ? r.number : "—"}): ${changes.join(", ")}`);
    }
    setEditModal(null);
    reload();
  };

  const visible = bookings.filter((b) => {
    if (filter !== "all" && b.status !== filter) return false;
    if (dateFrom && b.check_in < dateFrom) return false;
    if (dateTo && b.check_in > dateTo) return false;
    return true;
  });

  // Multi-room bookings are stored as separate rows sharing the same guest +
  // dates (see createBooking above) — group them here purely for display:
  // a "N rooms" badge, and clustering the rows next to each other regardless
  // of how the underlying list happens to be sorted.
  const groupSizes = useMemo(() => {
    const sizes = {};
    bookings.forEach((b) => {
      const k = groupKeyOf(b);
      sizes[k] = (sizes[k] || 0) + 1;
    });
    return sizes;
  }, [bookings]);
  const groupedVisible = useMemo(() => {
    const byKey = new Map();
    const order = [];
    visible.forEach((b) => {
      const k = groupKeyOf(b);
      if (!byKey.has(k)) {
        byKey.set(k, []);
        order.push(k);
      }
      byKey.get(k).push(b);
    });
    return order.flatMap((k) => byKey.get(k));
  }, [visible]);

  // On-demand confirmation PDF — pulls in every booking in the same group
  // (same guest + dates) so a multi-room stay gets one combined PDF no
  // matter which room's card the button was clicked from.
  const downloadConfirmationFor = async (b) => {
    const groupBookings = bookings.filter((x) => groupKeyOf(x) === groupKeyOf(b));
    const ordered = orderGroupPrimaryFirst(groupBookings);
    const { data: settings } = await getSettings();
    downloadBookingConfirmation(
      ordered.map((bk) => ({ booking: bk, room: roomOf(bk.room_id) })),
      guestOf(b.guest_id),
      settings || {}
    );
  };

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

      {groupedVisible.length === 0 ? (
        <EmptyState text="No bookings match this view." />
      ) : (
        groupedVisible.map((b) => {
          const g = guestOf(b.guest_id);
          const r = roomOf(b.room_id);
          const groupSize = groupSizes[groupKeyOf(b)] || 1;
          // Only the primary room in a group includes the main guest —
          // secondary rooms hold their own co-guests only (see isPrimaryInGroup).
          const roomOccupancy = (isPrimaryInGroup(b, bookings) ? 1 : 0) + (b.co_guests_count || 0);
          return (
            <div className="card" key={b.id} id={`booking-${b.id}`} style={b.id === highlightId ? { outline: "2px solid var(--brass)", background: "#fff8ea" } : undefined}>
              <div className="card-col">
                <div className="title">
                  {g ? g.name : "Guest removed"} {g?.vip && "⭐"}
                  {groupSize > 1 && (
                    <span
                      style={{
                        marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: "#fff",
                        background: "var(--ink)", borderRadius: 999, padding: "2px 8px",
                      }}
                    >
                      {groupSize} rooms
                    </span>
                  )}
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
              <div style={{ width: 90 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{currency(b.total)}</div>
                {b.discount > 0 && (
                  <div style={{ fontSize: 10.5, color: "var(--brass)" }}>
                    {currency(b.subtotal ?? b.total)} − {currency(b.discount)} off
                  </div>
                )}
              </div>
              <span style={{ fontSize: 11.5, color: "var(--ink45)" }}>
                {roomOccupancy} guest{roomOccupancy === 1 ? "" : "s"}
              </span>
              {(b.checked_in_at || b.checked_out_at) && (
                <div style={{ fontSize: 10.5, color: "var(--ink45)" }}>
                  {b.checked_in_at && <>In: {fmtDateTime(b.checked_in_at)} </>}
                  {b.checked_out_at && <>· Out: {fmtDateTime(b.checked_out_at)}</>}
                </div>
              )}
              {b.deposit > 0 && (
                <span style={{ fontSize: 11.5, color: b.deposit_status === "refunded" ? "var(--ink45)" : "var(--brass)" }}>
                  Deposit {currency(b.deposit)} via {b.deposit_mode || "Cash"} ({b.deposit_status || "adjusted"}, already in Paid)
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
                <Button variant="ghost" onClick={() => downloadConfirmationFor(b)}>
                  Download confirmation
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
          rooms={
            bookableRooms.some((r) => r.id === editModal.room_id)
              ? bookableRooms
              : [...bookableRooms, roomOf(editModal.room_id)].filter(Boolean)
          }
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
              {newRoom
                ? currency(
                    computeRoomRate(newRoom, (isPrimaryInGroup(booking, bookings) ? 1 : 0) + (booking.co_guests_count || 0))
                  )
                : "—"}
              /night). Leave unchecked to keep the guest's originally agreed price.
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
  const { guest, rooms, checkIn, checkOut, total } = info;
  // A multi-room booking gets one combined "Rooms: 101, 102" line instead of
  // sending the guest a separate WhatsApp message per room.
  const roomsLine =
    rooms.length > 1
      ? `Rooms: ${rooms.map((r) => r?.number).filter(Boolean).join(", ")}`
      : `Room: ${rooms[0]?.number || ""} (${rooms[0]?.type || ""})`;
  const message = `Hi ${guest.name}, your booking at MANYAWAR HOTEL is confirmed!\n${roomsLine}\nCheck-in: ${fmtDate(checkIn)}\nCheck-out: ${fmtDate(checkOut)}\nTotal: ${currency(total)}\n\nWe look forward to hosting you!`;
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
  const [discount, setDiscount] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [bookedOn, setBookedOn] = useState(todayISO());

  // Only rooms with no overlapping booking for the CHOSEN dates show up here —
  // this is what stops a room from being double-booked for future dates.
  const availableForDates = useMemo(
    () => allRooms.filter((r) => isRoomAvailableForDates(r.id, checkIn, checkOut, bookings, undefined, r.status)),
    [allRooms, bookings, checkIn, checkOut]
  );

  // Multi-room: one row per room, each with its own occupancy. Rows share
  // guest/dates/source/ref — only room + co-guests vary per row.
  const [roomRows, setRoomRows] = useState([{ id: 1, roomId: "", coGuestsCount: 0 }]);
  const nextRowIdRef = useRef(2);
  useEffect(() => {
    // Dates changed — drop any row whose room is no longer available for the
    // new dates (or collided with another row) and backfill from what's free.
    setRoomRows((prev) => {
      const used = new Set();
      return prev.map((row) => {
        let roomId = row.roomId;
        if (!availableForDates.find((r) => r.id === roomId) || used.has(roomId)) {
          roomId = availableForDates.find((r) => !used.has(r.id))?.id || "";
        }
        used.add(roomId);
        return { ...row, roomId };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn, checkOut]);

  const updateRoomRow = (id, patch) => setRoomRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRoomRow = () => {
    const usedIds = new Set(roomRows.map((r) => r.roomId).filter(Boolean));
    const nextRoom = availableForDates.find((r) => !usedIds.has(r.id));
    setRoomRows((prev) => [...prev, { id: nextRowIdRef.current, roomId: nextRoom?.id || "", coGuestsCount: 0 }]);
    nextRowIdRef.current += 1;
  };
  const removeRoomRow = (id) => setRoomRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  const canAddRoom = availableForDates.length > roomRows.length;

  const nights = nightsBetween(checkIn, checkOut);
  const rowDetails = roomRows.map((row, idx) => {
    const room = availableForDates.find((r) => r.id === row.roomId);
    // Only the first room's occupancy includes the main guest — the others
    // are occupied by their own co-guests only (mirrors createBooking below).
    const occupancy = (idx === 0 ? 1 : 0) + (Number(row.coGuestsCount) || 0);
    const rate = room ? computeRoomRate(room, occupancy) : 0;
    const ticket = room ? (maintenanceTickets || []).find((t) => t.room_id === room.id && t.status !== "Resolved") : null;
    return { row, room, occupancy, rate, subtotal: rate * nights, ticket };
  });
  const grandTotal = rowDetails.reduce((s, d) => s + d.subtotal, 0);

  const submit = () => {
    if (!bookingRef.trim()) return alert("Booking ID / reference is required.");
    if (checkOut < checkIn) return alert("Check-out can't be before check-in.");
    if (roomRows.some((r) => !r.roomId)) return alert("Select a room for every row (or remove the row) — no room is available for one of them.");

    // Duplicate-booking guard: same ref ID (base or per-room suffix), or same
    // guest name + same dates. The name+date check intentionally only looks
    // at already-saved bookings — the other rooms in THIS submission share
    // guest/dates on purpose and must not trip it.
    const activeBookings = bookings.filter((b) => b.status !== "cancelled");
    const refBase = bookingRef.trim();
    for (let i = 0; i < roomRows.length; i++) {
      const ref = i === 0 ? refBase : `${refBase}-${i + 1}`;
      const refDupe = activeBookings.find((b) => b.booking_ref && b.booking_ref.trim().toLowerCase() === ref.toLowerCase());
      if (refDupe) {
        const g = guests.find((x) => x.id === refDupe.guest_id);
        return alert(
          `⚠ Booking ID / reference "${ref}" is already used by an existing booking (${g ? g.name : "Guest"}, ${refDupe.check_in} → ${refDupe.check_out}).\n\nUse a different reference, or cancel that booking first.`
        );
      }
    }
    const candidateName = (guestMode === "existing" ? guests.find((g) => g.id === existingId)?.name : name.trim())?.toLowerCase();
    const nameDateDupe = candidateName
      ? activeBookings.find((b) => {
          const g = guests.find((x) => x.id === b.guest_id);
          return g?.name?.toLowerCase() === candidateName && b.check_in === checkIn && b.check_out === checkOut;
        })
      : null;
    if (nameDateDupe) {
      return alert(
        `⚠ ${candidateName} already has a booking for these exact same dates (${checkIn} → ${checkOut}, Ref: ${nameDateDupe.booking_ref || "—"}).\n\nThis looks like a duplicate — check Bookings tab, or cancel the old one first if this is a genuine correction.`
      );
    }

    const ticketsHit = rowDetails.filter((d) => d.ticket);
    if (ticketsHit.length) {
      const lines = ticketsHit
        .map((d) => `Room ${d.room?.number || ""}: "${d.ticket.issue}" (Priority: ${d.ticket.priority}, Status: ${d.ticket.status})`)
        .join("\n");
      const proceed = confirm(
        `⚠ ${ticketsHit.length > 1 ? "These rooms have" : "This room has"} an open maintenance issue:\n\n${lines}\n\nBook anyway?`
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
      rooms: roomRows.map((r) => ({ roomId: r.roomId, coGuestsCount: Number(r.coGuestsCount) || 0 })),
      checkIn,
      checkOut,
      source,
      deposit: Number(deposit) || 0,
      depositMode,
      discount: Number(discount) || 0,
      discountReason: discountReason.trim(),
      bookedOn,
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
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink70)", letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: 8 }}>
          Room{roomRows.length > 1 ? "s" : ""} ({availableForDates.length} available for these dates)
        </div>
        {availableForDates.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--rust)", margin: 0 }}>No rooms free for this range.</p>
        ) : (
          rowDetails.map(({ row, room, occupancy, rate, subtotal, ticket }, idx) => {
            const usedByOthers = new Set(roomRows.filter((r) => r.id !== row.id).map((r) => r.roomId).filter(Boolean));
            const options = availableForDates.filter((r) => r.id === row.roomId || !usedByOthers.has(r.id));
            return (
              <div key={row.id} style={{ marginBottom: 10, background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: 10 }}>
                <div className="grid-2">
                  <Field label={roomRows.length > 1 ? `Room ${idx + 1}` : "Room"}>
                    <select className="input" value={row.roomId} onChange={(e) => updateRoomRow(row.id, { roomId: e.target.value })}>
                      {options.length === 0 && <option value="">No room available</option>}
                      {options.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.number} · {r.type}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <Field label="Co-guests">
                        <input
                          className="input"
                          type="number"
                          min={0}
                          value={row.coGuestsCount}
                          onChange={(e) => updateRoomRow(row.id, { coGuestsCount: Math.max(0, Number(e.target.value)) })}
                        />
                      </Field>
                    </div>
                    {roomRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRoomRow(row.id)}
                        title="Remove this room"
                        style={{
                          marginBottom: 1, padding: "9px 11px", border: "1px solid rgba(166,69,47,0.35)",
                          borderRadius: 8, background: "transparent", color: "var(--rust)", cursor: "pointer",
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                {room && (
                  <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--ink70)" }}>
                    {occupancy} guest{occupancy > 1 ? "s" : ""} · Rate/night: <strong>{currency(rate)}</strong> · {nights} night{nights > 1 ? "s" : ""} ·
                    Total: <strong>{currency(subtotal)}</strong>
                  </div>
                )}
                {ticket && (
                  <div style={{ marginTop: 8, background: "#fff2ee", border: "1px solid rgba(166,69,47,0.35)", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
                    ⚠ <strong>Room {room?.number} has an open maintenance issue:</strong> "{ticket.issue}" (Priority: {ticket.priority}, Status: {ticket.status})
                  </div>
                )}
              </div>
            );
          })
        )}
        {canAddRoom && (
          <Button variant="ghost" onClick={addRoomRow}>
            + Add another room
          </Button>
        )}
        {roomRows.length > 1 && rowDetails.some((d) => d.room) && (
          <div style={{ marginTop: 4, fontSize: 13, textAlign: "right" }}>
            Grand total ({roomRows.length} rooms): <strong>{currency(grandTotal)}</strong>
          </div>
        )}
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <Field label="Booking source">
          <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
            {BOOKING_SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label={roomRows.length > 1 ? "Advance / deposit (applied to first room only)" : "Advance / deposit"}>
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
      <div className="grid-2" style={{ marginTop: 14 }}>
        <Field label={roomRows.length > 1 ? "Discount (applied to first room only)" : "Discount"}>
          <input className="input" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
        {Number(discount) > 0 && (
          <Field label="Discount reason (optional)">
            <input className="input" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
          </Field>
        )}
      </div>
      {Number(discount) > 0 && rowDetails[0]?.room && (
        <p style={{ fontSize: 12.5, color: "var(--brass)", marginTop: 6 }}>
          Total after discount: <strong>{currency(grandTotal - Math.max(0, Math.min(rowDetails[0].subtotal, Number(discount) || 0)))}</strong>
        </p>
      )}
      <div style={{ marginTop: 14 }}>
        <Field
          label={
            roomRows.length > 1
              ? "Booking ID / reference (required — shows on bill; \"-2\", \"-3\"… added per extra room) *"
              : "Booking ID / reference (required — shows on bill) *"
          }
        >
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
        <Button disabled={busy || availableForDates.length === 0 || roomRows.some((r) => !r.roomId)} onClick={submit}>
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
  const [discount, setDiscount] = useState(booking.discount || 0);
  const [discountReason, setDiscountReason] = useState(booking.discount_reason || "");
  const [bookingRef, setBookingRef] = useState(booking.booking_ref || "");

  // Only rooms with no overlapping booking for the CHOSEN dates show up here —
  // same pattern as the new-booking form. The booking's own record is excluded
  // from the overlap check so its current room stays selectable.
  const availableForDates = useMemo(
    () => rooms.filter((r) => isRoomAvailableForDates(r.id, checkIn, checkOut, bookings, booking.id, r.status)),
    [rooms, bookings, checkIn, checkOut, booking.id]
  );
  const [roomId, setRoomId] = useState(booking.room_id);
  useEffect(() => {
    if (!availableForDates.find((r) => r.id === roomId)) {
      setRoomId(availableForDates[0]?.id || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn, checkOut]);

  const room = availableForDates.find((r) => r.id === roomId);
  const nights = nightsBetween(checkIn, checkOut);
  // A secondary room in a multi-room group is occupied by its own co-guests
  // only — the main guest is only ever physically in the primary room.
  const isPrimaryRoom = isPrimaryInGroup(booking, bookings);
  const occupancy = (isPrimaryRoom ? 1 : 0) + (Number(coGuestsCount) || 0);
  const newRate = room ? computeRoomRate(room, occupancy) : booking.rate;
  const newSubtotal = newRate * nights;
  const clampedDiscount = Math.max(0, Math.min(newSubtotal, Number(discount) || 0));
  const newTotal = computeBookingTotal({ ...booking, subtotal: newSubtotal, discount: clampedDiscount });
  const available = !!roomId && isRoomAvailableForDates(roomId, checkIn, checkOut, bookings, booking.id);

  return (
    <Modal title="Edit booking" onClose={onClose} width={440}>
      <div className="grid-2">
        <Field label="Check-in">
          <input className="input" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </Field>
        <Field label="Check-out">
          <input className="input" type="date" min={checkIn} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </Field>
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
      <div className="grid-2" style={{ marginTop: 14 }}>
        <Field label="Discount">
          <input className="input" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
        {Number(discount) > 0 && (
          <Field label="Discount reason (optional)">
            <input className="input" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
          </Field>
        )}
      </div>
      <p style={{ fontSize: 13, marginTop: 14 }}>
        {nights} nights · {occupancy} guest{occupancy > 1 ? "s" : ""} · Rate/night: <strong>{currency(newRate)}</strong>
        {clampedDiscount > 0 && (
          <>
            {" "}
            · Discount: <strong>{currency(clampedDiscount)}</strong>
          </>
        )}{" "}
        · New total: <strong>{currency(newTotal)}</strong>
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
            onSave({ checkIn, checkOut, source, coGuestsCount, bookingRef, room, discount, discountReason: discountReason.trim() });
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

// ---------------------------------------------------------------
// BOOKING CONFIRMATION PDF — on-demand only, via the "Download confirmation"
// button in the list (no auto-download on create/edit).
// ---------------------------------------------------------------
function pdfMoney(n) {
  return `Rs. ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// The main guest only physically occupies the FIRST room in a group — every
// other room holds its own co-guests only. `entries` is built in creation
// order (or ref-suffix order for an already-saved group — see
// downloadConfirmationFor), so index 0 is always the primary room.
function entryOccupancy(entry, index) {
  return (index === 0 ? 1 : 0) + (entry.booking.co_guests_count || 0);
}

// entries: [{ booking, room }] — one per room. All entries share the same
// guest/check-in/check-out/source; only room + per-room charges differ. A
// single-room booking just passes a 1-length array.
function downloadBookingConfirmation(entries, guest, settings) {
  const doc = new jsPDF();
  const NAVY = [22, 35, 58];
  const BRASS = [184, 134, 63];
  const LIGHT = [246, 241, 231];
  const first = entries[0].booking;
  const multi = entries.length > 1;
  const gstPercent = Number(settings.gst_percent || 0);

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, 38, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text(settings.hotel_name || "MANYAWAR HOTEL", 14, 17);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(220, 220, 225);
  const addrLine = [settings.address, settings.phone ? `Ph: ${settings.phone}` : null].filter(Boolean).join("   ·   ");
  if (addrLine) doc.text(addrLine, 14, 24);
  if (settings.gst_number) doc.text(`GSTIN: ${settings.gst_number}`, 14, 30);

  doc.setTextColor(...BRASS);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("BOOKING CONFIRMATION", 196, 17, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(220, 220, 225);
  doc.text(`Date: ${fmtDate(todayISO())}`, 196, 24, { align: "right" });
  doc.text(`Booking ref: ${first.booking_ref || first.id.slice(0, 8).toUpperCase()}`, 196, 30, { align: "right" });

  doc.setFillColor(...LIGHT);
  doc.roundedRect(14, 46, 182, 32, 2, 2, "F");
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(guest ? guest.name : "Guest", 20, 55);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(70, 83, 107);
  doc.text(guest?.phone || "", 20, 61);
  if (guest?.email) doc.text(guest.email, 20, 67);
  const roomsLabel = entries.map(({ room }) => (room ? `${room.number} (${room.type})` : "—")).join(", ");
  doc.text(`Room${multi ? "s" : ""}: ${roomsLabel}`, 110, 55);
  doc.text(`${fmtDate(first.check_in)}  to  ${fmtDate(first.check_out)}  (${first.nights} night${first.nights > 1 ? "s" : ""})`, 110, 61);
  const totalGuests = entries.reduce((s, e, i) => s + entryOccupancy(e, i), 0);
  doc.text(
    `${totalGuests} guest${totalGuests > 1 ? "s" : ""}${first.source ? `  ·  Source: ${first.source}` : ""}`,
    110,
    67
  );

  // Each room's own occupancy shows next to its charge line (e.g. "Room 202
  // (3 guests)") — not just the group total above.
  const bodyRows = entries.flatMap(({ booking, room }, i) => {
    const occ = entryOccupancy({ booking }, i);
    const rows = [
      [
        `Room ${room ? room.number : "—"} (${occ} guest${occ === 1 ? "" : "s"}) — ${pdfMoney(booking.rate)} x ${booking.nights} night${booking.nights > 1 ? "s" : ""}`,
        pdfMoney(booking.subtotal ?? booking.total),
      ],
    ];
    if (booking.deposit > 0) {
      rows.push([`Advance / deposit received (${booking.deposit_mode || "Cash"}) — included in Amount paid below`, pdfMoney(booking.deposit)]);
    }
    return rows;
  });

  autoTable(doc, {
    startY: 88,
    head: [["Description", "Amount"]],
    body: bodyRows,
    theme: "plain",
    styles: { fontSize: 10, textColor: NAVY, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });

  let y = doc.lastAutoTable.finalY + 4;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.3);
  doc.line(120, y, 196, y);
  y += 7;

  const grandTotal = entries.reduce((s, { booking }) => s + (booking.total || 0), 0);
  const totalPaid = entries.reduce((s, { booking }) => s + (booking.paid_amount || 0), 0);
  const balance = grandTotal - totalPaid;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(multi ? "Grand total" : "Total", 120, y);
  doc.text(pdfMoney(grandTotal), 196, y, { align: "right" });
  y += 6;

  // Room rate is tax-inclusive — the total stays exactly what's charged; GST
  // is shown as a breakdown pulled out of that total, same as the Tax
  // Invoice PDF in Billing.jsx.
  if (gstPercent > 0) {
    const { base, gst } = splitInclusiveGst(grandTotal, gstPercent);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`(incl. GST ${gstPercent}%: ${pdfMoney(gst)} · taxable value: ${pdfMoney(base)})`, 120, y);
    y += 7;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(70, 83, 107);
  doc.text("Amount paid", 120, y);
  doc.text(pdfMoney(totalPaid), 196, y, { align: "right" });
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(balance > 0 ? 166 : 95, balance > 0 ? 69 : 136, balance > 0 ? 47 : 99);
  doc.text(balance > 0 ? "Balance due" : "Fully paid", 120, y);
  doc.text(pdfMoney(Math.max(0, balance)), 196, y, { align: "right" });
  y += 14;

  doc.setDrawColor(220, 220, 220);
  doc.line(14, y, 196, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(120, 120, 120);
  doc.text("Check-in: 12:00 PM · Check-out: 11:00 AM", 14, y + 7);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text("This confirms your reservation. We look forward to hosting you!", 14, y + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`Generated on ${fmtDate(todayISO())}`, 196, y + 14, { align: "right" });

  doc.save(`booking_confirmation_${(guest?.name || "guest").replace(/\s+/g, "_")}_${first.check_in}.pdf`);
}
