import React, { useState, useEffect, useMemo } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  SectionTitle,
  Field,
  Button,
  Modal,
  EmptyState,
  Pill,
  currency,
  fmtDate,
  todayISO,
  addDaysISO,
  whatsappLink,
  splitInclusiveGst,
  computeBookingTotal,
  sumPayments,
  groupOfBooking,
  computeDisplayGroups,
  BOOKING_STATUS_COLORS,
  PAYMENT_MODES,
} from "../components.jsx";
import {
  addPayment,
  updatePaymentAndRecalc,
  deletePayment,
  updateBooking,
  addBookingService,
  deleteBookingService,
  getSettings,
  logActivity,
} from "../lib/api.js";

export default function Billing({ bookings, guests, rooms, inventoryUsage, services, bookingServices, role, autoOpenPaymentFor, reload }) {
  const [payModal, setPayModal] = useState(null); // holds the group (array of member bookings)
  const [editPaymentModal, setEditPaymentModal] = useState(null); // { booking, payment } — booking is whichever specific room row owns that payment
  const [serviceModal, setServiceModal] = useState(null); // holds the group
  const [settleModal, setSettleModal] = useState(null); // holds the group
  const [writeOffModal, setWriteOffModal] = useState(null); // holds the group
  const [settings, setSettings] = useState(null);
  const [search, setSearch] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [statusTab, setStatusTab] = useState("pending"); // all | pending | settled — defaults to Pending since that's what staff need to act on daily; "All" is one click away

  useEffect(() => {
    getSettings().then(({ data }) => setSettings(data || {}));
  }, []);

  // One card per linked booking — every room sharing a guest + dates +
  // ref-derivation group — instead of one card per individual room row. A
  // multi-room booking's deposit/payments concentrate on the primary room
  // only (see createBooking in Bookings.jsx), so a per-room card would show
  // a secondary room's own (often ₹0) paid amount against its own
  // room-only total, which is exactly what made a multi-room booking's
  // "Amount paid" look wrong.
  //
  // Uses computeDisplayGroups (components.jsx) — the same symmetric
  // clustering Bookings.jsx's own list uses — rather than building this
  // list by calling groupOfBooking() per booking. groupOfBooking's
  // per-booking lookup is intentionally asymmetric around cancelled/
  // no-show members (see its comment), and looping it to build a FULL
  // deduplicated list could put the same active room into two different
  // groups whenever a linked booking mixes active and cancelled rooms —
  // that produced exactly the "one multi-room booking generates two bills"
  // bug this fixes.
  const displayGroups = useMemo(() => computeDisplayGroups(bookings), [bookings]);

  // Coming here right after checkout with a pending balance — jump straight
  // to "Record payment" for that booking's group instead of making staff hunt for it.
  useEffect(() => {
    if (autoOpenPaymentFor) {
      const b = bookings.find((x) => x.id === autoOpenPaymentFor);
      if (b) {
        const group = groupOfBooking(b, bookings);
        const total = group.reduce((s, m) => s + (m.total || 0), 0);
        const paid = group.reduce((s, m) => s + sumPayments(m), 0);
        if (total - paid > 0) setPayModal(group);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenPaymentFor]);

  // Supports one or more payment lines at once (e.g. guest pays part cash,
  // part UPI, in a single collection). Always recorded against the group's
  // PRIMARY booking — the same room the original deposit/advance already
  // lives on (see createBooking in Bookings.jsx) — so a linked booking's
  // payments stay on one row instead of scattering across its rooms.
  const recordPayment = async (members, lines, paidOn) => {
    const primary = members[0];
    const total = lines.reduce((s, l) => s + l.amount, 0);
    for (const line of lines) {
      await addPayment({ booking_id: primary.id, amount: line.amount, mode: line.mode, paid_on: paidOn || todayISO() });
    }
    // Recomputed from the actual payment rows on the primary room (existing
    // + this one) rather than incrementing the cached paid_amount column —
    // matches how saveEditedPayment/removePayment already recompute from
    // source. Deliberately NOT clamped to primary.total: a group payment
    // can legitimately exceed one room's own total (it's covering the
    // whole group), and an excess payment (see Settle Excess) is a real,
    // expected state to preserve accurately, not an error to cap away.
    const newPaid = sumPayments(primary) + total;
    await updateBooking(primary.id, { paid_amount: newPaid });
    setPayModal(null);
    reload();
  };

  // Owner-only correction tools — recomputes paid_amount from the full
  // payment list afterward so the booking total always stays accurate.
  // updatePaymentAndRecalc is shared with the deposit-edit flow in
  // Bookings.jsx's Edit Booking form, so both stay in lockstep. `booking`
  // is whichever specific room row this payment actually belongs to (not
  // necessarily the group's primary) — paid_amount is a per-row cache, the
  // group-level "amount paid" shown on the card is always derived fresh.
  const saveEditedPayment = async (booking, payment, patch) => {
    const { error } = await updatePaymentAndRecalc(booking, payment.id, patch);
    if (error) return alert(`Couldn't update this payment: ${error.message}`);
    const g = guests.find((x) => x.id === booking.guest_id);
    logActivity("Payment corrected", `${g ? g.name : "Guest"}: ${currency(payment.amount)} → ${currency(patch.amount)} (${patch.mode})`);
    setEditPaymentModal(null);
    reload();
  };
  const removePayment = async (booking, payment) => {
    if (!confirm(`Delete this payment entry (${currency(payment.amount)} · ${payment.mode})?`)) return;
    const { error } = await deletePayment(payment.id);
    if (error) return alert(`Couldn't delete this payment: ${error.message}`);
    const remaining = (booking.payments || []).filter((p) => p.id !== payment.id);
    const newPaid = remaining.reduce((s, p) => s + p.amount, 0);
    await updateBooking(booking.id, { paid_amount: newPaid });
    const g = guests.find((x) => x.id === booking.guest_id);
    logActivity("Payment deleted", `${g ? g.name : "Guest"}: ${currency(payment.amount)} · ${payment.mode}`);
    reload();
  };

  // Service charges can be added at any stage of a booking (check-in day,
  // mid-stay, or right at checkout) — not just at booking creation — so this
  // lives in Billing.jsx rather than being folded into check-in/checkout.
  // Mirrors Inventory.jsx's logUsage/voidUsage pattern for items_total, but
  // against booking_services/services_total instead. Attached to the
  // group's primary room, same convention as payments above — there's no
  // per-room picker here, so a multi-room service charge always lands on
  // the primary room's bill.
  const addServiceCharge = async (members, service, quantity) => {
    const booking = members[0];
    const amount = service.price * quantity;
    const { error } = await addBookingService({
      booking_id: booking.id,
      service_id: service.id,
      service_name: service.name,
      price: service.price,
      quantity,
    });
    if (error) return alert(`Couldn't add this service: ${error.message}`);
    const newServicesTotal = (booking.services_total || 0) + amount;
    const newTotal = computeBookingTotal({ ...booking, services_total: newServicesTotal });
    await updateBooking(booking.id, { services_total: newServicesTotal, total: newTotal });
    const g = guests.find((x) => x.id === booking.guest_id);
    logActivity("Service charge added", `${g ? g.name : "Guest"}: ${service.name} ×${quantity} (${currency(amount)})`);
    setServiceModal(null);
    reload();
  };

  // `booking` is whichever specific room row this service line actually
  // belongs to (booking_services.booking_id) — not necessarily the primary.
  const removeServiceCharge = async (booking, bs) => {
    const amount = bs.price * bs.quantity;
    if (!confirm(`Remove "${bs.service_name} ×${bs.quantity}" (${currency(amount)}) from this bill?`)) return;
    const { error } = await deleteBookingService(bs.id);
    if (error) return alert(`Couldn't remove this service: ${error.message}`);
    const newServicesTotal = Math.max(0, (booking.services_total || 0) - amount);
    const newTotal = computeBookingTotal({ ...booking, services_total: newServicesTotal });
    await updateBooking(booking.id, { services_total: newServicesTotal, total: newTotal });
    const g = guests.find((x) => x.id === booking.guest_id);
    logActivity("Service charge removed", `${g ? g.name : "Guest"}: ${bs.service_name} ×${bs.quantity} (${currency(amount)})`);
    reload();
  };

  // A booking that's received more in payments than its current total
  // (guest paid before a late add-on was billed, a rounding/cash-tip
  // overage, etc.) — "settling" it adds a booking_services line for the
  // excess (same table Feature 1 uses, service_id left null since it's not
  // tied to the catalog), attached to the group's primary room, so total
  // rises to meet what was actually collected. This never touches
  // payments/paid_amount — only the bill's total side moves, and existing
  // service lines are untouched/still shown.
  const settleExcess = async (members, reason, amount) => {
    const booking = members[0];
    const { error } = await addBookingService({
      booking_id: booking.id,
      service_id: null,
      service_name: reason,
      price: amount,
      quantity: 1,
    });
    if (error) return alert(`Couldn't settle this excess: ${error.message}`);
    const newServicesTotal = (booking.services_total || 0) + amount;
    const newTotal = computeBookingTotal({ ...booking, services_total: newServicesTotal });
    await updateBooking(booking.id, { services_total: newServicesTotal, total: newTotal });
    const g = guests.find((x) => x.id === booking.guest_id);
    logActivity("Excess payment settled", `${g ? g.name : "Guest"}: ${reason} (${currency(amount)})`);
    setSettleModal(null);
    reload();
  };

  // Cancelled/no-show bookings with a payment/total mismatch — typically a
  // deposit collected before the guest cancelled, leaving a "balance" that
  // will never actually be billed or collected since there's no stay left
  // to charge for. Called "Write off" (not "Settle") to read as a distinct
  // action from Settle Excess — same underlying mechanism (a
  // booking_services adjustment line + total recompute), but this one can
  // go either direction: the common case is a shortfall (paid < total)
  // that needs writing DOWN so the booking stops showing a misleading
  // "Due" balance nobody's going to pay; a cancelled booking that happens
  // to be overpaid still needs writing UP. `adjustment` is just signed
  // here instead of always-positive like Settle Excess's. Because it's a
  // normal booking_services row like any other, it's automatically
  // excluded from Accounts' P&L revenue the same way the booking's room
  // charges already are (P&L filters out cancelled/no-show bookings at
  // the booking level before summing any of room charges/services/
  // inventory — see revenueBookingIds in Accounts.jsx), and it never
  // touches payments/paid_amount, so Cash Flow (which reads real payment
  // rows, not booking_services) is unaffected.
  const writeOffCancelledBooking = async (members, reason, adjustment) => {
    const booking = members[0];
    const { error } = await addBookingService({
      booking_id: booking.id,
      service_id: null,
      service_name: reason,
      price: adjustment,
      quantity: 1,
    });
    if (error) return alert(`Couldn't write off this booking: ${error.message}`);
    const newServicesTotal = (booking.services_total || 0) + adjustment;
    const newTotal = computeBookingTotal({ ...booking, services_total: newServicesTotal });
    await updateBooking(booking.id, { services_total: newServicesTotal, total: newTotal });
    const g = guests.find((x) => x.id === booking.guest_id);
    logActivity("Cancelled booking written off", `${g ? g.name : "Guest"}: ${reason} (${currency(adjustment)})`);
    setWriteOffModal(null);
    reload();
  };

  // Deposits are recorded as a normal payment the moment a booking is created
  // (see createBooking in Bookings.jsx) — they're already in paid_amount and
  // in the payment list below, exactly like any other payment. There's no
  // separate "adjust to bill" or "refund deposit" flow anymore: if a deposit
  // genuinely needs reversing, delete or edit that payment entry (below,
  // Owner-only) the same way any other payment correction works.

  // Settled = payments received exactly match the current total (rounded to
  // the nearest rupee to absorb float noise) — anything else, whether a
  // balance is still due OR an excess was overpaid, counts as Pending.
  // Computed across the WHOLE group, not any single room.
  const isSettled = (members) => {
    const total = members.reduce((s, m) => s + (m.total || 0), 0);
    const paid = members.reduce((s, m) => s + sumPayments(m), 0);
    return Math.round(paid) === Math.round(total);
  };
  const isCancelledGroup = (members) => members[0].status === "cancelled" || members[0].status === "no-show";
  // A cancelled booking that never had a single rupee against it has
  // nothing to reconcile — showing it as "Due" clutters Pending with
  // bookings nobody's ever going to collect from, and it can never become
  // "Settled" in any meaningful sense either. Only show it in the full
  // "All" list, not either reconciliation-focused sub-tab.
  const hasNothingToReconcile = (members) =>
    isCancelledGroup(members) && members.reduce((s, m) => s + sumPayments(m), 0) === 0;

  const sorted = displayGroups
    .slice()
    .sort((a, b) => (a[0].check_in < b[0].check_in ? 1 : -1))
    .filter((members) => {
      if ((statusTab === "pending" || statusTab === "settled") && hasNothingToReconcile(members)) return false;
      if (statusTab === "pending" && isSettled(members)) return false;
      if (statusTab === "settled" && !isSettled(members)) return false;
      const primary = members[0];
      if (periodFrom && primary.check_in < periodFrom) return false;
      if (periodTo && primary.check_in > periodTo) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const g = guests.find((x) => x.id === primary.guest_id);
      return (
        (g?.name || "").toLowerCase().includes(q) ||
        (g?.phone || "").includes(q) ||
        members.some((m) => (rooms.find((r) => r.id === m.room_id)?.number || "").toLowerCase().includes(q)) ||
        (primary.booking_ref || "").toLowerCase().includes(q)
      );
    });
  // Portfolio-wide total — summing each individual room row's own (total -
  // paid) is mathematically identical to summing per group here, since
  // every room is still counted exactly once either way.
  const totalOutstanding = bookings.reduce((s, b) => s + (b.total - sumPayments(b)), 0);
  const periodPreset = (fromDaysAgo, toDaysAgo = 0) => {
    const today = todayISO();
    setPeriodFrom(addDaysISO(today, -fromDaysAgo));
    setPeriodTo(addDaysISO(today, -toDaysAgo));
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Accounts"
        title="Billing"
        action={
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>
            Outstanding: <strong style={{ color: "var(--rust)" }}>{currency(totalOutstanding)}</strong>
          </div>
        }
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="Search guest, room, or ref">
          <input className="input" style={{ width: 220 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" />
        </Field>
        <Button variant="ghost" onClick={() => periodPreset(0, 0)}>Today</Button>
        <Button variant="ghost" onClick={() => periodPreset(6, 0)}>Last 7 days</Button>
        <Button variant="ghost" onClick={() => periodPreset(29, 0)}>Last 30 days</Button>
        <Field label="From">
          <input className="input" type="date" style={{ width: 140 }} value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input className="input" type="date" style={{ width: 140 }} value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
        </Field>
        {(periodFrom || periodTo || search) && (
          <Button variant="ghost" onClick={() => { setPeriodFrom(""); setPeriodTo(""); setSearch(""); }}>
            Clear
          </Button>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { key: "all", label: "All" },
          { key: "pending", label: "Pending" },
          { key: "settled", label: "Settled" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusTab(t.key)}
            className="btn-ghost"
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: 999,
              background: statusTab === t.key ? "var(--ink)" : "transparent",
              color: statusTab === t.key ? "var(--parchment)" : "var(--ink70)",
              border: "1px solid var(--hairline)",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sorted.length === 0 ? (
        <EmptyState text={bookings.length === 0 ? "No invoices yet — they appear once a booking is created." : "No bookings match your search/filter."} />
      ) : (
        sorted.map((members) => {
          const primary = members[0];
          const g = guests.find((x) => x.id === primary.guest_id);
          const isMulti = members.length > 1;
          const total = members.reduce((s, m) => s + (m.total || 0), 0);
          const paid = members.reduce((s, m) => s + sumPayments(m), 0);
          const balance = total - paid;
          const excess = Math.max(0, paid - total);
          const isCancelled = isCancelledGroup(members);
          const cancelledNeedsWriteOff = isCancelled && paid > 0 && Math.round(paid) !== Math.round(total);
          const discountSum = members.reduce((s, m) => s + (m.discount || 0), 0);
          const itemsTotalSum = members.reduce((s, m) => s + (m.items_total || 0), 0);
          const servicesTotalSum = members.reduce((s, m) => s + (m.services_total || 0), 0);
          const depositSum = members.reduce((s, m) => s + (m.deposit || 0), 0);
          const items = inventoryUsage.filter((u) => members.some((m) => m.id === u.booking_id));
          const svc = (bookingServices || []).filter((s) => members.some((m) => m.id === s.booking_id));
          const entries = members.map((m) => ({ booking: m, room: rooms.find((r) => r.id === m.room_id) }));
          const allPayments = members.flatMap((m) => (m.payments || []).map((p) => ({ ...p, ownerBookingId: m.id })));
          return (
            <div className="card" key={primary.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div className="card-col">
                  <div className="title">
                    {g ? g.name : "Guest removed"}
                    {(primary.status === "cancelled" || primary.status === "no-show") && (
                      <span
                        style={{
                          marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: "#fff", textTransform: "capitalize",
                          background: BOOKING_STATUS_COLORS[primary.status], borderRadius: 999, padding: "2px 8px",
                        }}
                      >
                        {primary.status}
                      </span>
                    )}
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
                  <div className="sub">
                    {members.map((m) => rooms.find((r) => r.id === m.room_id)?.number || "—").join(", ")} · {primary.nights}n
                  </div>
                  {primary.bill_no && (
                    <div style={{ fontSize: 10.5, color: "var(--ink45)", fontFamily: "var(--font-mono)" }}>Bill No: {primary.bill_no}</div>
                  )}
                </div>
                <div style={{ width: 110 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{currency(total)}</div>
                  {discountSum > 0 && <div style={{ fontSize: 11, color: "var(--brass)" }}>−{currency(discountSum)} off</div>}
                  {itemsTotalSum > 0 && <div style={{ fontSize: 11, color: "var(--brass)" }}>+{currency(itemsTotalSum)} items</div>}
                  {servicesTotalSum > 0 && <div style={{ fontSize: 11, color: "var(--brass)" }}>+{currency(servicesTotalSum)} services</div>}
                </div>
                <span style={{ fontSize: 12, color: "var(--sage)" }}>Paid {currency(paid)}</span>
                {depositSum > 0 && (
                  <span style={{ fontSize: 11.5, color: "var(--brass)" }}>
                    Deposit {currency(depositSum)} via {primary.deposit_mode || "Cash"} (already in Paid, see payment list below)
                  </span>
                )}
                <Pill color={excess > 0 ? "#c99a3c" : balance <= 0 ? "#5f8863" : "#a6452f"}>
                  {excess > 0 ? `Excess ${currency(excess)}` : balance <= 0 ? "Settled" : `Due ${currency(balance)}`}
                </Pill>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {g?.phone && (
                    <a
                      className="btn btn-ghost"
                      href={whatsappLink(g.phone, buildBillMessage(entries, g, settings || {}, items, svc))}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: "none" }}
                    >
                      Send bill via WhatsApp
                    </a>
                  )}
                  <Button variant="ghost" onClick={() => downloadTaxInvoice(entries, g, settings || {}, items, svc)}>
                    Tax Invoice PDF
                  </Button>
                  <Button variant="ghost" onClick={() => setServiceModal(members)}>
                    + Add service
                  </Button>
                  {/* Cancelled/no-show bookings get ONE unified "Write off" action
                      instead of Record Payment (no stay left to collect for) or
                      Settle Excess (which only ever writes total UP) — it handles
                      the payment/total gap in either direction, and reads as a
                      distinct action from Settle Excess rather than a variant of it. */}
                  {!isCancelled && excess > 0 && (
                    <Button variant="ghost" onClick={() => setSettleModal(members)}>
                      Settle excess
                    </Button>
                  )}
                  {!isCancelled && balance > 0 && <Button onClick={() => setPayModal(members)}>Record payment</Button>}
                  {cancelledNeedsWriteOff && (
                    <Button variant="ghost" onClick={() => setWriteOffModal(members)}>
                      Write off
                    </Button>
                  )}
                </div>
              </div>
              {items.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--hairline)", display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {items.map((it) => (
                    <span key={it.id} style={{ fontSize: 11.5, color: "var(--brass)", fontFamily: "var(--font-mono)" }}>
                      {it.item_name} ×{it.quantity} = {currency(it.amount)}
                    </span>
                  ))}
                </div>
              )}
              {svc.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--hairline)", display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {svc.map((s) => (
                    <span key={s.id} style={{ fontSize: 11.5, color: "var(--brass)", fontFamily: "var(--font-mono)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {s.service_name} ×{s.quantity} — {currency(s.price * s.quantity)}
                      <button
                        onClick={() => removeServiceCharge(members.find((m) => m.id === s.booking_id) || primary, s)}
                        title="Remove this service charge"
                        style={{ all: "unset", cursor: "pointer", color: "var(--rust)", fontSize: 11 }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {allPayments.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--hairline)", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  {allPayments.map((p) => {
                    const owner = members.find((m) => m.id === p.ownerBookingId) || primary;
                    const ownerRoom = rooms.find((r) => r.id === owner.room_id);
                    return (
                      <span key={p.id} style={{ fontSize: 11.5, color: "var(--ink45)", fontFamily: "var(--font-mono)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {currency(p.amount)} · {p.mode} · {fmtDate(p.paid_on)}
                        {isMulti && <span> (Room {ownerRoom ? ownerRoom.number : "—"})</span>}
                        {role === "owner" && (
                          <>
                            <button
                              onClick={() => setEditPaymentModal({ booking: owner, payment: p })}
                              style={{ all: "unset", cursor: "pointer", color: "var(--brass)", fontSize: 11 }}
                            >
                              edit
                            </button>
                            <button
                              onClick={() => removePayment(owner, p)}
                              style={{ all: "unset", cursor: "pointer", color: "var(--rust)", fontSize: 11 }}
                            >
                              delete
                            </button>
                          </>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
      {payModal && (
        <PaymentModal
          balance={payModal.reduce((s, m) => s + (m.total || 0), 0) - payModal.reduce((s, m) => s + sumPayments(m), 0)}
          onClose={() => setPayModal(null)}
          onSave={(lines, paidOn) => recordPayment(payModal, lines, paidOn)}
        />
      )}
      {editPaymentModal && (
        <EditPaymentModal
          payment={editPaymentModal.payment}
          onClose={() => setEditPaymentModal(null)}
          onSave={(patch) => saveEditedPayment(editPaymentModal.booking, editPaymentModal.payment, patch)}
        />
      )}
      {serviceModal && (
        <AddServiceModal
          services={services || []}
          onClose={() => setServiceModal(null)}
          onSave={(service, quantity) => addServiceCharge(serviceModal, service, quantity)}
        />
      )}
      {settleModal && (
        <SettleExcessModal
          excess={Math.max(0, settleModal.reduce((s, m) => s + sumPayments(m), 0) - settleModal.reduce((s, m) => s + (m.total || 0), 0))}
          onClose={() => setSettleModal(null)}
          onSave={(reason, amount) => settleExcess(settleModal, reason, amount)}
        />
      )}
      {writeOffModal && (
        <WriteOffModal
          gap={writeOffModal.reduce((s, m) => s + sumPayments(m), 0) - writeOffModal.reduce((s, m) => s + (m.total || 0), 0)}
          onClose={() => setWriteOffModal(null)}
          onSave={(reason, adjustment) => writeOffCancelledBooking(writeOffModal, reason, adjustment)}
        />
      )}
    </div>
  );
}

function entryOccupancy(entry, index) {
  return (index === 0 ? 1 : 0) + (entry.booking.co_guests_count || 0);
}

// entries: [{ booking, room }] — one per room, primary first (see
// displayGroups above). All entries share the same guest/check-in/check-out
// — only room + per-room charges differ. A single-room booking just passes
// a 1-length array.
function buildBillMessage(entries, guest, settings, items, serviceUsage) {
  const gstPercent = Number(settings.gst_percent || 0);
  const first = entries[0].booking;
  const multi = entries.length > 1;
  // Room rate is tax-inclusive — total stays exactly what's charged; GST is
  // just shown as a breakdown extracted from within that total.
  const grandTotal = entries.reduce((s, { booking }) => s + (booking.total || 0), 0);
  const subtotalSum = entries.reduce((s, { booking }) => s + (booking.subtotal ?? booking.total ?? 0), 0);
  const discountSum = entries.reduce((s, { booking }) => s + (booking.discount || 0), 0);
  const earlySum = entries.reduce((s, { booking }) => s + (booking.early_checkin_fee || 0), 0);
  const lateSum = entries.reduce((s, { booking }) => s + (booking.late_checkout_fee || 0), 0);
  const paid = entries.reduce((s, { booking }) => s + sumPayments(booking), 0);
  const balance = Math.max(0, grandTotal - paid);
  const { base, gst } = splitInclusiveGst(grandTotal, gstPercent);

  const lines = [
    `${settings.hotel_name || "MANYAWAR HOTEL"} — Bill`,
    "",
    `Guest: ${guest ? guest.name : ""}`,
    multi ? null : `Room: ${entries[0].room ? entries[0].room.number : ""}`,
    `${fmtDate(first.check_in)} to ${fmtDate(first.check_out)}`,
    first.booking_ref ? `Ref: ${first.booking_ref}` : null,
    "",
    ...(multi
      ? entries.map(({ booking, room }) => `Room ${room ? room.number : "—"}: ${currency(booking.subtotal ?? booking.total)}`)
      : [`Room charges: ${currency(subtotalSum)}`]),
    discountSum > 0 ? `Discount: - ${currency(discountSum)}` : null,
    earlySum > 0 ? `Early check-in fee: ${currency(earlySum)}` : null,
    lateSum > 0 ? `Late checkout fee: ${currency(lateSum)}` : null,
    ...(() => {
      const itemLines = [
        ...(items || []).map((it) => `  ${it.item_name} ×${it.quantity} = ${currency(it.amount)}`),
        ...(serviceUsage || []).map((s) => `  ${s.service_name} ×${s.quantity} = ${currency(s.price * s.quantity)}`),
      ];
      return itemLines.length > 0 ? ["", "Items/Services:", ...itemLines] : [];
    })(),
    "",
    `Total (amount payable): ${currency(grandTotal)}`,
    gstPercent > 0 ? `  (incl. GST ${gstPercent}%: ${currency(gst)}, base: ${currency(base)})` : null,
    `Paid: ${currency(paid)}`,
    `Balance: ${currency(balance)}`,
    "",
    "Thank you for staying with us!",
  ].filter(Boolean);
  return lines.join("\n");
}

function PaymentModal({ balance, onClose, onSave }) {
  const [lines, setLines] = useState([{ amount: balance, mode: PAYMENT_MODES[0] }]);
  const [paidOn, setPaidOn] = useState(todayISO());
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  const updateLine = (i, patch) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, { amount: 0, mode: PAYMENT_MODES[0] }]);
  const removeLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <Modal title="Record payment" onClose={onClose} width={420}>
      <p style={{ fontSize: 13 }}>
        Balance due: <strong>{currency(balance)}</strong>
      </p>
      <p style={{ fontSize: 11.5, color: "var(--ink45)", marginTop: -8 }}>
        If the guest is paying part cash, part online, add a line for each — every mode gets tracked separately.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {lines.map((line, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <Field label={i === 0 ? "Amount" : ""}>
              <input
                className="input"
                type="number"
                value={line.amount}
                onChange={(e) => updateLine(i, { amount: Number(e.target.value) })}
              />
            </Field>
            <Field label={i === 0 ? "Mode" : ""}>
              <select className="input" value={line.mode} onChange={(e) => updateLine(i, { mode: e.target.value })}>
                {PAYMENT_MODES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            {lines.length > 1 && (
              <button onClick={() => removeLine(i)} style={{ all: "unset", cursor: "pointer", color: "var(--rust)", padding: "8px 4px" }}>
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      <Button variant="ghost" onClick={addLine} style={{ marginTop: 10 }}>
        + Add another mode (split payment)
      </Button>
      <div style={{ marginTop: 14 }}>
        <Field label="Paid on (change this only if entering an old/backdated payment)">
          <input className="input" type="date" max={todayISO()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>
      <div style={{ marginTop: 14, fontSize: 13 }}>
        Total being recorded: <strong>{currency(total)}</strong>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (total <= 0) return alert("Enter an amount greater than zero.");
            if (lines.some((l) => !l.amount || l.amount <= 0)) return alert("Every line needs an amount greater than zero.");
            onSave(
              lines.map((l) => ({ amount: Number(l.amount), mode: l.mode })),
              paidOn
            );
          }}
        >
          Save payment
        </Button>
      </div>
    </Modal>
  );
}

function EditPaymentModal({ payment, onClose, onSave }) {
  const [amount, setAmount] = useState(payment.amount);
  const [mode, setMode] = useState(payment.mode);
  const [paidOn, setPaidOn] = useState(payment.paid_on);
  return (
    <Modal title="Correct payment entry" onClose={onClose} width={380}>
      <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: 0 }}>
        Use this to fix a mistake (wrong amount or mode entered). The booking's paid total will be
        recalculated automatically.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Amount">
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Field label="Mode">
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (!amount || amount <= 0) return alert("Enter a valid amount.");
            onSave({ amount: Number(amount), mode, paid_on: paidOn });
          }}
        >
          Save correction
        </Button>
      </div>
    </Modal>
  );
}

function AddServiceModal({ services, onClose, onSave }) {
  const activeServices = services.filter((s) => s.is_active !== false);
  const [search, setSearch] = useState("");
  const filtered = activeServices.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()));
  const [serviceId, setServiceId] = useState(activeServices[0]?.id || "");
  const [quantity, setQuantity] = useState(1);

  const onSearchChange = (value) => {
    setSearch(value);
    const stillVisible = activeServices.filter((s) => s.name.toLowerCase().includes(value.trim().toLowerCase()));
    if (!stillVisible.some((s) => s.id === serviceId)) setServiceId(stillVisible[0]?.id || "");
  };

  const service = activeServices.find((s) => s.id === serviceId);
  const amount = service ? service.price * quantity : 0;

  return (
    <Modal title="Add service charge" onClose={onClose} width={420}>
      {activeServices.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--rust)" }}>No active services in the catalog — add one from the Services tab first.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Search services">
            <input className="input" value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search…" />
          </Field>
          <Field label="Service">
            <select className="input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              {filtered.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({currency(s.price)})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity">
            <input className="input" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />
          </Field>
          {service && (
            <div style={{ background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
              Amount to add to bill: <strong>{currency(amount)}</strong>
            </div>
          )}
        </div>
      )}
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!service}
          onClick={() => {
            if (!service) return;
            onSave(service, quantity);
          }}
        >
          Add to bill
        </Button>
      </div>
    </Modal>
  );
}

function SettleExcessModal({ excess, onClose, onSave }) {
  const [amount, setAmount] = useState(excess);
  const [reason, setReason] = useState("");
  return (
    <Modal title="Settle excess payment" onClose={onClose} width={420}>
      <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: 0 }}>
        This booking has received {currency(excess)} more than its current total. Settling adds a line item for
        that amount to the bill so the total matches what's actually been paid — it doesn't touch the payment
        history itself.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Amount">
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Field label="Reason / name (shown on the bill)">
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Late Checkout Charge, Extra Bed, Adjustment"
          />
        </Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (!reason.trim()) return alert("Enter a reason/name for this charge.");
            if (!amount || amount <= 0) return alert("Enter a valid amount.");
            onSave(reason.trim(), Number(amount));
          }}
        >
          Settle
        </Button>
      </div>
    </Modal>
  );
}

// `gap` = total paid across the group minus its total — negative for the
// common case (a deposit was collected, the booking was then cancelled,
// and the remaining balance will never be billed or collected), positive
// if a cancelled booking happens to be overpaid instead. Either way,
// writing it off applies a single signed adjustment so total lands
// exactly on what was actually paid. Named "Write off" (not "Settle") so
// it reads as its own distinct action rather than a variant of Settle
// Excess, even though it shares the same underlying mechanism.
function WriteOffModal({ gap, onClose, onSave }) {
  const isShortfall = gap < 0;
  const [amount, setAmount] = useState(Math.abs(gap));
  const [reason, setReason] = useState(isShortfall ? "Booking cancelled — balance written off" : "");
  return (
    <Modal title="Write off cancelled booking" onClose={onClose} width={420}>
      <p style={{ fontSize: 12.5, color: "var(--ink45)", marginTop: 0 }}>
        {isShortfall
          ? `This cancelled booking still shows ${currency(Math.abs(gap))} as due, but since it's cancelled that balance will never actually be collected. Writing it off marks the booking as Settled instead of sitting in Pending.`
          : `This cancelled booking received ${currency(gap)} more than its total. Writing it off adds a line item for that amount so the total matches what was actually paid.`}
        {" "}It doesn't touch the payment history itself.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Amount">
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Field label="Reason / note (shown on the bill)">
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Booking cancelled — balance written off"
          />
        </Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (!reason.trim()) return alert("Enter a reason/note.");
            if (!amount || amount <= 0) return alert("Enter a valid amount.");
            onSave(reason.trim(), isShortfall ? -Number(amount) : Number(amount));
          }}
        >
          Write off
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
// TAX INVOICE — the formal invoice with GST breakdown
// ---------------------------------------------------------------
function pdfMoney(n) {
  return `Rs. ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// entries: [{ booking, room }] — one per room, primary first (mirrors
// downloadBookingConfirmation in Bookings.jsx). `settings` also carries the
// "Print on Bill" toggles (pdf_show_*, all default ON — see Settings.jsx)
// that decide which optional sections below actually render.
function downloadTaxInvoice(entries, guest, settings, items, serviceUsage) {
  const show = (key) => settings[key] !== false;
  const doc = new jsPDF();
  const gstPercent = Number(settings.gst_percent || 0);
  const first = entries[0].booking;
  const multi = entries.length > 1;
  // Room rate is tax-inclusive — the grand total is exactly the sum of
  // every room's total (what the guest actually pays). GST is shown as a
  // breakdown pulled out of that total, never added on top of it.
  const grandTotal = entries.reduce((s, { booking }) => s + (booking.total || 0), 0);
  const subtotalSum = entries.reduce((s, { booking }) => s + (booking.subtotal ?? booking.total ?? 0), 0);
  const discountSum = entries.reduce((s, { booking }) => s + (booking.discount || 0), 0);
  const earlySum = entries.reduce((s, { booking }) => s + (booking.early_checkin_fee || 0), 0);
  const lateSum = entries.reduce((s, { booking }) => s + (booking.late_checkout_fee || 0), 0);
  const depositSum = entries.reduce((s, { booking }) => s + (booking.deposit || 0), 0);
  const { base, gst } = splitInclusiveGst(grandTotal, gstPercent);
  // Summed fresh from the actual payment rows on every room in the group
  // (same source the Payment history table below already reads from)
  // rather than trusting any single row's cached paid_amount — that's what
  // let a multi-room booking's "Amount paid" show less than its own
  // deposit whenever the deposit's room wasn't the one being looked at.
  const actualPaid = entries.reduce((s, { booking }) => s + sumPayments(booking), 0);
  const balance = grandTotal - actualPaid;
  const excess = Math.max(0, actualPaid - grandTotal);

  const NAVY = [22, 35, 58];
  const BRASS = [184, 134, 63];
  const LIGHT = [246, 241, 231];

  // Booking ID / Reference ID / Bill No. are three distinct identifiers —
  // Booking ID is the system's own short id, Reference ID is the
  // guest/OTA-facing ref, Bill No. is the sequential accounting number (see
  // Settings → Bill Numbering). Computed up front because the navy header
  // band has to grow to fit however many are toggled on — with all of them
  // on (the default), 4 lines don't fit the old fixed 38mm band and the
  // last one (usually Bill No.) spills onto white background where its
  // light header color is unreadable.
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
  doc.text("TAX INVOICE", 196, 17, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(220, 220, 225);
  headerLines.forEach((line, i) => doc.text(line, 196, 24 + i * 6, { align: "right" }));

  const boxY = bandHeight + 8;
  doc.setFillColor(...LIGHT);
  doc.roundedRect(14, boxY, 182, 26, 2, 2, "F");
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(guest ? guest.name : "Guest removed", 20, boxY + 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(70, 83, 107);
  doc.text(guest?.phone || "", 20, boxY + 15);
  const roomLabel = multi ? entries.map(({ room }) => room?.number || "—").join(", ") : entries[0].room ? `${entries[0].room.number} · ${entries[0].room.type}` : "—";
  doc.text(`Room${multi ? "s" : ""} ${roomLabel}`, 110, boxY + 9);
  doc.text(`${fmtDate(first.check_in)}  to  ${fmtDate(first.check_out)}  (${first.nights} nights)`, 110, boxY + 15);
  const guestSourceParts = [];
  if (show("pdf_show_occupancy")) {
    const totalGuests = entries.reduce((s, e, i) => s + entryOccupancy(e, i), 0);
    guestSourceParts.push(`${totalGuests} guest${totalGuests === 1 ? "" : "s"}`);
  }
  if (first.source) guestSourceParts.push(`Source: ${first.source}`);
  if (guestSourceParts.length) doc.text(guestSourceParts.join("  ·  "), 20, boxY + 21);

  const roomChargeRows = multi
    ? entries.map(({ booking, room }, i) => {
        const occ = entryOccupancy({ booking }, i);
        const occLabel = show("pdf_show_occupancy") ? ` (${occ} guest${occ === 1 ? "" : "s"})` : "";
        return [`Room ${room ? room.number : "—"}${occLabel} — ${pdfMoney(booking.rate)} x ${booking.nights} night${booking.nights > 1 ? "s" : ""}`, pdfMoney(booking.subtotal ?? booking.total)];
      })
    : [["Room charges", pdfMoney(subtotalSum)]];

  autoTable(doc, {
    startY: boxY + 34,
    head: [["Description", "Amount"]],
    body: [
      ...roomChargeRows,
      ...(discountSum > 0 ? [["Discount" + (first.discount_reason ? ` (${first.discount_reason})` : ""), `- ${pdfMoney(discountSum)}`]] : []),
      ...(earlySum > 0 ? [["Early check-in fee", pdfMoney(earlySum)]] : []),
      ...(lateSum > 0 ? [["Late checkout fee", pdfMoney(lateSum)]] : []),
      ...((items || []).map((it) => [`${it.item_name} × ${it.quantity}`, pdfMoney(it.amount)])),
      ...((serviceUsage || []).map((s) => [`${s.service_name} × ${s.quantity}`, pdfMoney(s.price * s.quantity)])),
    ],
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

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(multi ? "Grand total" : "Total", 120, y);
  doc.text(pdfMoney(grandTotal), 196, y, { align: "right" });
  y += 6;

  if (gstPercent > 0 && show("pdf_show_gst")) {
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
  doc.text(pdfMoney(actualPaid), 196, y, { align: "right" });
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(balance > 0 ? 166 : 95, balance > 0 ? 69 : 136, balance > 0 ? 47 : 99);
  doc.text(balance > 0 ? "Balance due" : "Fully paid", 120, y);
  doc.text(pdfMoney(Math.max(0, balance)), 196, y, { align: "right" });
  y += 8;

  // Never let an overpayment quietly look like a normal fully-paid bill —
  // call it out explicitly so it's obvious a "Settle excess" (Billing tab)
  // or a refund is needed.
  if (excess > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...BRASS);
    doc.text(`Excess amount received: ${pdfMoney(excess)}`, 120, y);
    y += 8;
  }
  y += 4;

  if (show("pdf_show_deposit") && depositSum > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRASS);
    doc.text(`Advance/deposit collected: ${pdfMoney(depositSum)} via ${first.deposit_mode || "Cash"} (included in Amount paid below)`, 14, y);
    y += 10;
  }

  // Payment trail — every payment with its date, room, and mode, not just the total
  if (show("pdf_show_payment_trail")) {
    const allPayments = entries.flatMap(({ booking, room }) => (booking.payments || []).map((p) => ({ ...p, roomNumber: room?.number || "—" })));
    if (allPayments.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...NAVY);
      doc.text("Payment history", 14, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: multi ? [["Date", "Room", "Mode", "Amount"]] : [["Date", "Mode", "Amount"]],
        body: allPayments.map((p) => (multi ? [fmtDate(p.paid_on), p.roomNumber, p.mode, pdfMoney(p.amount)] : [fmtDate(p.paid_on), p.mode, pdfMoney(p.amount)])),
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
  doc.line(14, y + 6, 196, y + 6);
  y += 12;
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
  doc.text("Thank you for staying with us. We hope to welcome you again soon!", 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`Generated on ${fmtDate(todayISO())}`, 196, y, { align: "right" });

  doc.save(`invoice_${(guest?.name || "guest").replace(/\s+/g, "_")}_${first.check_in}.pdf`);
}
