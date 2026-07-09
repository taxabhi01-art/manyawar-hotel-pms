import React from "react";

export function SectionTitle({ eyebrow, title, action }) {
  return (
    <div className="section-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Button({ children, variant = "primary", onClick, style, type = "button", disabled }) {
  const cls =
    variant === "dark" ? "btn btn-dark" : variant === "ghost" ? "btn btn-ghost" : variant === "danger" ? "btn btn-danger" : "btn";
  return (
    <button type={type} className={cls} onClick={onClick} style={style} disabled={disabled}>
      {children}
    </button>
  );
}

export function Pill({ color, children }) {
  return (
    <span className="pill" style={{ background: `${color}22`, border: `1px solid ${color}55`, color: "#16233a" }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color, display: "inline-block" }} />
      {children}
    </span>
  );
}

export function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ text, action }) {
  return (
    <div className="empty">
      <p style={{ margin: 0, fontSize: 14 }}>{text}</p>
      {action}
    </div>
  );
}

export function currency(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const BOOKING_STATUS_COLORS = {
  reserved: "#c99a3c",
  "checked-in": "#5f8863",
  "checked-out": "#46536b",
  cancelled: "#a6452f",
  "no-show": "#8a4a6b",
};

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function nightsBetween(a, b) {
  const ms = new Date(b) - new Date(a);
  return Math.max(1, Math.round(ms / 86400000));
}

// Two stay ranges overlap if one starts before the other ends (checkout day itself is free)
export function datesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// A room is truly available for a stay from checkIn up to (not including) checkOut,
// if no active booking overlaps that range.
export function isRoomAvailableForDates(roomId, checkIn, checkOut, bookings, excludeBookingId) {
  return !bookings.some(
    (b) =>
      b.room_id === roomId &&
      b.id !== excludeBookingId &&
      (b.status === "reserved" || b.status === "checked-in") &&
      datesOverlap(b.check_in, b.check_out, checkIn, checkOut)
  );
}

// Occupancy-based pricing: 1 guest = single rate, 2 guests = double rate,
// each guest beyond 2 adds the extra-person rate.
export function computeRoomRate(room, occupancy) {
  const single = Number(room.rate_single ?? room.rate ?? 0);
  const double = Number(room.rate_double ?? room.rate ?? single);
  const extra = Number(room.rate_extra_person ?? 0);
  const occ = Math.max(1, occupancy || 1);
  if (occ <= 1) return single;
  if (occ === 2) return double;
  return double + (occ - 2) * extra;
}

export function IdCaptureField({ label, file, onFile, existingUrl, uploading }) {
  const cameraRef = React.useRef(null);
  const uploadRef = React.useRef(null);
  const previewUrl = file ? URL.createObjectURL(file) : existingUrl;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink70)", letterSpacing: "0.03em", textTransform: "uppercase" }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {previewUrl && (
          <img
            src={previewUrl}
            alt="ID proof"
            style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--hairline)" }}
          />
        )}
        {/* Camera capture — works on phones/tablets with a working camera */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <Button variant="ghost" onClick={() => cameraRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading…" : "📷 Take photo"}
        </Button>
        {/* Plain file picker — no camera attribute, so it always opens normal file browsing,
            works even if the device's camera is broken or missing (e.g. most laptops). */}
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <Button variant="ghost" onClick={() => uploadRef.current?.click()} disabled={uploading}>
          📁 Upload from files
        </Button>
      </div>
    </div>
  );
}

export const EXPENSE_CATEGORIES = [
  "Salaries",
  "Utilities (electricity/water)",
  "Maintenance & repairs",
  "Supplies & housekeeping",
  "Food & beverage",
  "Marketing",
  "Taxes & licenses",
  "Other",
];

// Builds a wa.me link that opens WhatsApp with a pre-filled message — free,
// no API/account needed. Staff still has to tap "Send" themselves; this does
// not send automatically.
export function whatsappLink(phone, message) {
  const digits = (phone || "").replace(/[^\d]/g, "");
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

// ---------- Standard check-in/check-out policy ----------
export const CHECKIN_HOUR = 12; // 12:00 PM standard check-in
export const CHECKOUT_HOUR = 11; // 11:00 AM standard check-out
export const EARLY_CHECKIN_GRACE_HOURS = 2; // fee applies if arriving 2+ hrs early
export const LATE_CHECKOUT_GRACE_HOURS = 1; // fee applies if leaving 1+ hrs late

function hourNow() {
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60;
}
// Early check-in only counts if this is happening ON the booking's scheduled
// check-in date AND more than 2 hours before the 12:00 PM standard time.
export function isEarlyCheckin(booking) {
  if (!booking || booking.check_in !== todayISO()) return false;
  return hourNow() < CHECKIN_HOUR - EARLY_CHECKIN_GRACE_HOURS;
}
// Late checkout only counts if this is happening ON the booking's scheduled
// check-out date AND more than 1 hour after the 11:00 AM standard time.
export function isLateCheckout(booking) {
  if (!booking || booking.check_out !== todayISO()) return false;
  return hourNow() >= CHECKOUT_HOUR + LATE_CHECKOUT_GRACE_HOURS;
}

// Opens a blank tab immediately (synchronously, tied to the click) and fills
// in the WhatsApp URL afterward — avoids popup blockers, which kick in when
// window.open() is called after an `await` (e.g. a database save).
export function openWhatsApp(phone, message) {
  if (!phone) return null;
  const win = window.open("", "_blank");
  if (win) win.location.href = whatsappLink(phone, message);
  return win;
}

// Recomputes a booking's total from its parts — call this any time subtotal,
// discount, or either fee changes, so nothing gets silently overwritten.
export function computeBookingTotal(b) {
  const subtotal = b.subtotal ?? b.total ?? 0;
  const discount = b.discount || 0;
  const early = b.early_checkin_fee || 0;
  const late = b.late_checkout_fee || 0;
  return Math.max(0, subtotal - discount + early + late);
}

export const STATUS = {
  available: { label: "Available", color: "#5f8863" },
  occupied: { label: "Occupied", color: "#a6452f" },
  cleaning: { label: "Cleaning", color: "#c99a3c" },
  maintenance: { label: "Maintenance", color: "#46536b" },
};

export const ROOM_TYPES = ["Standard", "Deluxe", "Suite", "Executive"];
export const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Card", "Other"];
export const BOOKING_SOURCES = ["Walk-in", "Phone", "Online / OTA", "Travel Agent"];
export const STAFF_ROLES = ["Front Desk", "Housekeeping", "Maintenance", "Manager"];
export const ATTENDANCE_STATUS = ["Present", "Absent", "Half Day", "Leave"];
