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

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function nightsBetween(a, b) {
  const ms = new Date(b) - new Date(a);
  return Math.max(1, Math.round(ms / 86400000));
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
