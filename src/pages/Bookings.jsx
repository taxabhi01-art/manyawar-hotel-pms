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
  nightsBetween,
  todayISO,
  isRoomAvailableForDates,
  computeRoomRate,
  BOOKING_SOURCES,
} from "../components.jsx";
import {
  addBooking,
  updateBooking,
  deleteBooking,
  addGuest,
  updateGuest,
  updateRoom,
  addTask,
  addCoGuest,
  updateCoGuest,
  uploadIdProof,
  getIdProofSignedUrl,
} from "../lib/api.js";

export default function Bookings({ rooms, guests, bookings, coGuests, reload }) {
  const [modal, setModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [checkInModal, setCheckInModal] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);

  const roomOf = (id) => rooms.find((r) => r.id === id);
  const guestOf = (id) => guests.find((g) => g.id === id);
  const bookableRooms = rooms.filter((r) => r.status !== "maintenance");

  const createBooking = async ({ guest, roomId, checkIn, checkOut, source, deposit, coGuestsCount }) => {
    setBusy(true);
    let guestId = guest.id;
    if (!guestId) {
      const { data } = await addGuest(guest);
      guestId = data?.id;
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
      deposit_refunded: false,
      co_guests_count: coGuestsCount || 0,
    });
    setBusy(false);
    setModal(null);
    reload();
  };

  const finishCheckIn = async (booking) => {
    await updateBooking(booking.id, { status: "checked-in" });
    await updateRoom(booking.room_id, { status: "occupied" });
    setCheckInModal(null);
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
              {b.deposit > 0 && (
                <span style={{ fontSize: 11.5, color: b.deposit_refunded ? "var(--ink45)" : "var(--brass)" }}>
                  Deposit {currency(b.deposit)}
                  {b.deposit_refunded ? " (refunded)" : ""}
                </span>
              )}
              <Pill color={b.status === "reserved" ? "#c99a3c" : b.status === "checked-in" ? "#5f8863" : "#46536b"}>{b.status}</Pill>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Button variant="ghost" onClick={() => setDetailModal(b)}>
                  Guest details
                </Button>
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
                {b.status === "reserved" && <Button onClick={() => setCheckInModal(b)}>Check in</Button>}
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
        <BookingModal
          allRooms={bookableRooms}
          bookings={bookings}
          guests={guests}
          onClose={() => setModal(null)}
          onCreate={createBooking}
          busy={busy}
        />
      )}
      {editModal && (
        <EditDatesModal
          booking={editModal}
          bookings={bookings}
          onClose={() => setEditModal(null)}
          onSave={(d) => saveDates(editModal, d)}
        />
      )}
      {checkInModal && (
        <CheckInModal
          booking={checkInModal}
          guest={guestOf(checkInModal.guest_id)}
          existingCoGuests={coGuests.filter((c) => c.booking_id === checkInModal.id)}
          onClose={() => setCheckInModal(null)}
          onConfirm={() => finishCheckIn(checkInModal)}
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
    </div>
  );
}

