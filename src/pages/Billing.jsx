import React, { useState, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SectionTitle, Field, Button, Modal, EmptyState, Pill, currency, fmtDate, todayISO, PAYMENT_MODES } from "../components.jsx";
import { addPayment, updateBooking, getSettings } from "../lib/api.js";

export default function Billing({ bookings, guests, rooms, reload }) {
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
    await updateBooking(booking.id, { discount: clamped, discount_reason: reason, total: subtotal - clamped });
    setDiscountModal(null);
    reload();
  };

  const downloadInvoice = (booking) => {
    const g = guests.find((x) => x.id === booking.guest_id);
    const r = rooms.find((x) => x.id === booking.room_id);
    generateInvoicePdf(booking, g, r, settings || {});
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
                </div>
                <span style={{ fontSize: 12, color: "var(--sage)" }}>Paid {currency(b.paid_amount)}</span>
                {b.deposit > 0 && (
                  <span style={{ fontSize: 11.5, color: b.deposit_refunded ? "var(--ink45)" : "var(--brass)" }}>
                    Deposit {currency(b.deposit)}
                    {b.deposit_refunded ? " (refunded)" : " held"}
                  </span>
                )}
                <Pill color={balance <= 0 ? "#5f8863" : "#a6452f"}>{balance <= 0 ? "Settled" : `Due ${currency(balance)}`}</Pill>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <Button variant="ghost" onClick={() => downloadInvoice(b)}>
                    Invoice PDF
                  </Button>
                  <Button variant="ghost" onClick={() => setDiscountModal(b)}>
                    Discount
                  </Button>
                  {balance > 0 && <Button onClick={() => setPayModal(b)}>Record payment</Button>}
                </div>
              </div>
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

function generateInvoicePdf(booking, guest, room, settings) {
  const doc = new jsPDF();
  const gstPercent = Number(settings.gst_percent || 0);
  const gstAmount = Math.round((booking.total * gstPercent) / 100);
  const grandTotal = booking.total + gstAmount;

  doc.setFontSize(16);
  doc.text(settings.hotel_name || "MANYAWAR HOTEL", 14, 18);
  doc.setFontSize(10);
  doc.text(settings.address || "", 14, 25);
  doc.text(settings.phone ? `Phone: ${settings.phone}` : "", 14, 30);
  if (settings.gst_number) doc.text(`GSTIN: ${settings.gst_number}`, 14, 35);

  doc.setFontSize(12);
  doc.text("INVOICE", 180, 18, { align: "right" });
  doc.setFontSize(9);
  doc.text(`Invoice date: ${todayISO()}`, 180, 24, { align: "right" });
  doc.text(`Booking ID: ${booking.id.slice(0, 8)}`, 180, 29, { align: "right" });

  doc.setFontSize(10);
  doc.text(`Guest: ${guest ? guest.name : "—"}`, 14, 46);
  doc.text(`Phone: ${guest ? guest.phone || "—" : "—"}`, 14, 51);
  doc.text(`Room: ${room ? room.number : "—"} (${room ? room.type : ""})`, 14, 56);
  doc.text(`Stay: ${booking.check_in} to ${booking.check_out} (${booking.nights} nights)`, 14, 61);

  autoTable(doc, {
    startY: 70,
    head: [["Description", "Amount"]],
    body: [
      ["Room charges (subtotal)", currency(booking.subtotal ?? booking.total)],
      ...(booking.discount > 0 ? [["Discount", `- ${currency(booking.discount)}`]] : []),
      ["Total before tax", currency(booking.total)],
      ...(gstPercent > 0 ? [[`GST (${gstPercent}%)`, currency(gstAmount)]] : []),
      ["Grand total", currency(grandTotal)],
      ["Amount paid", currency(booking.paid_amount)],
      ["Balance due", currency(grandTotal - booking.paid_amount)],
    ],
    theme: "grid",
    headStyles: { fillColor: [22, 35, 58] },
  });

  doc.save(`invoice_${(guest?.name || "guest").replace(/\s+/g, "_")}_${booking.check_in}.pdf`);
}
