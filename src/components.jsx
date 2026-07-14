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

// The whole app runs on India time regardless of the device it's viewed on
// — every date/time display below pins to Asia/Kolkata explicitly instead
// of trusting the browser's ambient system timezone.
export const IST_TIMEZONE = "Asia/Kolkata";

export function fmtDate(iso) {
  if (!iso) return "—";
  // Date-only fields (check_in/check_out/...) have no inherent time — parse
  // as UTC midnight (tz-agnostic) so formatting in IST never shifts the
  // calendar day (IST is ahead of UTC, so UTC-midnight-of-day-X is always
  // still day X once shown in IST).
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-IN", { timeZone: IST_TIMEZONE, day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { timeZone: IST_TIMEZONE, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Full "Tuesday, 14 Jul 2026 · 03:45 PM IST" style label for a live clock
// (e.g. the Dashboard header).
export function fmtDateTimeDayIST(date = new Date()) {
  const datePart = date.toLocaleDateString("en-IN", {
    timeZone: IST_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("en-IN", {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart} · ${timePart} IST`;
}

export const BOOKING_STATUS_COLORS = {
  reserved: "#c99a3c",
  "checked-in": "#5f8863",
  "checked-out": "#46536b",
  cancelled: "#a6452f",
  "no-show": "#8a4a6b",
};

// "Today" per India time, not the viewer's/server's system timezone.
// `toISOString()` is UTC — for the first ~5.5 hours of every IST day
// (00:00–05:30 IST) that would silently report yesterday's date instead.
export function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: IST_TIMEZONE }); // en-CA formats as YYYY-MM-DD
}

export function nightsBetween(a, b) {
  const ms = new Date(b) - new Date(a);
  return Math.max(1, Math.round(ms / 86400000));
}

// Pure calendar-date arithmetic on a YYYY-MM-DD string — UTC-anchored (not
// IST-anchored) on purpose: adding N days to a date-only value has no
// timezone to it, and anchoring to UTC keeps it independent of the
// browser's system timezone instead of drifting a day near local midnight.
export function addDaysISO(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Pure integer month arithmetic on a "YYYY-MM" string — used for chart
// bucketing (e.g. "6 months back"). Avoids Date-object month arithmetic,
// which goes through the same UTC-vs-local ambiguity as day arithmetic.
export function addMonthsISO(yearMonth, n) {
  const [y, m] = yearMonth.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const newY = Math.floor(total / 12);
  const newM = (total % 12) + 1;
  return `${newY}-${String(newM).padStart(2, "0")}`;
}

// A same-day (day-use) booking has checkIn === checkOut, which is a zero-width
// range — without this adjustment, two zero/near-zero ranges can slip past a
// naive overlap check and double-book the same room. Treat a zero-width range
// as blocking that one calendar day.
export function datesOverlap(aStart, aEnd, bStart, bEnd) {
  const aEndEff = aEnd > aStart ? aEnd : addDaysISO(aStart, 1);
  const bEndEff = bEnd > bStart ? bEnd : addDaysISO(bStart, 1);
  return aStart < bEndEff && bStart < aEndEff;
}

// A room is truly available for a stay from checkIn up to (not including) checkOut,
// if no active booking overlaps that range.
export function isRoomAvailableForDates(roomId, checkIn, checkOut, bookings, excludeBookingId, roomStatus) {
  // A booking's stored dates aren't the only truth — if the room is currently
  // occupied or being cleaned RIGHT NOW and the requested range includes today,
  // treat it as unavailable even if the booking's own dates say otherwise
  // (covers overstays, delayed checkouts, and similar date-mismatch edge cases).
  if (roomStatus === "occupied" || roomStatus === "cleaning") {
    const today = todayISO();
    const effectiveCheckOut = checkOut > checkIn ? checkOut : addDaysISO(checkIn, 1);
    if (checkIn <= today && today < effectiveCheckOut) return false;
  }
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
  // Explicit IST, not the device's system timezone (getHours()/getMinutes()
  // would silently use whatever timezone the browser/server happens to be
  // set to).
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour").value);
  const minute = Number(parts.find((p) => p.type === "minute").value);
  return hour + minute / 60;
}
// Early check-in only counts if this is happening ON the booking's scheduled
// check-in date AND more than 2 hours before the 12:00 PM standard time.
export function isEarlyCheckin(booking) {
  if (!booking) return false;
  const today = todayISO();
  // Arriving before the scheduled check-in date at all — always early, no time check needed.
  if (today < booking.check_in) return true;
  // Arriving ON the scheduled date — only early if it's well before the 12:00 PM standard time.
  if (today === booking.check_in) return hourNow() < CHECKIN_HOUR - EARLY_CHECKIN_GRACE_HOURS;
  // Arriving after the scheduled date (a delayed check-in) is not "early".
  return false;
}
// Late checkout only counts if this is happening ON the booking's scheduled
// check-out date AND more than 1 hour after the 11:00 AM standard time.
export function isLateCheckout(booking) {
  if (!booking) return false;
  const today = todayISO();
  // Leaving after the scheduled check-out date at all — always late, no time check needed.
  if (today > booking.check_out) return true;
  // Leaving ON the scheduled date — only late if it's well after the 11:00 AM standard time.
  if (today === booking.check_out) return hourNow() >= CHECKOUT_HOUR + LATE_CHECKOUT_GRACE_HOURS;
  // Leaving before the scheduled date isn't "late".
  return false;
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
  const items = b.items_total || 0;
  return Math.max(0, subtotal - discount + early + late + items);
}

// Room rate is tax-inclusive — the guest pays exactly `total`, GST is just
// shown as a breakdown extracted FROM that amount, never added on top.
export function splitInclusiveGst(total, gstPercent) {
  if (!gstPercent) return { base: total, gst: 0 };
  const base = total / (1 + gstPercent / 100);
  return { base: Math.round(base), gst: Math.round(total - base) };
}

export const HOUSEKEEPING_CHECKLIST = [
  "Change bedsheets & pillow covers",
  "Clean bathroom & restock toiletries",
  "Vacuum / sweep & mop floor",
  "Dust furniture & surfaces",
  "Empty trash bins",
  "Restock minibar / water bottles",
  "Check AC / electronics working",
  "Check towels & linen",
];
export const MAINTENANCE_PRIORITIES = ["Low", "Medium", "High", "Urgent"];
export const MAINTENANCE_STATUSES = ["Open", "In Progress", "Resolved"];

// ---------- Push notifications ----------
// Public key only — safe to be in client code (the private key stays a
// server-side secret, used only by the send-push Edge Function).
export const VAPID_PUBLIC_KEY = "BDNvyO732-JpdAt3J6MOqRuWIIj2svazkTwzz_ESGcCt7hrn1gVh2Y-fJRHVV8IX_gE4ws_XQ8nKvZELH9KpJOM";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Requests notification permission and subscribes this browser/device to
// push — call once per login (e.g. on app load). Safe to call repeatedly;
// browsers return the existing subscription if already subscribed.
// Plays a short two-tone "ding-dong" bell sound (like a chat app notification)
// using the Web Audio API — no audio file needed. Call this when a push
// notification arrives while the app is already open (foreground).
export function playNotificationBell() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ding = (freq, startTime, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.25, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    const now = ctx.currentTime;
    ding(988, now, 0.35); // B5
    ding(1319, now + 0.15, 0.4); // E6 — classic two-note "ding-dong"
  } catch (e) {
    // Some browsers block audio until the user has interacted with the page — safe to ignore.
  }
}

export async function subscribeToPush(userEmail, savePushSubscription) {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return;
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
    }
    const registration = await navigator.serviceWorker.ready;
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = sub.toJSON();
    await savePushSubscription({
      user_email: userEmail,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    });
  } catch (e) {
    // Push isn't critical to the app working — fail silently (e.g. unsupported browser, permission denied later).
  }
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