function BookingModal({ allRooms, bookings, guests, onClose, onCreate, busy }) {
  const [guestMode, setGuestMode] = useState(guests.length ? "existing" : "new");
  const [existingId, setExistingId] = useState(guests[0]?.id || "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(todayISO());
  const [source, setSource] = useState(BOOKING_SOURCES[0]);
  const [deposit, setDeposit] = useState(0);
  const [coGuestsCount, setCoGuestsCount] = useState(0);

  // Only rooms with no overlapping booking for the CHOSEN dates show up here —
  // this is what stops a room from being double-booked for future dates.
  const availableForDates = useMemo(
    () => allRooms.filter((r) => isRoomAvailableForDates(r.id, checkIn, checkOut, bookings)),
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

  const submit = () => {
    if (checkOut <= checkIn) return alert("Check-out must be after check-in.");
    if (!roomId) return alert("No room is available for these dates. Try a different date range.");
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
    onCreate({ guest, roomId, checkIn, checkOut, source, deposit: Number(deposit) || 0, coGuestsCount: Number(coGuestsCount) || 0 });
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
        <Button disabled={busy || availableForDates.length === 0} onClick={submit}>
          Create booking
        </Button>
      </div>
    </Modal>
  );
}

function EditDatesModal({ booking, bookings, onClose, onSave }) {
  const [checkIn, setCheckIn] = useState(booking.check_in);
  const [checkOut, setCheckOut] = useState(booking.check_out);
  const nights = nightsBetween(checkIn, checkOut);
  const newTotal = Math.max(0, booking.rate * nights - (booking.discount || 0));
  const available = isRoomAvailableForDates(booking.room_id, checkIn, checkOut, bookings, booking.id);

  return (
    <Modal title="Edit stay dates" onClose={onClose} width={400}>
      <div className="grid-2">
        <Field label="Check-in">
          <input className="input" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </Field>
        <Field label="Check-out">
          <input className="input" type="date" min={checkIn} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </Field>
      </div>
      <p style={{ fontSize: 13, marginTop: 14 }}>
        {nights} nights · New total: <strong>{currency(newTotal)}</strong>
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

// ---------------------------------------------------------------
// CHECK-IN — capture ID proof photos for the main guest and any
// co-guests right from the phone camera, then finalize check-in.
// ---------------------------------------------------------------
function CheckInModal({ booking, guest, existingCoGuests, onClose, onConfirm }) {
  const [guestFile, setGuestFile] = useState(null);
  const [guestExistingUrl, setGuestExistingUrl] = useState(null);
  const slots = Math.max(booking.co_guests_count || 0, existingCoGuests.length);
  const [coForms, setCoForms] = useState(
    Array.from({ length: slots }, (_, i) => ({
      id: existingCoGuests[i]?.id || null,
      name: existingCoGuests[i]?.name || "",
      file: null,
      existingUrl: null,
      existingPath: existingCoGuests[i]?.id_proof_image_path || null,
    }))
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (guest?.id_proof_image_path) {
      getIdProofSignedUrl(guest.id_proof_image_path).then(({ data }) => data && setGuestExistingUrl(data.signedUrl));
    }
    coForms.forEach((f, i) => {
      if (f.existingPath) {
        getIdProofSignedUrl(f.existingPath).then(({ data }) => {
          if (data) setCoForms((prev) => prev.map((p, idx) => (idx === i ? { ...p, existingUrl: data.signedUrl } : p)));
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const balance = booking.total - booking.paid_amount;

  const confirm_ = async () => {
    setSaving(true);
    try {
      if (guest && guestFile) {
        const path = `guest-${guest.id}-${Date.now()}.jpg`;
        const { error } = await uploadIdProof(path, guestFile);
        if (!error) await updateGuest(guest.id, { id_proof_image_path: path });
      }
      for (const f of coForms) {
        if (!f.name.trim() && !f.file) continue;
        let path = f.existingPath;
        if (f.file) {
          path = `co-guest-${booking.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`;
          await uploadIdProof(path, f.file);
        }
        if (f.id) {
          await updateCoGuest(f.id, { name: f.name.trim(), id_proof_image_path: path });
        } else if (f.name.trim() || path) {
          await addCoGuest({ booking_id: booking.id, name: f.name.trim(), id_proof_image_path: path });
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
    onConfirm();
  };

  return (
    <Modal title="Check-in — verify ID" onClose={onClose} width={520}>
      <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: 0 }}>
        Take a clear photo of each guest's ID proof. Photos are stored securely and linked to this guest's record for future stays.
      </p>

      <div style={{ background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>{guest ? guest.name : "Guest"} (main guest)</div>
        <IdCaptureField label="ID proof photo" file={guestFile} onFile={setGuestFile} existingUrl={guestExistingUrl} />
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
          <div style={{ marginTop: 10 }}>
            <IdCaptureField
              label="ID proof photo"
              file={f.file}
              existingUrl={f.existingUrl}
              onFile={(file) => setCoForms((prev) => prev.map((p, idx) => (idx === i ? { ...p, file } : p)))}
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
// GUEST DETAIL — view everything on file for a booking: main guest,
// co-guests, and their scanned ID photos.
// ---------------------------------------------------------------
function GuestDetailModal({ booking, guest, coGuests, onClose }) {
  const [guestUrl, setGuestUrl] = useState(null);
  const [coUrls, setCoUrls] = useState({});

  useEffect(() => {
    if (guest?.id_proof_image_path) {
      getIdProofSignedUrl(guest.id_proof_image_path).then(({ data }) => data && setGuestUrl(data.signedUrl));
    }
    coGuests.forEach((c) => {
      if (c.id_proof_image_path) {
        getIdProofSignedUrl(c.id_proof_image_path).then(({ data }) => data && setCoUrls((prev) => ({ ...prev, [c.id]: data.signedUrl })));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal title="Guest details" onClose={onClose} width={480}>
      <div style={{ background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: 14, marginBottom: 12, display: "flex", gap: 12 }}>
        {guestUrl && <img src={guestUrl} alt="ID" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6 }} />}
        <div>
          <div style={{ fontWeight: 700 }}>{guest ? guest.name : "Guest removed"} {guest?.vip && "⭐"}</div>
          <div style={{ fontSize: 12.5, color: "var(--ink45)" }}>{guest?.phone}</div>
          <div style={{ fontSize: 12.5, color: "var(--ink45)" }}>{guest?.email}</div>
          {!guestUrl && <div style={{ fontSize: 11.5, color: "var(--rust)", marginTop: 4 }}>No ID proof on file yet</div>}
        </div>
      </div>
      {coGuests.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--ink45)" }}>
          {booking.co_guests_count > 0 ? "Co-guest details haven't been captured yet — do this at check-in." : "No co-guests on this booking."}
        </p>
      ) : (
        coGuests.map((c) => (
          <div key={c.id} style={{ background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: 14, marginBottom: 8, display: "flex", gap: 12 }}>
            {coUrls[c.id] && <img src={coUrls[c.id]} alt="ID" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6 }} />}
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name || "Co-guest"}</div>
              {!coUrls[c.id] && <div style={{ fontSize: 11.5, color: "var(--rust)" }}>No ID proof on file yet</div>}
            </div>
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
