import React, { useState, useMemo, useEffect, useRef } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
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
  sumPayments,
  computeDisplayGroups,
  isPrimaryInGroup,
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
  addPayment,
  updatePaymentAndRecalc,
  uploadIdProof,
  getIdProofSignedUrl,
  logActivity,
  getSettings,
  deleteBooking,
} from "../lib/api.js";

// Smallest "-N" suffix not already used by any existing ref in the group —
// for assigning a ref to a room added to the group during an edit (1 is
// implicitly taken by the base ref itself).
function nextAvailableSuffix(existingRefs, baseRef) {
  const used = new Set();
  existingRefs.forEach((ref) => {
    if (!ref) return;
    if (ref === baseRef) {
      used.add(1);
      return;
    }
    if (ref.startsWith(baseRef + "-")) {
      const n = Number(ref.slice(baseRef.length + 1));
      if (Number.isFinite(n)) used.add(n);
    }
  });
  let n = 2;
  while (used.has(n)) n++;
  return n;
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

export default function Bookings({ rooms, guests, bookings, coGuests, maintenanceTickets, highlightId, role, onOpenCheckIn, onOpenCheckOut, reload }) {
  const [modal, setModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [confirmSendModal, setConfirmSendModal] = useState(null);
  const [cancelModal, setCancelModal] = useState(null);
  const [changeRoomModal, setChangeRoomModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null); // holds an array of bookings — length 1 for single-delete, N for bulk
  const [selectedForDelete, setSelectedForDelete] = useState(() => new Set());
  const [filter, setFilter] = useState("all");
  const [dateField, setDateField] = useState("check_in"); // check_in | created_at
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
        // The deposit is recorded as a real payment (see addPayment below)
        // and folded into paid_amount the same way any other payment is —
        // the balance shown everywhere (Billing, check-in/out, the
        // confirmation PDF) is correct from the start, and it can later be
        // corrected or reversed with the same edit/delete-payment tools
        // Billing already has, instead of a separate "refund deposit" flow.
        paid_amount: roomDeposit,
        source: source || "Walk-in",
        deposit: roomDeposit,
        deposit_mode: roomDeposit > 0 ? depositMode || "Cash" : null,
        co_guests_count: coGuestsCount || 0,
        booking_ref: ref,
        created_at: bookedOn ? new Date(bookedOn + "T12:00:00").toISOString() : undefined,
      });
      if (newBooking) {
        newBookings.push(newBooking);
        roomsUsed.push(room);
        if (roomDeposit > 0) {
          await addPayment({
            booking_id: newBooking.id,
            amount: roomDeposit,
            mode: depositMode || "Cash",
            paid_on: bookedOn || todayISO(),
          });
        }
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

  // Cancels every room in the group together — a multi-room stay is one
  // reservation from the guest's point of view, so cancelling one room but
  // not the rest would leave a confusing half-cancelled group behind.
  const cancelBookingGroup = async (members, reason) => {
    const g = guestOf(members[0].guest_id);
    const roomNumbers = members.map((m) => roomOf(m.room_id)?.number || "—").join(", ");
    for (const b of members) {
      await updateBooking(b.id, { status: "cancelled", cancel_reason: reason || null });
      if (b.status === "checked-in") {
        await updateRoom(b.room_id, { status: "available" });
      }
    }
    logActivity(
      "Booking cancelled",
      `${g ? g.name : "Guest"} — Room${members.length > 1 ? "s" : ""} ${roomNumbers}${reason ? ` (${reason})` : ""}`
    );
    reload();
  };

  // Downloads a full record of the booking(s) about to be permanently
  // deleted — guest, ref, bill no, dates, room, total/paid, and the
  // complete payment history — since after deletion the DB cascade wipes
  // all of that with no other durable trace (see deleteCancelledBookings
  // below). Always called before any delete, never optional.
  const exportBookingBackup = (bookingList) => {
    const wb = XLSX.utils.book_new();
    const summaryRows = bookingList.map((b) => {
      const g = guestOf(b.guest_id);
      const r = roomOf(b.room_id);
      return {
        Guest: g ? g.name : "Guest removed",
        Phone: g?.phone || "",
        "Booking Ref": b.booking_ref || "",
        "Bill No": b.bill_no || "",
        Room: r ? r.number : "—",
        "Check-in": b.check_in,
        "Check-out": b.check_out,
        Status: b.status,
        "Cancel reason": b.cancel_reason || "",
        Total: b.total,
        Paid: sumPayments(b),
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Bookings");

    const paymentRows = bookingList.flatMap((b) => {
      const g = guestOf(b.guest_id);
      return (b.payments || []).map((p) => ({
        Guest: g ? g.name : "Guest removed",
        "Booking Ref": b.booking_ref || "",
        "Bill No": b.bill_no || "",
        Date: p.paid_on,
        Mode: p.mode,
        Amount: p.amount,
      }));
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(paymentRows.length ? paymentRows : [{ note: "No payments on this booking" }]),
      "Payment History"
    );

    const namePart =
      bookingList.length === 1
        ? (guestOf(bookingList[0].guest_id)?.name || "booking").replace(/\s+/g, "_")
        : `${bookingList.length}_bookings`;
    XLSX.writeFile(wb, `deleted-booking-backup_${namePart}_${todayISO()}.xlsx`);
  };

  // Permanent, owner-only cleanup for bookings already cancelled/no-show —
  // NOT a replacement for Cancel, which is what actually stops a live
  // booking. The DB cascade (payments/co_guests/booking_services/
  // inventory_usage all `on delete cascade` on bookings.id) does the
  // heavy lifting; every finance screen (Finance, Accounts, Reports,
  // Dashboard) reads bookings fresh from props on every reload rather than
  // a cached snapshot, so a deleted booking's payment disappears from all
  // of them automatically once reload() below re-fetches. One Activity
  // log entry is written per booking, BEFORE the delete call, since
  // there's no other durable record left afterward (the backup export
  // above is the other half of that — always generated first).
  const deleteCancelledBookings = async (bookingList) => {
    exportBookingBackup(bookingList);
    const failures = [];
    for (const b of bookingList) {
      const g = guestOf(b.guest_id);
      const r = roomOf(b.room_id);
      const paid = sumPayments(b);
      logActivity(
        "Booking permanently deleted",
        `${g ? g.name : "Guest"} — Room ${r ? r.number : "—"}${b.bill_no ? ` · Bill No: ${b.bill_no}` : ""} · ${currency(paid)} paid · Permanently deleted by owner`
      );
      const { error } = await deleteBooking(b.id);
      if (error) failures.push(`Room ${r ? r.number : "—"}: ${error.message}`);
    }
    if (failures.length) {
      alert(`Some bookings couldn't be deleted:\n${failures.join("\n")}\n\nThe rest were deleted successfully.`);
    }
    setDeleteModal(null);
    setSelectedForDelete(new Set());
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
  // Edit now operates on the WHOLE group at once (mirrors New Booking's
  // room-rows UI): existing rows get updated in place, a removed row cancels
  // that single room, and a newly-added row inserts a fresh booking sharing
  // the group's guest/dates — matching how createBooking builds a group in
  // the first place.
  const saveBookingEditGroup = async (groupBookings, { checkIn, checkOut, source, bookingRef, discount, discountReason, depositNow, depositMode, rows, depositEdit }) => {
    const primary = groupBookings[0];
    const nights = nightsBetween(checkIn, checkOut);
    const activeRows = rows.filter((r) => !r.removed);
    const removedRows = rows.filter((r) => r.removed && r.bookingId);
    const logLines = [];

    for (const r of removedRows) {
      const original = groupBookings.find((b) => b.id === r.bookingId);
      await updateBooking(original.id, { status: "cancelled", cancel_reason: "Room removed during edit" });
      if (original.status === "checked-in") await updateRoom(original.room_id, { status: "available" });
      logLines.push(`Room ${roomOf(original.room_id)?.number || "—"} removed`);
    }

    const usedRefs = groupBookings.map((b) => b.booking_ref);
    for (let i = 0; i < activeRows.length; i++) {
      const row = activeRows[i];
      const room = roomOf(row.roomId);
      // Only the first row keeps the main guest's "+1" — mirrors createBooking.
      const occupancy = (i === 0 ? 1 : 0) + (Number(row.coGuestsCount) || 0);
      const rate = computeRoomRate(room, occupancy);
      const subtotal = rate * nights;
      const rowDiscount = i === 0 ? Math.max(0, Math.min(subtotal, Number(discount) || 0)) : 0;
      const total = computeBookingTotal({ subtotal, discount: rowDiscount });

      if (row.bookingId) {
        const original = groupBookings.find((b) => b.id === row.bookingId);
        const patch = {
          room_id: room.id,
          check_in: checkIn,
          check_out: checkOut,
          nights,
          rate,
          subtotal,
          discount: rowDiscount,
          discount_reason: rowDiscount > 0 ? discountReason || null : null,
          total,
          source,
          co_guests_count: Number(row.coGuestsCount) || 0,
        };
        // Renaming the shared ref only makes sense from the primary row, and
        // only when a rename was actually offered (single-room groups only —
        // see EditBookingModal's refEditable).
        if (i === 0 && bookingRef.trim() && bookingRef.trim() !== original.booking_ref) {
          patch.booking_ref = bookingRef.trim();
        }
        await updateBooking(original.id, patch);
        const changes = describeBookingChanges(original, patch, roomOf);
        if (changes.length) logLines.push(`Room ${room.number}: ${changes.join(", ")}`);
      } else {
        const base = primary.booking_ref || bookingRef.trim();
        const ref = base ? `${base}-${nextAvailableSuffix(usedRefs, base)}` : null;
        usedRefs.push(ref);
        const { data: newBooking } = await addBooking({
          guest_id: primary.guest_id,
          room_id: room.id,
          check_in: checkIn,
          check_out: checkOut,
          status: "reserved",
          rate,
          nights,
          subtotal,
          discount: 0,
          discount_reason: null,
          total,
          paid_amount: 0,
          source: source || "Walk-in",
          deposit: 0,
          deposit_mode: null,
          co_guests_count: Number(row.coGuestsCount) || 0,
          booking_ref: ref,
        });
        if (newBooking) logLines.push(`Room ${room.number} added`);
      }
    }

    if (Number(depositNow) > 0) {
      await addPayment({ booking_id: primary.id, amount: Number(depositNow), mode: depositMode || "Cash", paid_on: todayISO() });
      await updateBooking(primary.id, { paid_amount: (primary.paid_amount || 0) + Number(depositNow) });
      logLines.push(`Payment recorded: ${currency(Number(depositNow))} via ${depositMode || "Cash"}`);
    }

    // Directly editing the original deposit — same shared update+recalc used
    // by Billing.jsx's owner-only payment corrections, so both stay in sync.
    // Also mirrors the edit into bookings.deposit/deposit_mode, since other
    // screens (Billing card, PDF) read that snapshot rather than re-deriving
    // it from the payment list.
    if (depositEdit) {
      const { error } = await updatePaymentAndRecalc(
        primary,
        depositEdit.paymentId,
        { amount: depositEdit.amount, mode: depositEdit.mode },
        { deposit: depositEdit.amount, deposit_mode: depositEdit.mode }
      );
      if (error) {
        alert(`Couldn't update the deposit: ${error.message}`);
      } else {
        logLines.push(`Deposit corrected to ${currency(depositEdit.amount)} via ${depositEdit.mode}`);
      }
    }

    const g = guestOf(primary.guest_id);
    if (logLines.length) {
      logActivity("Booking edited", `(${g ? g.name : "Guest"}): ${logLines.join(" · ")}`);
    }
    setEditModal(null);
    reload();
  };

  // Multi-room bookings are stored as separate rows sharing the same guest +
  // dates + ref-derivation — grouped here so the list can show ONE combined
  // card per group instead of one per room. computeDisplayGroups (in
  // components.jsx) also splits out cancelled/no-show members into their
  // own standalone units so a cancelled room doesn't inflate its group's
  // combined total/balance, but still shows up under the Cancelled filter.
  const displayGroups = useMemo(() => computeDisplayGroups(bookings), [bookings]);
  const groupFor = (b) => displayGroups.find((members) => members.some((m) => m.id === b.id)) || [b];
  // Filtering applies to the group as a whole (via its primary booking) —
  // a group is one visual/behavioral unit, so it's all-in or all-out.
  const visibleGroups = useMemo(
    () =>
      displayGroups.filter((members) => {
        const primary = members[0];
        if (filter !== "all" && primary.status !== filter) return false;
        const compareValue = dateField === "created_at" ? (primary.created_at || "").slice(0, 10) : primary.check_in;
        if (dateFrom && compareValue < dateFrom) return false;
        if (dateTo && compareValue > dateTo) return false;
        return true;
      }),
    [displayGroups, filter, dateField, dateFrom, dateTo]
  );

  // On-demand confirmation PDF — pulls in every booking in the same group
  // so a multi-room stay gets one combined PDF no matter which room's card
  // the button was clicked from.
  const downloadConfirmationFor = async (b) => {
    const ordered = groupFor(b);
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
        <Field label="Filter dates by">
          <div style={{ display: "flex", gap: 6 }}>
            <Button variant={dateField === "check_in" ? "primary" : "ghost"} onClick={() => setDateField("check_in")}>
              Check-in date
            </Button>
            <Button variant={dateField === "created_at" ? "primary" : "ghost"} onClick={() => setDateField("created_at")}>
              Booked-on date
            </Button>
          </div>
        </Field>
        <Field label={dateField === "created_at" ? "From (booked on)" : "From (check-in date)"}>
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

      {/* Bulk delete only offered while looking at exactly the Cancelled/
          No-show filter — deleting is a permanent cleanup action on
          bookings that are already terminal, not something to expose
          while browsing live bookings. */}
      {role === "owner" && (filter === "cancelled" || filter === "no-show") && selectedForDelete.size > 0 && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10, background: "#fff2ee",
            border: "1px solid rgba(166,69,47,0.35)", borderRadius: 8, padding: "10px 14px", marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedForDelete.size} selected</span>
          <Button
            variant="danger"
            onClick={() => setDeleteModal(bookings.filter((b) => selectedForDelete.has(b.id)))}
          >
            Delete selected
          </Button>
          <Button variant="ghost" onClick={() => setSelectedForDelete(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      {visibleGroups.length === 0 ? (
        <EmptyState text="No bookings match this view." />
      ) : (
        visibleGroups.map((members) => {
          const primary = members[0];
          const g = guestOf(primary.guest_id);
          const isMulti = members.length > 1;
          // Cancelled/no-show members always land in their own 1-member unit
          // (see computeDisplayGroups in components.jsx), so delete always
          // targets a single row — no multi-room case to handle here.
          const isCancelledOrNoShow = primary.status === "cancelled" || primary.status === "no-show";
          const canBulkSelect = role === "owner" && isCancelledOrNoShow && (filter === "cancelled" || filter === "no-show");
          const combinedTotal = members.reduce((s, m) => s + (m.total || 0), 0);
          const combinedPaid = members.reduce((s, m) => s + sumPayments(m), 0);
          const combinedBalance = combinedTotal - combinedPaid;
          const combinedDiscount = members.reduce((s, m) => s + (m.discount || 0), 0);
          const combinedItemsTotal = members.reduce((s, m) => s + (m.items_total || 0), 0);
          const totalGuests = members.reduce((s, m, i) => s + (i === 0 ? 1 : 0) + (m.co_guests_count || 0), 0);
          const isHighlighted = members.some((m) => m.id === highlightId);
          return (
            <div
              className="card"
              key={primary.id}
              id={`booking-${primary.id}`}
              style={{ flexDirection: "column", alignItems: "stretch", ...(isHighlighted ? { outline: "2px solid var(--brass)", background: "#fff8ea" } : {}) }}
            >
              {/* Hidden anchors so global search can scroll/highlight this
                  group card no matter which sibling booking id it targets. */}
              {members.slice(1).map((m) => (
                <span key={m.id} id={`booking-${m.id}`} />
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                {canBulkSelect && (
                  <input
                    type="checkbox"
                    checked={selectedForDelete.has(primary.id)}
                    onChange={(e) =>
                      setSelectedForDelete((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(primary.id);
                        else next.delete(primary.id);
                        return next;
                      })
                    }
                    style={{ width: 16, height: 16 }}
                  />
                )}
                <div className="card-col">
                  <div className="title">
                    {g ? g.name : "Guest removed"} {g?.vip && "⭐"}
                    {isMulti && (
                      <span
                        style={{
                          marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: "#fff",
                          background: "var(--ink)", borderRadius: 999, padding: "2px 8px",
                        }}
                      >
                        {members.length} rooms
                      </span>
                    )}
                  </div>
                  <div className="sub">{g ? g.phone : ""}</div>
                  {primary.booking_ref && (
                    <div style={{ fontSize: 10.5, color: "var(--brass)", fontFamily: "var(--font-mono)" }}>Ref: {primary.booking_ref}</div>
                  )}
                  {primary.bill_no && (
                    <div style={{ fontSize: 10.5, color: "var(--ink45)", fontFamily: "var(--font-mono)" }}>Bill No: {primary.bill_no}</div>
                  )}
                  {primary.created_at && (
                    <div style={{ fontSize: 10.5, color: "var(--ink45)" }}>Booked on {fmtDate(primary.created_at.slice(0, 10))}</div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 170 }}>
                  {members.map((m, i) => {
                    const r = roomOf(m.room_id);
                    const occ = (i === 0 ? 1 : 0) + (m.co_guests_count || 0);
                    return (
                      <div key={m.id} style={{ fontSize: 12.5, color: "var(--ink70)" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{r ? r.number : "—"}</span>{" "}
                        ({occ} guest{occ === 1 ? "" : "s"})
                        {m.discount > 0 && <span style={{ color: "var(--brass)" }}> · −{currency(m.discount)}</span>}
                      </div>
                    );
                  })}
                </div>
                <span style={{ fontSize: 13, color: "var(--ink70)", width: 190 }}>
                  {fmtDate(primary.check_in)} → {fmtDate(primary.check_out)}
                </span>
                <div style={{ width: 100 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{currency(combinedTotal)}</div>
                  {combinedDiscount > 0 && (
                    <div style={{ fontSize: 10.5, color: "var(--brass)" }}>−{currency(combinedDiscount)} off</div>
                  )}
                </div>
                <span style={{ fontSize: 11.5, color: "var(--ink45)" }}>
                  {totalGuests} guest{totalGuests === 1 ? "" : "s"}
                </span>
                {(primary.checked_in_at || primary.checked_out_at) && (
                  <div style={{ fontSize: 10.5, color: "var(--ink45)" }}>
                    {primary.checked_in_at && <>In: {fmtDateTime(primary.checked_in_at)} </>}
                    {primary.checked_out_at && <>· Out: {fmtDateTime(primary.checked_out_at)}</>}
                  </div>
                )}
                {combinedItemsTotal > 0 && (
                  <span style={{ fontSize: 11.5, color: "var(--brass)" }}>+{currency(combinedItemsTotal)} items</span>
                )}
                {primary.early_checkin && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "var(--brass)", borderRadius: 999, padding: "2px 9px" }}>
                    ⚡ Early check-in {primary.early_checkin_fee > 0 ? `(+${currency(primary.early_checkin_fee)})` : ""}
                  </span>
                )}
                {primary.late_checkout && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "var(--rust)", borderRadius: 999, padding: "2px 9px" }}>
                    ⏰ Late checkout {primary.late_checkout_fee > 0 ? `(+${currency(primary.late_checkout_fee)})` : ""}
                  </span>
                )}
                <Pill color={BOOKING_STATUS_COLORS[primary.status] || "#46536b"}>{primary.status}</Pill>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Button variant="ghost" onClick={() => setDetailModal(members)}>
                    Guest details
                  </Button>
                  <Button variant="ghost" onClick={() => downloadConfirmationFor(primary)}>
                    Download confirmation
                  </Button>
                  {primary.status !== "checked-out" && primary.status !== "cancelled" && primary.status !== "no-show" && (
                    <Button variant="ghost" onClick={() => setEditModal(members)}>
                      Edit booking
                    </Button>
                  )}
                  {primary.status === "reserved" && <Button onClick={() => onOpenCheckIn(primary)}>Check in</Button>}
                  {!isMulti && primary.status === "checked-in" && (
                    <Button variant="ghost" onClick={() => setChangeRoomModal(primary)}>
                      Change room
                    </Button>
                  )}
                  {primary.status === "checked-in" && (
                    <Button variant="dark" onClick={() => onOpenCheckOut(primary)}>
                      Check out
                    </Button>
                  )}
                  {(primary.status === "reserved" || primary.status === "checked-in") && (
                    <Button variant="danger" onClick={() => setCancelModal(members)}>
                      Cancel booking
                    </Button>
                  )}
                  {role === "owner" && isCancelledOrNoShow && (
                    <Button variant="danger" onClick={() => setDeleteModal([primary])}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--hairline)", display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5 }}>
                <span>
                  Paid: <strong>{currency(combinedPaid)}</strong>
                </span>
                <span style={{ color: combinedBalance > 0 ? "var(--rust)" : "var(--sage)" }}>
                  Balance: <strong>{currency(Math.max(0, combinedBalance))}</strong>
                </span>
                {members.some((m) => m.deposit > 0) && (
                  <span style={{ color: "var(--brass)" }}>
                    Advance collected: {currency(members.reduce((s, m) => s + (m.deposit || 0), 0))}
                  </span>
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
          groupBookings={editModal}
          allBookings={bookings}
          rooms={rooms}
          maintenanceTickets={maintenanceTickets}
          onClose={() => setEditModal(null)}
          onSave={(d) => saveBookingEditGroup(editModal, d)}
        />
      )}
      {detailModal && (
        <GuestDetailModal
          bookings={detailModal}
          rooms={rooms}
          guest={guestOf(detailModal[0].guest_id)}
          coGuests={coGuests.filter((c) => detailModal.some((m) => m.id === c.booking_id))}
          onClose={() => setDetailModal(null)}
        />
      )}
      {confirmSendModal && (
        <WhatsAppConfirmModal info={confirmSendModal} onClose={() => setConfirmSendModal(null)} />
      )}
      {cancelModal && (
        <CancelBookingModal
          bookings={cancelModal}
          guest={guestOf(cancelModal[0].guest_id)}
          rooms={rooms}
          onClose={() => setCancelModal(null)}
          onConfirm={(reason) => {
            cancelBookingGroup(cancelModal, reason);
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
      {deleteModal && (
        <ConfirmDeleteBookingsModal
          bookingList={deleteModal}
          guests={guests}
          rooms={rooms}
          onClose={() => setDeleteModal(null)}
          onConfirm={() => deleteCancelledBookings(deleteModal)}
        />
      )}
    </div>
  );
}

function CancelBookingModal({ bookings, guest, rooms, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const primary = bookings[0];
  const combinedTotal = bookings.reduce((s, b) => s + (b.total || 0), 0);
  const combinedPaid = bookings.reduce((s, b) => s + sumPayments(b), 0);
  return (
    <Modal title={bookings.length > 1 ? "Cancel booking (all rooms)" : "Cancel booking"} onClose={onClose} width={420}>
      <div style={{ background: "#fff2ee", border: "1px solid rgba(166,69,47,0.35)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--rust)" }}>
          {guest ? guest.name : "Guest"} — Room{bookings.length > 1 ? "s" : ""}{" "}
          {bookings.map((b) => rooms.find((r) => r.id === b.room_id)?.number || "—").join(", ")}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink70)", marginTop: 2 }}>
          {fmtDate(primary.check_in)} → {fmtDate(primary.check_out)} · {currency(combinedTotal)}
        </div>
      </div>
      {combinedPaid > 0 && (
        <div style={{ background: "#fff8ea", border: "1px solid rgba(201,154,60,0.4)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
            ⚠ {currency(combinedPaid)} already paid on this booking
          </div>
          <div style={{ fontSize: 12, color: "var(--ink70)", marginTop: 2 }}>
            Cancelling does NOT refund or reverse this payment — it stays on record exactly as is. If it
            needs to be refunded or reconciled, do that manually from the Billing tab (edit or delete the
            payment entry) after cancelling.
          </div>
        </div>
      )}
      <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: 0 }}>
        {bookings.length > 1
          ? "This cancels ALL rooms in this group (marked \"Cancelled\") instead of deleting them — useful for history and reporting."
          : "This keeps the booking on record (marked \"Cancelled\") instead of deleting it — useful for history and reporting."}
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
// PERMANENT DELETE — owner-only cleanup for already-cancelled/no-show
// bookings. `bookingList` is length 1 for a single-card delete, N for the
// bulk "Delete selected" action — same modal either way.
// ---------------------------------------------------------------
function ConfirmDeleteBookingsModal({ bookingList, guests, rooms, onClose, onConfirm }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const isBulk = bookingList.length > 1;
  const totalPaid = bookingList.reduce((s, b) => s + sumPayments(b), 0);

  return (
    <Modal title={isBulk ? `Permanently delete ${bookingList.length} bookings` : "Permanently delete booking"} onClose={onClose} width={480}>
      <div style={{ background: "#fff2ee", border: "1px solid rgba(166,69,47,0.35)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--rust)" }}>This cannot be undone</div>
        <div style={{ fontSize: 12, color: "var(--ink70)", marginTop: 4 }}>
          Permanently erases {isBulk ? "these bookings" : "this booking"} and everything linked to {isBulk ? "them" : "it"} —
          payments, co-guests, service charges, and inventory usage.
          {totalPaid > 0 && ` ${currency(totalPaid)} in payment history will be permanently erased.`}
        </div>
      </div>
      {isBulk && (
        <div style={{ maxHeight: 140, overflowY: "auto", border: "1px solid var(--hairline)", borderRadius: 8, marginBottom: 14 }}>
          {bookingList.map((b) => {
            const g = guests.find((x) => x.id === b.guest_id);
            const r = rooms.find((x) => x.id === b.room_id);
            return (
              <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", borderBottom: "1px solid var(--hairline)", fontSize: 12 }}>
                <span>{g ? g.name : "Guest removed"} — Room {r ? r.number : "—"}</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>{currency(sumPayments(b))} paid</span>
              </div>
            );
          })}
        </div>
      )}
      <p style={{ fontSize: 12.5, color: "var(--ink45)" }}>
        A backup Excel file with full booking and payment details downloads automatically before deleting — nothing
        is lost, it just won't be visible in the app anymore.
      </p>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: 2 }} />
        I understand this permanently deletes {isBulk ? "these bookings" : "this booking"} and cannot be undone.
      </label>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={!checked || busy}
          onClick={async () => {
            setBusy(true);
            await onConfirm();
            setBusy(false);
          }}
        >
          {busy ? "Deleting…" : "Delete permanently"}
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

// groupBookings: every room currently in this guest's group (primary first,
// 1 or more) — Edit now works the same way New Booking does: one form for
// the whole group, with the same room-rows UI (add/remove rooms) instead of
// being limited to the single room that happened to be clicked.
function EditBookingModal({ groupBookings, allBookings, rooms, maintenanceTickets, onClose, onSave }) {
  const primary = groupBookings[0];
  const [checkIn, setCheckIn] = useState(primary.check_in);
  const [checkOut, setCheckOut] = useState(primary.check_out);
  const [source, setSource] = useState(primary.source || BOOKING_SOURCES[0]);
  const [bookingRef, setBookingRef] = useState(primary.booking_ref || "");
  const [discount, setDiscount] = useState(primary.discount || 0);
  const [discountReason, setDiscountReason] = useState(primary.discount_reason || "");
  const [depositNow, setDepositNow] = useState(0);
  const [depositMode, setDepositMode] = useState(PAYMENT_MODES[0]);

  // The original deposit is just the payment inserted at booking-creation
  // time (see createBooking) — identified here by matching amount+mode
  // against the bookings.deposit/deposit_mode snapshot. If that payment has
  // since been edited/deleted independently (e.g. from Billing), no match is
  // found and we fall back to a read-only note instead of silently editing
  // the wrong payment row.
  const depositPayment =
    primary.deposit > 0
      ? (primary.payments || []).find((p) => p.amount === primary.deposit && p.mode === primary.deposit_mode) || null
      : null;
  const [depositAmount, setDepositAmount] = useState(depositPayment ? depositPayment.amount : primary.deposit || 0);
  const [depositModeEdit, setDepositModeEdit] = useState(depositPayment ? depositPayment.mode : primary.deposit_mode || PAYMENT_MODES[0]);

  // Maintenance rooms are normally excluded, but a room the group already
  // holds stays selectable even if it's since been flagged for maintenance.
  const bookableRooms = useMemo(
    () => rooms.filter((r) => r.status !== "maintenance" || groupBookings.some((m) => m.room_id === r.id)),
    [rooms, groupBookings]
  );
  // Overlap-check against every OTHER booking — excluding this group's own
  // rows, so the rooms it already holds don't count as "taken" by itself.
  const bookingsExcludingGroup = useMemo(
    () => allBookings.filter((b) => !groupBookings.some((m) => m.id === b.id)),
    [allBookings, groupBookings]
  );
  const availableForDates = useMemo(
    () => bookableRooms.filter((r) => isRoomAvailableForDates(r.id, checkIn, checkOut, bookingsExcludingGroup, undefined, r.status)),
    [bookableRooms, bookingsExcludingGroup, checkIn, checkOut]
  );

  // One row per existing booking in the group (primary first, unchanged
  // order), plus any rows added/removed during this edit.
  const [roomRows, setRoomRows] = useState(() =>
    groupBookings.map((b) => ({ key: b.id, bookingId: b.id, roomId: b.room_id, coGuestsCount: b.co_guests_count || 0, removed: false }))
  );
  const nextRowKeyRef = useRef(1);

  useEffect(() => {
    // Dates changed — drop any active row whose room is no longer available
    // for the new dates (or collided with another row) and backfill.
    setRoomRows((prev) => {
      const used = new Set();
      return prev.map((row) => {
        if (row.removed) return row;
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

  const updateRoomRow = (key, patch) => setRoomRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRoomRow = () => {
    const usedIds = new Set(roomRows.filter((r) => !r.removed).map((r) => r.roomId).filter(Boolean));
    const nextRoom = availableForDates.find((r) => !usedIds.has(r.id));
    setRoomRows((prev) => [...prev, { key: `new-${nextRowKeyRef.current}`, bookingId: null, roomId: nextRoom?.id || "", coGuestsCount: 0, removed: false }]);
    nextRowKeyRef.current += 1;
  };
  // A never-saved new row is dropped outright; an existing booking is
  // flagged for cancellation on save (and can be undone before then).
  const removeRoomRow = (key) =>
    setRoomRows((prev) => prev.map((r) => (r.key === key ? { ...r, removed: true } : r)).filter((r) => r.bookingId || !r.removed));
  const restoreRoomRow = (key) => updateRoomRow(key, { removed: false });

  const activeRows = roomRows.filter((r) => !r.removed);
  const canAddRoom = availableForDates.length > activeRows.length;
  const nights = nightsBetween(checkIn, checkOut);
  const rowDetails = activeRows.map((row, idx) => {
    const room = rooms.find((r) => r.id === row.roomId);
    const occupancy = (idx === 0 ? 1 : 0) + (Number(row.coGuestsCount) || 0);
    const rate = room ? computeRoomRate(room, occupancy) : 0;
    const ticket = room ? (maintenanceTickets || []).find((t) => t.room_id === room.id && t.status !== "Resolved") : null;
    return { row, room, occupancy, rate, subtotal: rate * nights, ticket };
  });
  const grandSubtotal = rowDetails.reduce((s, d) => s + d.subtotal, 0);
  const clampedDiscount = rowDetails.length ? Math.max(0, Math.min(rowDetails[0].subtotal, Number(discount) || 0)) : 0;
  const grandTotal = grandSubtotal - clampedDiscount;
  // Renaming the shared reference is only offered when the group is (and
  // stays) a single room — a multi-room ref rename would need to cascade
  // "-2"/"-3" suffixes across siblings, which isn't worth the complexity.
  const refEditable = groupBookings.length === 1 && activeRows.length === 1;
  const allRowsHaveRoom = activeRows.every((row) => row.roomId);

  const submit = () => {
    if (checkOut < checkIn) return alert("Check-out can't be before check-in.");
    if (!bookingRef.trim()) return alert("Booking ID / reference is required.");
    if (activeRows.length === 0) return alert("At least one room must remain — use \"Cancel booking\" from the list instead if you want to remove the whole booking.");
    if (!allRowsHaveRoom) return alert("Select a room for every row (or remove the row) — no room is available for one of them.");

    const ticketsHit = rowDetails.filter((d) => d.ticket);
    if (ticketsHit.length) {
      const lines = ticketsHit
        .map((d) => `Room ${d.room?.number || ""}: "${d.ticket.issue}" (Priority: ${d.ticket.priority}, Status: ${d.ticket.status})`)
        .join("\n");
      const proceed = confirm(
        `⚠ ${ticketsHit.length > 1 ? "These rooms have" : "This room has"} an open maintenance issue:\n\n${lines}\n\nSave anyway?`
      );
      if (!proceed) return;
    }
    if (checkIn < todayISO()) {
      const proceed = confirm(
        `⚠ Check-in date (${checkIn}) is in the past.\n\nThis is allowed, but double-check it's correct.\n\nContinue?`
      );
      if (!proceed) return;
    }
    if (depositPayment && Number(depositAmount) < 0) return alert("Deposit amount can't be negative.");

    const depositChanged = depositPayment && (Number(depositAmount) !== depositPayment.amount || depositModeEdit !== depositPayment.mode);

    onSave({
      checkIn,
      checkOut,
      source,
      bookingRef: bookingRef.trim(),
      discount: Number(discount) || 0,
      discountReason: discountReason.trim(),
      depositNow: Number(depositNow) || 0,
      depositMode,
      rows: roomRows.map((r) => ({ ...r, coGuestsCount: Number(r.coGuestsCount) || 0 })),
      depositEdit: depositChanged ? { paymentId: depositPayment.id, amount: Number(depositAmount), mode: depositModeEdit } : null,
    });
  };

  return (
    <Modal title="Edit booking" onClose={onClose} width={560}>
      <div className="grid-2">
        <Field label="Check-in">
          <input className="input" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </Field>
        <Field label="Check-out">
          <input className="input" type="date" min={checkIn} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </Field>
      </div>
      {checkIn < todayISO() && (
        <p style={{ fontSize: 12, color: "var(--brass)", marginTop: 6 }}>
          ⚠ This check-in date is in the past — allowed, but double-check it's what you meant.
        </p>
      )}

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink70)", letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: 8 }}>
          Room{activeRows.length > 1 ? "s" : ""} ({availableForDates.length} available for these dates)
        </div>
        {roomRows.map((row) => {
          if (row.removed) {
            const removedRoom = rooms.find((r) => r.id === row.roomId);
            return (
              <div
                key={row.key}
                style={{ marginBottom: 10, background: "#fff2ee", border: "1px solid rgba(166,69,47,0.35)", borderRadius: 8, padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ fontSize: 12.5, color: "var(--rust)" }}>
                  Room {removedRoom ? removedRoom.number : "—"} will be removed from this booking on save
                </span>
                <Button variant="ghost" onClick={() => restoreRoomRow(row.key)}>
                  Undo
                </Button>
              </div>
            );
          }
          const idx = activeRows.findIndex((r) => r.key === row.key);
          const detail = rowDetails[idx];
          const usedByOthers = new Set(activeRows.filter((r) => r.key !== row.key).map((r) => r.roomId).filter(Boolean));
          const options = availableForDates.filter((r) => r.id === row.roomId || !usedByOthers.has(r.id));
          const canRemove = row.bookingId !== primary.id; // the primary room anchors the group and can't be removed here
          return (
            <div key={row.key} style={{ marginBottom: 10, background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: 10 }}>
              <div className="grid-2">
                <Field label={activeRows.length > 1 ? `Room ${idx + 1}${!row.bookingId ? " (new)" : ""}` : "Room"}>
                  <select className="input" value={row.roomId} onChange={(e) => updateRoomRow(row.key, { roomId: e.target.value })}>
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
                        onChange={(e) => updateRoomRow(row.key, { coGuestsCount: Math.max(0, Number(e.target.value)) })}
                      />
                    </Field>
                  </div>
                  {canRemove && (
                    <button
                      type="button"
                      onClick={() => removeRoomRow(row.key)}
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
              {detail?.room && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--ink70)" }}>
                  {detail.occupancy} guest{detail.occupancy > 1 ? "s" : ""} · Rate/night: <strong>{currency(detail.rate)}</strong> · {nights} night{nights > 1 ? "s" : ""} ·
                  Total: <strong>{currency(detail.subtotal)}</strong>
                </div>
              )}
              {detail?.ticket && (
                <div style={{ marginTop: 8, background: "#fff2ee", border: "1px solid rgba(166,69,47,0.35)", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
                  ⚠ <strong>Room {detail.room?.number} has an open maintenance issue:</strong> "{detail.ticket.issue}" (Priority: {detail.ticket.priority}, Status: {detail.ticket.status})
                </div>
              )}
            </div>
          );
        })}
        {canAddRoom && (
          <Button variant="ghost" onClick={addRoomRow}>
            + Add another room
          </Button>
        )}
        {activeRows.length > 1 && (
          <div style={{ marginTop: 4, fontSize: 13, textAlign: "right" }}>
            Grand total ({activeRows.length} rooms): <strong>{currency(grandTotal)}</strong>
          </div>
        )}
      </div>

      {primary.deposit > 0 && (
        <div style={{ marginTop: 14, background: "#fff8ea", border: "1px solid rgba(201,154,60,0.4)", borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink70)", letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: 8 }}>
            Advance / deposit
          </div>
          {depositPayment ? (
            <div className="grid-2">
              <Field label="Amount">
                <input className="input" type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
              </Field>
              <Field label="Mode">
                <select className="input" value={depositModeEdit} onChange={(e) => setDepositModeEdit(e.target.value)}>
                  {PAYMENT_MODES.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--ink45)", margin: 0 }}>
              {currency(primary.deposit)} via {primary.deposit_mode || "Cash"} — this deposit's original payment entry has since changed;
              edit it from the Billing tab instead.
            </p>
          )}
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
        <Field label="Record additional payment now (optional)">
          <input className="input" type="number" value={depositNow} onChange={(e) => setDepositNow(e.target.value)} />
        </Field>
      </div>
      {Number(depositNow) > 0 && (
        <div style={{ marginTop: 14 }}>
          <Field label="Payment mode">
            <select className="input" value={depositMode} onChange={(e) => setDepositMode(e.target.value)}>
              {PAYMENT_MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
        </div>
      )}

      <div className="grid-2" style={{ marginTop: 14 }}>
        <Field label={activeRows.length > 1 ? "Discount (applied to first room only)" : "Discount"}>
          <input className="input" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
        {Number(discount) > 0 && (
          <Field label="Discount reason (optional)">
            <input className="input" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
          </Field>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <Field label={refEditable ? "Booking ID / reference" : "Booking ID / reference (shared across rooms — not editable here)"}>
          <input className="input" value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} disabled={!refEditable} />
        </Field>
      </div>

      <p style={{ fontSize: 13, marginTop: 14 }}>
        {nights} night{nights > 1 ? "s" : ""}
        {clampedDiscount > 0 && (
          <>
            {" "}
            · Discount: <strong>{currency(clampedDiscount)}</strong>
          </>
        )}{" "}
        · New total: <strong>{currency(grandTotal)}</strong>
      </p>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!allRowsHaveRoom} onClick={submit}>
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
// bookings: every room in the group being checked in together (primary
// first, 1 or more). The main guest's ID is captured ONCE — they're one
// physical person regardless of how many rooms they've booked — while
// co-guests are captured per room, since each room's co-guests differ.
export function CheckInModal({ bookings, guest, rooms, coGuestsByBooking, onClose, onConfirm }) {
  const [guestFront, setGuestFront] = useState(null);
  const [guestBack, setGuestBack] = useState(null);
  const [guestFrontUrl, setGuestFrontUrl] = useState(null);
  const [guestBackUrl, setGuestBackUrl] = useState(null);
  const [roomForms, setRoomForms] = useState(() =>
    bookings.map((b) => {
      const existing = coGuestsByBooking[b.id] || [];
      const slots = Math.max(b.co_guests_count || 0, existing.length);
      return {
        bookingId: b.id,
        coForms: Array.from({ length: slots }, (_, i) => ({
          id: existing[i]?.id || null,
          name: existing[i]?.name || "",
          frontFile: null,
          backFile: null,
          frontUrl: null,
          backUrl: null,
          existingFrontPath: existing[i]?.id_proof_front_path || null,
          existingBackPath: existing[i]?.id_proof_back_path || null,
        })),
      };
    })
  );
  const [saving, setSaving] = useState(false);
  // All rooms in a group share identical check-in/out dates, so "early" is
  // the same call for every one of them — determine it once from the first.
  const early = isEarlyCheckin(bookings[0]);
  const [earlyFee, setEarlyFee] = useState(0);
  const balance = bookings.reduce((s, b) => s + (b.total - sumPayments(b)), 0);

  useEffect(() => {
    if (guest?.id_proof_front_path) {
      getIdProofSignedUrl(guest.id_proof_front_path).then(({ data }) => data && setGuestFrontUrl(data.signedUrl));
    }
    if (guest?.id_proof_back_path) {
      getIdProofSignedUrl(guest.id_proof_back_path).then(({ data }) => data && setGuestBackUrl(data.signedUrl));
    }
    roomForms.forEach((rf, ri) => {
      rf.coForms.forEach((f, fi) => {
        if (f.existingFrontPath) {
          getIdProofSignedUrl(f.existingFrontPath).then(({ data }) => {
            if (data) updateCoForm(ri, fi, { frontUrl: data.signedUrl });
          });
        }
        if (f.existingBackPath) {
          getIdProofSignedUrl(f.existingBackPath).then(({ data }) => {
            if (data) updateCoForm(ri, fi, { backUrl: data.signedUrl });
          });
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateCoForm = (roomIdx, coIdx, patch) => {
    setRoomForms((prev) =>
      prev.map((rf, ri) => (ri !== roomIdx ? rf : { ...rf, coForms: rf.coForms.map((f, i) => (i !== coIdx ? f : { ...f, ...patch })) }))
    );
  };

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
      for (const rf of roomForms) {
        for (const f of rf.coForms) {
          if (!f.name.trim() && !f.frontFile && !f.backFile) continue;
          let frontPath = f.existingFrontPath;
          let backPath = f.existingBackPath;
          if (f.frontFile) {
            frontPath = `co-guest-${rf.bookingId}-front-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`;
            await uploadIdProof(frontPath, f.frontFile);
          }
          if (f.backFile) {
            backPath = `co-guest-${rf.bookingId}-back-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`;
            await uploadIdProof(backPath, f.backFile);
          }
          if (f.id) {
            await updateCoGuest(f.id, { name: f.name.trim(), id_proof_front_path: frontPath, id_proof_back_path: backPath });
          } else if (f.name.trim() || frontPath || backPath) {
            await addCoGuest({ booking_id: rf.bookingId, name: f.name.trim(), id_proof_front_path: frontPath, id_proof_back_path: backPath });
          }
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
    <Modal title={bookings.length > 1 ? `Check-in — ${bookings.length} rooms` : "Check-in — verify ID"} onClose={onClose} width={560}>
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

      {roomForms.map((rf, ri) => {
        const b = bookings[ri];
        const r = rooms.find((x) => x.id === b.room_id);
        return (
          <div key={b.id}>
            {bookings.length > 1 && (
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink70)", textTransform: "uppercase", margin: "12px 0 6px" }}>
                Room {r ? r.number : "—"}
              </div>
            )}
            {rf.coForms.length === 0 && bookings.length > 1 && (
              <p style={{ fontSize: 12, color: "var(--ink45)", margin: "0 0 8px" }}>No co-guests for this room.</p>
            )}
            {rf.coForms.map((f, fi) => (
              <div key={fi} style={{ background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
                <Field label={`Co-guest ${fi + 1} name`}>
                  <input className="input" value={f.name} onChange={(e) => updateCoForm(ri, fi, { name: e.target.value })} />
                </Field>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  <IdCaptureField
                    label="ID proof — front"
                    file={f.frontFile}
                    existingUrl={f.frontUrl}
                    onFile={(file) => updateCoForm(ri, fi, { frontFile: file })}
                  />
                  <IdCaptureField
                    label="ID proof — back"
                    file={f.backFile}
                    existingUrl={f.backUrl}
                    onFile={(file) => updateCoForm(ri, fi, { backFile: file })}
                  />
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={saving} onClick={confirm_}>
          {saving ? "Saving…" : bookings.length > 1 ? `Confirm check-in (${bookings.length} rooms)` : "Confirm check-in"}
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
// CHECK-OUT — balance warning + late checkout fee if applicable.
// Exported so it can be triggered from Dashboard too.
// ---------------------------------------------------------------
// bookings: every room in the group being checked out together (1 or more).
export function CheckOutModal({ bookings, onClose, onConfirm }) {
  const balance = bookings.reduce((s, b) => s + (b.total - sumPayments(b)), 0);
  const late = isLateCheckout(bookings[0]);
  const [lateFee, setLateFee] = useState(0);

  return (
    <Modal title={bookings.length > 1 ? `Check-out — ${bookings.length} rooms` : "Check-out"} onClose={onClose} width={400}>
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
          {bookings.length > 1 ? `Confirm check-out (${bookings.length} rooms)` : "Confirm check-out"}
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
// GUEST DETAIL — view everything on file for a booking: main guest,
// co-guests, and their scanned ID photos.
// ---------------------------------------------------------------
// bookings: every room in the guest's group (1 or more) — the main guest's
// ID is shown once, co-guests are shown per room they're actually staying in.
function GuestDetailModal({ bookings, rooms, guest, coGuests, onClose }) {
  const [guestFrontUrl, setGuestFrontUrl] = useState(null);
  const [guestBackUrl, setGuestBackUrl] = useState(null);
  const [coUrls, setCoUrls] = useState({});
  const totalCoGuestsExpected = bookings.reduce((s, b) => s + (b.co_guests_count || 0), 0);

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
          {totalCoGuestsExpected > 0 ? "Co-guest details haven't been captured yet — do this at check-in." : "No co-guests on this booking."}
        </p>
      ) : (
        bookings.map((b) => {
          const roomCoGuests = coGuests.filter((c) => c.booking_id === b.id);
          if (roomCoGuests.length === 0) return null;
          const r = rooms.find((x) => x.id === b.room_id);
          return (
            <div key={b.id}>
              {bookings.length > 1 && (
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink70)", textTransform: "uppercase", margin: "10px 0 6px" }}>
                  Room {r ? r.number : "—"}
                </div>
              )}
              {roomCoGuests.map((c) => (
                <div key={c.id} style={{ background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: 14, marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 6 }}>{c.name || "Co-guest"}</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    {coUrls[c.id + "_front"] && <img src={coUrls[c.id + "_front"]} alt="ID front" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6 }} />}
                    {coUrls[c.id + "_back"] && <img src={coUrls[c.id + "_back"]} alt="ID back" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6 }} />}
                  </div>
                  {!coUrls[c.id + "_front"] && !coUrls[c.id + "_back"] && <div style={{ fontSize: 11.5, color: "var(--rust)" }}>No ID proof on file yet</div>}
                </div>
              ))}
            </div>
          );
        })
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
// single-room booking just passes a 1-length array. `settings` also carries
// the "Print on Bill" toggles (pdf_show_*, all default ON — see Settings.jsx)
// that decide which optional sections below actually render.
function downloadBookingConfirmation(entries, guest, settings) {
  const show = (key) => settings[key] !== false;
  const doc = new jsPDF();
  const NAVY = [22, 35, 58];
  const BRASS = [184, 134, 63];
  const LIGHT = [246, 241, 231];
  const first = entries[0].booking;
  const multi = entries.length > 1;
  const gstPercent = Number(settings.gst_percent || 0);

  // Booking ID / Reference ID / Bill No. are three distinct identifiers —
  // Booking ID is the system's own short id, Reference ID is the
  // guest/OTA-facing ref the form calls "Booking ID / reference", and Bill
  // No. is the sequential accounting number (see Settings → Bill Numbering).
  // Computed up front because the navy header band has to grow to fit
  // however many of these are toggled on — with all of them on (the
  // default), 4 lines don't fit the old fixed 38mm band and the last one
  // (usually Bill No.) spills onto white background where its light header
  // color is unreadable.
  const headerLines = [`Date: ${fmtDate(todayISO())}`];
  if (show("pdf_show_reference_id") && first.booking_ref) headerLines.push(`Ref: ${first.booking_ref}`);
  if (show("pdf_show_booking_id")) headerLines.push(`Booking ID: ${first.id.slice(0, 8).toUpperCase()}`);
  if (show("pdf_show_bill_no") && first.bill_no) headerLines.push(`Bill No: ${first.bill_no}`);
  const bandHeight = Math.max(38, 24 + (headerLines.length - 1) * 6 + 8);

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, bandHeight, "F");

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
  headerLines.forEach((line, i) => doc.text(line, 196, 24 + i * 6, { align: "right" }));

  const boxY = bandHeight + 8;
  doc.setFillColor(...LIGHT);
  doc.roundedRect(14, boxY, 182, 32, 2, 2, "F");
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(guest ? guest.name : "Guest", 20, boxY + 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(70, 83, 107);
  doc.text(guest?.phone || "", 20, boxY + 15);
  if (guest?.email) doc.text(guest.email, 20, boxY + 21);
  const roomsLabel = entries.map(({ room }) => (room ? `${room.number} (${room.type})` : "—")).join(", ");
  doc.text(`Room${multi ? "s" : ""}: ${roomsLabel}`, 110, boxY + 9);
  doc.text(`${fmtDate(first.check_in)}  to  ${fmtDate(first.check_out)}  (${first.nights} night${first.nights > 1 ? "s" : ""})`, 110, boxY + 15);
  const totalGuests = entries.reduce((s, e, i) => s + entryOccupancy(e, i), 0);
  const guestSourceParts = [];
  if (show("pdf_show_occupancy")) guestSourceParts.push(`${totalGuests} guest${totalGuests > 1 ? "s" : ""}`);
  if (first.source) guestSourceParts.push(`Source: ${first.source}`);
  if (guestSourceParts.length) doc.text(guestSourceParts.join("  ·  "), 110, boxY + 21);

  // Each room's own occupancy shows next to its charge line (e.g. "Room 202
  // (3 guests)"). Discount/deposit/total move to the summary block below —
  // this table is just the per-room room-charge breakdown.
  const bodyRows = entries.map(({ booking, room }, i) => {
    const occ = entryOccupancy({ booking }, i);
    const occLabel = show("pdf_show_occupancy") ? ` (${occ} guest${occ === 1 ? "" : "s"})` : "";
    return [
      `Room ${room ? room.number : "—"}${occLabel} — ${pdfMoney(booking.rate)} x ${booking.nights} night${booking.nights > 1 ? "s" : ""}`,
      pdfMoney(booking.subtotal ?? booking.total),
    ];
  });

  autoTable(doc, {
    startY: boxY + 42,
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

  // Full breakdown: Subtotal, Discount (only the primary room ever carries
  // one — see createBooking), Total, then GST/deposit/paid/balance below.
  const subtotalSum = entries.reduce((s, { booking }) => s + (booking.subtotal ?? booking.total ?? 0), 0);
  const discountSum = entries.reduce((s, { booking }) => s + (booking.discount || 0), 0);
  const grandTotal = entries.reduce((s, { booking }) => s + (booking.total || 0), 0);
  const depositSum = entries.reduce((s, { booking }) => s + (booking.deposit || 0), 0);
  const totalPaid = entries.reduce((s, { booking }) => s + sumPayments(booking), 0);
  const balance = grandTotal - totalPaid;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(70, 83, 107);
  doc.text("Subtotal", 120, y);
  doc.text(pdfMoney(subtotalSum), 196, y, { align: "right" });
  y += 6;

  if (discountSum > 0) {
    doc.setTextColor(...BRASS);
    doc.text("Discount" + (first.discount_reason ? ` (${first.discount_reason})` : ""), 120, y);
    doc.text(`- ${pdfMoney(discountSum)}`, 196, y, { align: "right" });
    y += 6;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(multi ? "Grand total" : "Total", 120, y);
  doc.text(pdfMoney(grandTotal), 196, y, { align: "right" });
  y += 6;

  // Room rate is tax-inclusive — the total stays exactly what's charged; GST
  // is shown as a breakdown pulled out of that total, same as the Tax
  // Invoice PDF in Billing.jsx.
  if (gstPercent > 0 && show("pdf_show_gst")) {
    const { base, gst } = splitInclusiveGst(grandTotal, gstPercent);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`(incl. GST ${gstPercent}%: ${pdfMoney(gst)} · taxable value: ${pdfMoney(base)})`, 120, y);
    y += 7;
  }

  if (show("pdf_show_deposit") && depositSum > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...BRASS);
    doc.text(`Deposit / advance paid (${first.deposit_mode || "Cash"})`, 120, y);
    doc.text(pdfMoney(depositSum), 196, y, { align: "right" });
    y += 6;
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
  y += 12;

  // Payment trail — every payment with its date and mode, not just the total
  if (show("pdf_show_payment_trail")) {
    const allPayments = entries.flatMap(({ booking, room }) =>
      (booking.payments || []).map((p) => ({ ...p, roomNumber: room?.number || "—" }))
    );
    if (allPayments.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...NAVY);
      doc.text("Payment history", 14, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: multi ? [["Date", "Room", "Mode", "Amount"]] : [["Date", "Mode", "Amount"]],
        body: allPayments.map((p) =>
          multi ? [fmtDate(p.paid_on), p.roomNumber, p.mode, pdfMoney(p.amount)] : [fmtDate(p.paid_on), p.mode, pdfMoney(p.amount)]
        ),
        theme: "striped",
        styles: { fontSize: 8.5 },
        margin: { left: 14, right: 14 },
        tableWidth: multi ? 140 : 100,
      });
      y = doc.lastAutoTable.finalY + 8;
    }
  }

  if (y > 255) {
    doc.addPage();
    y = 20;
  }

  doc.setDrawColor(220, 220, 220);
  doc.line(14, y, 196, y);
  y += 7;
  if (show("pdf_show_checkin_checkout_time")) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(120, 120, 120);
    doc.text("Check-in: 12:00 PM · Check-out: 11:00 AM", 14, y);
    y += 7;
  }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text("This confirms your reservation. We look forward to hosting you!", 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`Generated on ${fmtDate(todayISO())}`, 196, y, { align: "right" });

  doc.save(`booking_confirmation_${(guest?.name || "guest").replace(/\s+/g, "_")}_${first.check_in}.pdf`);
}
