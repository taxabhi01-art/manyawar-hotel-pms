import React, { useState, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SectionTitle, Field, Button, Modal, EmptyState, Pill, currency, fmtDate, todayISO, whatsappLink, computeBookingTotal, splitInclusiveGst, PAYMENT_MODES } from "../components.jsx";
import { addPayment, updateBooking, getSettings, logActivity } from "../lib/api.js";

export default function Billing({ bookings, guests, rooms, inventoryUsage, reload }) {
  const [payModal, setPayModal] = useState(null);
  const [discountModal, setDiscountModal] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    getSettings().then(({ data }) => setSettings(data || {}));
  }, []);

  const recordPayment = async (booking, amount, mode) => {
    await addPayment({ booking_id: booking.id, amount, mode, paid_on: todayISO() });
    const newPaid = Math.min(booking.total, (booking.paid_amount || 0) + amount);
    await updateBooking(booking.id, { paid_amount: newPaid });
    setPayModal(null);
    reload();
  };

  const applyDiscount = async (booking, discount, reason) => {
    const subtotal = booking.subtotal ?? booking.total;
    const clamped = Math.max(0, Math.min(subtotal, discount));
    const total = computeBookingTotal({ ...booking, subtotal, discount: clamped });
    await updateBooking(booking.id, { discount: clamped, discount_reason: reason, total });
    if (clamped > 0) {
      const g = guests.find((x) => x.id === booking.guest_id);
      logActivity("Discount applied", `${currency(clamped)} on booking for ${g ? g.name : "guest"}${reason ? ` — ${reason}` : ""}`);
    }
    setDiscountModal(null);
    reload();
  };

  // Deposit can either be applied toward the bill (reduces balance owed) or
  // handed back to the guest in cash — these are tracked separately so the
  // books stay accurate.
  const adjustDepositToBill = async (booking) => {
    if (!confirm(`Adjust ${currency(booking.deposit)} deposit against this bill?`)) return;
    const newPaid = Math.min(booking.total, (booking.paid_amount || 0) + booking.deposit);
    await updateBooking(booking.id, { paid_amount: newPaid, deposit_status: "adjusted" });
    reload();
  };
  const refundDepositToGuest = async (booking) => {
    if (!confirm(`Mark ${currency(booking.deposit)} deposit as refunded to guest?`)) return;
    await updateBooking(booking.id, { deposit_status: "refunded", deposit_refunded: true });
    const g = guests.find((x) => x.id === booking.guest_id);
    logActivity("Deposit refunded", `${currency(booking.deposit)} to ${g ? g.name : "guest"}`);
    reload();
  };

  const sorted = bookings.slice().sort((a, b) => (a.check_in < b.check_in ? 1 : -1));
  const totalOutstanding = bookings.reduce((s, b) => s + (b.total - b.paid_amount), 0);

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
      {sorted.length === 0 ? (
        <EmptyState text="No invoices yet — they appear once a booking is created." />
      ) : (
        sorted.map((b) => {
          const g = guests.find((x) => x.id === b.guest_id);
          const r = rooms.find((x) => x.id === b.room_id);
          const balance = b.total - b.paid_amount;
          const depositStatus = b.deposit_status || (b.deposit_refunded ? "refunded" : "held");
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
                  <span style={{ fontSize: 11.5, color: depositStatus === "held" ? "var(--brass)" : "var(--ink45)" }}>
                    Deposit {currency(b.deposit)} ({depositStatus})
                  </span>
                )}
                <Pill color={balance <= 0 ? "#5f8863" : "#a6452f"}>{balance <= 0 ? "Settled" : `Due ${currency(balance)}`}</Pill>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {b.deposit > 0 && depositStatus === "held" && (
                    <>
                      <Button variant="ghost" onClick={() => adjustDepositToBill(b)}>
                        Adjust deposit to bill
                      </Button>
                      <Button variant="ghost" onClick={() => refundDepositToGuest(b)}>
                        Refund deposit
                      </Button>
                    </>
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
                  <Button variant="ghost" onClick={() => setDiscountModal(b)}>
                    Discount
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
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--hairline)", display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {b.payments.map((p) => (
                    <span key={p.id} style={{ fontSize: 11.5, color: "var(--ink45)", fontFamily: "var(--font-mono)" }}>
                      {currency(p.amount)} · {p.mode} · {fmtDate(p.paid_on)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
      {payModal && (
        <PaymentModal booking={payModal} onClose={() => setPayModal(null)} onSave={(a, m) => recordPayment(payModal, a, m)} />
      )}
      {discountModal && (
        <DiscountModal booking={discountModal} onClose={() => setDiscountModal(null)} onSave={(d, r) => applyDiscount(discountModal, d, r)} />
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
  const [amount, setAmount] = useState(balance);
  const [mode, setMode] = useState(PAYMENT_MODES[0]);
  return (
    <Modal title="Record payment" onClose={onClose} width={380}>
      <p style={{ fontSize: 13 }}>
        Balance due: <strong>{currency(balance)}</strong>
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Amount received">
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Field label="Payment mode">
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m}>{m}</option>
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
            if (amount <= 0) return alert("Enter an amount greater than zero.");
            onSave(amount, mode);
          }}
        >
          Save payment
        </Button>
      </div>
    </Modal>
  );
}

function DiscountModal({ booking, onClose, onSave }) {
  const subtotal = booking.subtotal ?? booking.total;
  const [discount, setDiscount] = useState(booking.discount || 0);
  const [reason, setReason] = useState(booking.discount_reason || "");
  return (
    <Modal title="Apply discount" onClose={onClose} width={380}>
      <p style={{ fontSize: 13 }}>
        Room total: <strong>{currency(subtotal)}</strong>
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Discount amount">
          <input className="input" type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
        </Field>
        <Field label="Reason (optional)">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave(discount, reason)}>Save discount</Button>
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
  y += 14;

  if (booking.deposit > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRASS);
    const status = booking.deposit_status || (booking.deposit_refunded ? "refunded" : "held");
    doc.text(`Advance/deposit collected: ${pdfMoney(booking.deposit)} (${status})`, 14, y);
    y += 10;
  }

  doc.setDrawColor(220, 220, 220);
  doc.line(14, 275, 196, 275);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text("Thank you for staying with us.", 14, 281);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`Generated on ${fmtDate(todayISO())}`, 196, 281, { align: "right" });

  doc.save(`invoice_${(guest?.name || "guest").replace(/\s+/g, "_")}_${booking.check_in}.pdf`);
}
