import React, { useState, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SectionTitle, Field, Button, Modal, EmptyState, Pill, currency, fmtDate, todayISO, addDaysISO, whatsappLink, splitInclusiveGst, computeBookingTotal, sumPayments, PAYMENT_MODES } from "../components.jsx";
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
  const [payModal, setPayModal] = useState(null);
  const [editPaymentModal, setEditPaymentModal] = useState(null);
  const [serviceModal, setServiceModal] = useState(null);
  const [settleModal, setSettleModal] = useState(null);
  const [settings, setSettings] = useState(null);
  const [search, setSearch] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [statusTab, setStatusTab] = useState("all"); // all | pending | settled

  useEffect(() => {
    getSettings().then(({ data }) => setSettings(data || {}));
  }, []);

  // Coming here right after checkout with a pending balance — jump straight
  // to "Record payment" for that booking instead of making staff hunt for it.
  useEffect(() => {
    if (autoOpenPaymentFor) {
      const b = bookings.find((x) => x.id === autoOpenPaymentFor);
      if (b && b.total - sumPayments(b) > 0) setPayModal(b);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenPaymentFor]);

  // Supports one or more payment lines at once (e.g. guest pays part cash,
  // part UPI, in a single collection) — each line becomes its own payment
  // record so the mode breakdown stays accurate.
  const recordPayment = async (booking, lines, paidOn) => {
    const total = lines.reduce((s, l) => s + l.amount, 0);
    for (const line of lines) {
      await addPayment({ booking_id: booking.id, amount: line.amount, mode: line.mode, paid_on: paidOn || todayISO() });
    }
    // Recomputed from the actual payment rows (existing + this one) rather
    // than incrementing the cached paid_amount column — matches how
    // saveEditedPayment/removePayment already recompute from source, so a
    // booking whose cached paid_amount ever drifted self-heals here too.
    const newPaid = Math.min(booking.total, sumPayments(booking) + total);
    await updateBooking(booking.id, { paid_amount: newPaid });
    setPayModal(null);
    reload();
  };

  // Owner-only correction tools — recomputes paid_amount from the full
  // payment list afterward so the booking total always stays accurate.
  // updatePaymentAndRecalc is shared with the deposit-edit flow in
  // Bookings.jsx's Edit Booking form, so both stay in lockstep.
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
  // against booking_services/services_total instead.
  const addServiceCharge = async (booking, service, quantity) => {
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
  // tied to the catalog) so total rises to meet what was actually
  // collected. This never touches payments/paid_amount — only the bill's
  // total side moves, and existing service lines are untouched/still shown.
  const settleExcess = async (booking, reason, amount) => {
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

  // Deposits are recorded as a normal payment the moment a booking is created
  // (see createBooking in Bookings.jsx) — they're already in paid_amount and
  // in the payment list below, exactly like any other payment. There's no
  // separate "adjust to bill" or "refund deposit" flow anymore: if a deposit
  // genuinely needs reversing, delete or edit that payment entry (below,
  // Owner-only) the same way any other payment correction works.

  // Settled = payments received exactly match the current total (rounded to
  // the nearest rupee to absorb float noise) — anything else, whether a
  // balance is still due OR an excess was overpaid, counts as Pending.
  const isSettled = (b) => Math.round(sumPayments(b)) === Math.round(b.total);

  const sorted = bookings
    .slice()
    .sort((a, b) => (a.check_in < b.check_in ? 1 : -1))
    .filter((b) => {
      if (statusTab === "pending" && isSettled(b)) return false;
      if (statusTab === "settled" && !isSettled(b)) return false;
      if (periodFrom && b.check_in < periodFrom) return false;
      if (periodTo && b.check_in > periodTo) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const g = guests.find((x) => x.id === b.guest_id);
      const r = rooms.find((x) => x.id === b.room_id);
      return (
        (g?.name || "").toLowerCase().includes(q) ||
        (g?.phone || "").includes(q) ||
        (r?.number || "").toLowerCase().includes(q) ||
        (b.booking_ref || "").toLowerCase().includes(q)
      );
    });
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
        sorted.map((b) => {
          const g = guests.find((x) => x.id === b.guest_id);
          const r = rooms.find((x) => x.id === b.room_id);
          const paid = sumPayments(b);
          const balance = b.total - paid;
          const excess = Math.max(0, paid - b.total);
          const items = inventoryUsage.filter((u) => u.booking_id === b.id);
          const svc = (bookingServices || []).filter((s) => s.booking_id === b.id);
          return (
            <div className="card" key={b.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div className="card-col">
                  <div className="title">{g ? g.name : "Guest removed"}</div>
                  <div className="sub">
                    Room {r ? r.number : "—"} · {b.nights}n
                  </div>
                </div>
                <div style={{ width: 110 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{currency(b.total)}</div>
                  {b.discount > 0 && (
                    <div style={{ fontSize: 11, color: "var(--brass)" }}>
                      {currency(b.subtotal ?? b.total)} − {currency(b.discount)} off
                    </div>
                  )}
                  {b.items_total > 0 && <div style={{ fontSize: 11, color: "var(--brass)" }}>+{currency(b.items_total)} items</div>}
                  {b.services_total > 0 && <div style={{ fontSize: 11, color: "var(--brass)" }}>+{currency(b.services_total)} services</div>}
                </div>
                <span style={{ fontSize: 12, color: "var(--sage)" }}>Paid {currency(paid)}</span>
                {b.deposit > 0 && (
                  <span style={{ fontSize: 11.5, color: "var(--brass)" }}>
                    Deposit {currency(b.deposit)} via {b.deposit_mode || "Cash"} (already in Paid, see payment list below)
                  </span>
                )}
                <Pill color={excess > 0 ? "#c99a3c" : balance <= 0 ? "#5f8863" : "#a6452f"}>
                  {excess > 0 ? `Excess ${currency(excess)}` : balance <= 0 ? "Settled" : `Due ${currency(balance)}`}
                </Pill>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {g?.phone && (
                    <a
                      className="btn btn-ghost"
                      href={whatsappLink(g.phone, buildBillMessage(b, g, r, settings || {}, items, svc))}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: "none" }}
                    >
                      Send bill via WhatsApp
                    </a>
                  )}
                  <Button variant="ghost" onClick={() => downloadTaxInvoice(b, g, r, settings || {}, items, svc)}>
                    Tax Invoice PDF
                  </Button>
                  <Button variant="ghost" onClick={() => setServiceModal(b)}>
                    + Add service
                  </Button>
                  {excess > 0 && (
                    <Button variant="ghost" onClick={() => setSettleModal(b)}>
                      Settle excess
                    </Button>
                  )}
                  {balance > 0 && <Button onClick={() => setPayModal(b)}>Record payment</Button>}
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
                        onClick={() => removeServiceCharge(b, s)}
                        title="Remove this service charge"
                        style={{ all: "unset", cursor: "pointer", color: "var(--rust)", fontSize: 11 }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {(b.payments || []).length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--hairline)", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  {b.payments.map((p) => (
                    <span key={p.id} style={{ fontSize: 11.5, color: "var(--ink45)", fontFamily: "var(--font-mono)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {currency(p.amount)} · {p.mode} · {fmtDate(p.paid_on)}
                      {role === "owner" && (
                        <>
                          <button
                            onClick={() => setEditPaymentModal({ booking: b, payment: p })}
                            style={{ all: "unset", cursor: "pointer", color: "var(--brass)", fontSize: 11 }}
                          >
                            edit
                          </button>
                          <button
                            onClick={() => removePayment(b, p)}
                            style={{ all: "unset", cursor: "pointer", color: "var(--rust)", fontSize: 11 }}
                          >
                            delete
                          </button>
                        </>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
      {payModal && (
        <PaymentModal booking={payModal} onClose={() => setPayModal(null)} onSave={(lines, paidOn) => recordPayment(payModal, lines, paidOn)} />
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
          excess={Math.max(0, sumPayments(settleModal) - settleModal.total)}
          onClose={() => setSettleModal(null)}
          onSave={(reason, amount) => settleExcess(settleModal, reason, amount)}
        />
      )}
    </div>
  );
}

function buildBillMessage(booking, guest, room, settings, items, serviceUsage) {
  const gstPercent = Number(settings.gst_percent || 0);
  // Room rate is tax-inclusive — total stays exactly what's charged; GST is
  // just shown as a breakdown extracted from within that total.
  const { base, gst } = splitInclusiveGst(booking.total, gstPercent);
  const paid = sumPayments(booking);
  const balance = Math.max(0, booking.total - paid);
  const lines = [
    `${settings.hotel_name || "MANYAWAR HOTEL"} — Bill`,
    "",
    `Guest: ${guest ? guest.name : ""}`,
    `Room: ${room ? room.number : ""}`,
    `${fmtDate(booking.check_in)} to ${fmtDate(booking.check_out)}`,
    booking.booking_ref ? `Ref: ${booking.booking_ref}` : null,
    "",
    `Room charges: ${currency(booking.subtotal ?? booking.total)}`,
    booking.discount > 0 ? `Discount: - ${currency(booking.discount)}` : null,
    booking.early_checkin_fee > 0 ? `Early check-in fee: ${currency(booking.early_checkin_fee)}` : null,
    booking.late_checkout_fee > 0 ? `Late checkout fee: ${currency(booking.late_checkout_fee)}` : null,
    ...(() => {
      const lines = [
        ...(items || []).map((it) => `  ${it.item_name} ×${it.quantity} = ${currency(it.amount)}`),
        ...(serviceUsage || []).map((s) => `  ${s.service_name} ×${s.quantity} = ${currency(s.price * s.quantity)}`),
      ];
      return lines.length > 0 ? ["", "Items/Services:", ...lines] : [];
    })(),
    "",
    `Total (amount payable): ${currency(booking.total)}`,
    gstPercent > 0 ? `  (incl. GST ${gstPercent}%: ${currency(gst)}, base: ${currency(base)})` : null,
    `Paid: ${currency(paid)}`,
    `Balance: ${currency(balance)}`,
    "",
    "Thank you for staying with us!",
  ].filter(Boolean);
  return lines.join("\n");
}

function PaymentModal({ booking, onClose, onSave }) {
  const balance = booking.total - sumPayments(booking);
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

// ---------------------------------------------------------------
// TAX INVOICE — the formal invoice with GST breakdown
// ---------------------------------------------------------------
function pdfMoney(n) {
  return `Rs. ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// `settings` also carries the "Print on Bill" toggles (pdf_show_*, all
// default ON — see Settings.jsx) that decide which optional sections below
// actually render.
function downloadTaxInvoice(booking, guest, room, settings, items, serviceUsage) {
  const show = (key) => settings[key] !== false;
  const doc = new jsPDF();
  const gstPercent = Number(settings.gst_percent || 0);
  // Room rate is tax-inclusive — the grand total is exactly booking.total
  // (what the guest actually pays). GST is shown as a breakdown pulled out
  // of that total, never added on top of it.
  const { base, gst } = splitInclusiveGst(booking.total, gstPercent);
  const grandTotal = booking.total;
  // Summed fresh from the actual payment rows (same source the Payment
  // history table below already reads from) rather than trusting
  // booking.paid_amount — that cached column could show 0 here while
  // Payment history correctly listed real payments summing above zero.
  const actualPaid = sumPayments(booking);
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
  if (show("pdf_show_reference_id") && booking.booking_ref) headerLines.push(`Ref: ${booking.booking_ref}`);
  if (show("pdf_show_booking_id")) headerLines.push(`Booking ID: ${booking.id.slice(0, 8).toUpperCase()}`);
  if (show("pdf_show_bill_no") && booking.bill_no) headerLines.push(`Bill No: ${booking.bill_no}`);
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
  doc.text(`Room ${room ? room.number : "—"} · ${room ? room.type : ""}`, 110, boxY + 9);
  doc.text(`${fmtDate(booking.check_in)}  to  ${fmtDate(booking.check_out)}  (${booking.nights} nights)`, 110, boxY + 15);
  const guestSourceParts = [];
  if (show("pdf_show_occupancy")) {
    const occ = 1 + (booking.co_guests_count || 0);
    guestSourceParts.push(`${occ} guest${occ === 1 ? "" : "s"}`);
  }
  if (booking.source) guestSourceParts.push(`Source: ${booking.source}`);
  if (guestSourceParts.length) doc.text(guestSourceParts.join("  ·  "), 20, boxY + 21);

  autoTable(doc, {
    startY: boxY + 34,
    head: [["Description", "Amount"]],
    body: [
      ["Room charges", pdfMoney(booking.subtotal ?? booking.total)],
      ...(booking.discount > 0 ? [["Discount" + (booking.discount_reason ? ` (${booking.discount_reason})` : ""), `- ${pdfMoney(booking.discount)}`]] : []),
      ...(booking.early_checkin_fee > 0 ? [["Early check-in fee", pdfMoney(booking.early_checkin_fee)]] : []),
      ...(booking.late_checkout_fee > 0 ? [["Late checkout fee", pdfMoney(booking.late_checkout_fee)]] : []),
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
  doc.text("Grand total", 120, y);
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

  if (show("pdf_show_deposit") && booking.deposit > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRASS);
    doc.text(`Advance/deposit collected: ${pdfMoney(booking.deposit)} via ${booking.deposit_mode || "Cash"} (included in Amount paid below)`, 14, y);
    y += 10;
  }

  // Payment trail — every payment with its date and mode, not just the total
  if (show("pdf_show_payment_trail") && (booking.payments || []).length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...NAVY);
    doc.text("Payment history", 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [["Date", "Mode", "Amount"]],
      body: booking.payments.map((p) => [fmtDate(p.paid_on), p.mode, pdfMoney(p.amount)]),
      theme: "striped",
      styles: { fontSize: 8.5 },
      margin: { left: 14, right: 14 },
      tableWidth: 100,
    });
    y = doc.lastAutoTable.finalY + 8;
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

  doc.save(`invoice_${(guest?.name || "guest").replace(/\s+/g, "_")}_${booking.check_in}.pdf`);
}
