import React, { useState, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SectionTitle, Field, Button, Modal, EmptyState, Pill, currency, fmtDate, todayISO, addDaysISO, whatsappLink, splitInclusiveGst, PAYMENT_MODES } from "../components.jsx";
import { addPayment, updatePayment, deletePayment, updateBooking, getSettings, logActivity } from "../lib/api.js";

export default function Billing({ bookings, guests, rooms, inventoryUsage, role, autoOpenPaymentFor, reload }) {
  const [payModal, setPayModal] = useState(null);
  const [editPaymentModal, setEditPaymentModal] = useState(null);
  const [settings, setSettings] = useState(null);
  const [search, setSearch] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");

  useEffect(() => {
    getSettings().then(({ data }) => setSettings(data || {}));
  }, []);

  // Coming here right after checkout with a pending balance — jump straight
  // to "Record payment" for that booking instead of making staff hunt for it.
  useEffect(() => {
    if (autoOpenPaymentFor) {
      const b = bookings.find((x) => x.id === autoOpenPaymentFor);
      if (b && b.total - b.paid_amount > 0) setPayModal(b);
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
    const newPaid = Math.min(booking.total, (booking.paid_amount || 0) + total);
    await updateBooking(booking.id, { paid_amount: newPaid });
    setPayModal(null);
    reload();
  };

  // Owner-only correction tools — recomputes paid_amount from the full
  // payment list afterward so the booking total always stays accurate.
  const saveEditedPayment = async (booking, payment, patch) => {
    const { error } = await updatePayment(payment.id, patch);
    if (error) return alert(`Couldn't update this payment: ${error.message}`);
    const newPayments = (booking.payments || []).map((p) => (p.id === payment.id ? { ...p, ...patch } : p));
    const newPaid = Math.min(booking.total, newPayments.reduce((s, p) => s + p.amount, 0));
    await updateBooking(booking.id, { paid_amount: newPaid });
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

  // The deposit is already folded into paid_amount the moment the booking is
  // created (see createBooking in Bookings.jsx) — there's no separate "adjust
  // to bill" step needed anymore. The only deposit action left is refunding
  // it back to the guest in cash, which has to reverse that same amount back
  // out of paid_amount to keep the books accurate.
  const refundDepositToGuest = async (booking) => {
    if (!confirm(`Mark ${currency(booking.deposit)} deposit as refunded to guest?`)) return;
    const newPaid = Math.max(0, (booking.paid_amount || 0) - booking.deposit);
    await updateBooking(booking.id, { paid_amount: newPaid, deposit_status: "refunded", deposit_refunded: true });
    const g = guests.find((x) => x.id === booking.guest_id);
    logActivity("Deposit refunded", `${currency(booking.deposit)} to ${g ? g.name : "guest"}`);
    reload();
  };

  const sorted = bookings
    .slice()
    .sort((a, b) => (a.check_in < b.check_in ? 1 : -1))
    .filter((b) => {
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
  const totalOutstanding = bookings.reduce((s, b) => s + (b.total - b.paid_amount), 0);
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
      {sorted.length === 0 ? (
        <EmptyState text={bookings.length === 0 ? "No invoices yet — they appear once a booking is created." : "No bookings match your search/filter."} />
      ) : (
        sorted.map((b) => {
          const g = guests.find((x) => x.id === b.guest_id);
          const r = rooms.find((x) => x.id === b.room_id);
          const balance = b.total - b.paid_amount;
          const depositStatus = b.deposit_status || (b.deposit_refunded ? "refunded" : "adjusted");
          const items = inventoryUsage.filter((u) => u.booking_id === b.id);
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
                </div>
                <span style={{ fontSize: 12, color: "var(--sage)" }}>Paid {currency(b.paid_amount)}</span>
                {b.deposit > 0 && (
                  <span style={{ fontSize: 11.5, color: depositStatus === "refunded" ? "var(--ink45)" : "var(--brass)" }}>
                    Deposit {currency(b.deposit)} via {b.deposit_mode || "Cash"} ({depositStatus}, already in Paid)
                  </span>
                )}
                <Pill color={balance <= 0 ? "#5f8863" : "#a6452f"}>{balance <= 0 ? "Settled" : `Due ${currency(balance)}`}</Pill>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {b.deposit > 0 && depositStatus !== "refunded" && (
                    <Button variant="ghost" onClick={() => refundDepositToGuest(b)}>
                      Refund deposit
                    </Button>
                  )}
                  {g?.phone && (
                    <a
                      className="btn btn-ghost"
                      href={whatsappLink(g.phone, buildBillMessage(b, g, r, settings || {}, items))}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: "none" }}
                    >
                      Send bill via WhatsApp
                    </a>
                  )}
                  <Button variant="ghost" onClick={() => downloadTaxInvoice(b, g, r, settings || {}, items)}>
                    Tax Invoice PDF
                  </Button>
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
    </div>
  );
}

function buildBillMessage(booking, guest, room, settings, items) {
  const gstPercent = Number(settings.gst_percent || 0);
  // Room rate is tax-inclusive — total stays exactly what's charged; GST is
  // just shown as a breakdown extracted from within that total.
  const { base, gst } = splitInclusiveGst(booking.total, gstPercent);
  const balance = Math.max(0, booking.total - booking.paid_amount);
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
    ...(items && items.length > 0 ? ["", "Items/Services:", ...items.map((it) => `  ${it.item_name} ×${it.quantity} = ${currency(it.amount)}`)] : []),
    "",
    `Total (amount payable): ${currency(booking.total)}`,
    gstPercent > 0 ? `  (incl. GST ${gstPercent}%: ${currency(gst)}, base: ${currency(base)})` : null,
    `Paid: ${currency(booking.paid_amount)}`,
    `Balance: ${currency(balance)}`,
    "",
    "Thank you for staying with us!",
  ].filter(Boolean);
  return lines.join("\n");
}

function PaymentModal({ booking, onClose, onSave }) {
  const balance = booking.total - booking.paid_amount;
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

// ---------------------------------------------------------------
// TAX INVOICE — the formal invoice with GST breakdown
// ---------------------------------------------------------------
function pdfMoney(n) {
  return `Rs. ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function downloadTaxInvoice(booking, guest, room, settings, items) {
  const doc = new jsPDF();
  const gstPercent = Number(settings.gst_percent || 0);
  // Room rate is tax-inclusive — the grand total is exactly booking.total
  // (what the guest actually pays). GST is shown as a breakdown pulled out
  // of that total, never added on top of it.
  const { base, gst } = splitInclusiveGst(booking.total, gstPercent);
  const grandTotal = booking.total;
  const balance = grandTotal - booking.paid_amount;

  const NAVY = [22, 35, 58];
  const BRASS = [184, 134, 63];
  const LIGHT = [246, 241, 231];

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
  doc.text("TAX INVOICE", 196, 17, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(220, 220, 225);
  doc.text(`Date: ${fmtDate(todayISO())}`, 196, 24, { align: "right" });
  doc.text(`Booking ref: ${booking.booking_ref || booking.id.slice(0, 8).toUpperCase()}`, 196, 30, { align: "right" });

  doc.setFillColor(...LIGHT);
  doc.roundedRect(14, 46, 182, 26, 2, 2, "F");
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(guest ? guest.name : "Guest removed", 20, 55);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(70, 83, 107);
  doc.text(guest?.phone || "", 20, 61);
  doc.text(`Room ${room ? room.number : "—"} · ${room ? room.type : ""}`, 110, 55);
  doc.text(`${fmtDate(booking.check_in)}  to  ${fmtDate(booking.check_out)}  (${booking.nights} nights)`, 110, 61);
  if (booking.source) doc.text(`Source: ${booking.source}`, 20, 67);

  autoTable(doc, {
    startY: 80,
    head: [["Description", "Amount"]],
    body: [
      ["Room charges", pdfMoney(booking.subtotal ?? booking.total)],
      ...(booking.discount > 0 ? [["Discount" + (booking.discount_reason ? ` (${booking.discount_reason})` : ""), `- ${pdfMoney(booking.discount)}`]] : []),
      ...(booking.early_checkin_fee > 0 ? [["Early check-in fee", pdfMoney(booking.early_checkin_fee)]] : []),
      ...(booking.late_checkout_fee > 0 ? [["Late checkout fee", pdfMoney(booking.late_checkout_fee)]] : []),
      ...((items || []).map((it) => [`${it.item_name} × ${it.quantity}`, pdfMoney(it.amount)])),
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

  if (gstPercent > 0) {
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
  doc.text(pdfMoney(booking.paid_amount), 196, y, { align: "right" });
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(balance > 0 ? 166 : 95, balance > 0 ? 69 : 136, balance > 0 ? 47 : 99);
  doc.text(balance > 0 ? "Balance due" : "Fully paid", 120, y);
  doc.text(pdfMoney(Math.max(0, balance)), 196, y, { align: "right" });
  y += 12;

  if (booking.deposit > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRASS);
    const status = booking.deposit_status || (booking.deposit_refunded ? "refunded" : "adjusted");
    doc.text(`Advance/deposit collected: ${pdfMoney(booking.deposit)} via ${booking.deposit_mode || "Cash"} (${status}, included in Amount paid below)`, 14, y);
    y += 10;
  }

  // Payment trail — every payment with its date and mode, not just the total
  if ((booking.payments || []).length > 0) {
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

  if (y > 260) {
    doc.addPage();
    y = 20;
  }
  doc.setDrawColor(220, 220, 220);
  doc.line(14, y + 6, 196, y + 6);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text("Thank you for staying with us. We hope to welcome you again soon!", 14, y + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`Generated on ${fmtDate(todayISO())}`, 196, y + 12, { align: "right" });

  doc.save(`invoice_${(guest?.name || "guest").replace(/\s+/g, "_")}_${booking.check_in}.pdf`);
}
