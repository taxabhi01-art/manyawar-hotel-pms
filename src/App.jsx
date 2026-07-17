import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";
import { subscribeToPush, playNotificationBell, groupOfBooking, sumPayments } from "./components.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Rooms from "./pages/Rooms.jsx";
import Bookings, { CheckInModal, CheckOutModal } from "./pages/Bookings.jsx";
import Guests from "./pages/Guests.jsx";
import Billing from "./pages/Billing.jsx";
import Staff from "./pages/Staff.jsx";
import Reports from "./pages/Reports.jsx";
import Settings from "./pages/Settings.jsx";
import Finance from "./pages/Finance.jsx";
import PaymentReview from "./pages/PaymentReview.jsx";
import Accounts from "./pages/Accounts.jsx";
import CalendarPage from "./pages/Calendar.jsx";
import NightAudit from "./pages/NightAudit.jsx";
import Inventory from "./pages/Inventory.jsx";
import Services from "./pages/Services.jsx";
import Maintenance from "./pages/Maintenance.jsx";
import Activity from "./pages/Activity.jsx";
import AddExpense from "./pages/AddExpense.jsx";
import Backup from "./pages/Backup.jsx";
import GuestReport from "./pages/GuestReport.jsx";
import {
  listRooms,
  listGuests,
  listBookings,
  listStaff,
  listTasks,
  listAttendance,
  listCoGuests,
  listExpenses,
  listNightAudits,
  listInventoryItems,
  listInventoryUsage,
  listServices,
  listBookingServices,
  listMaintenanceTickets,
  listActivityLog,
  getMyProfile,
  savePushSubscription,
  updateTask,
  updateBooking,
  updateRoom,
  addTask,
} from "./lib/api.js";

const BASE_NAV = [
  { id: "dashboard", label: "Dashboard" },
  { id: "calendar", label: "Calendar" },
  { id: "rooms", label: "Rooms" },
  { id: "bookings", label: "Bookings" },
  { id: "guests", label: "Guests" },
  { id: "billing", label: "Billing" },
  { id: "inventory", label: "Inventory" },
  { id: "services", label: "Services" },
  { id: "maintenance", label: "Maintenance" },
  { id: "addexpense", label: "Add Expense" },
  { id: "staff", label: "Staff" },
];
const OWNER_NAV = [
  { id: "nightaudit", label: "Night Audit" },
  { id: "finance", label: "Finance" },
  { id: "paymentreview", label: "Payment Review" },
  { id: "accounts", label: "Accounts" },
  { id: "reports", label: "Reports" },
  { id: "activity", label: "Activity" },
  { id: "backup", label: "Backup" },
  { id: "settings", label: "Settings" },
];

const LAST_SEEN_KEY = "manyawar_last_seen_activity";

// Swipe left/right between main tabs on touch devices — hand-rolled (no
// gesture library) since this is the only place in the app that needs it.
// Direction is decided once, on touchend, from the final delta — never
// during touchmove — so native scroll physics/momentum are left
// completely alone. Listeners are passive throughout since nothing here
// ever calls preventDefault(). `tab` is read via a ref rather than being a
// dependency, so the listeners are attached once instead of being torn
// down/re-attached on every tab change.
//
// `mainEl` is the actual DOM node (from a callback ref / setState, not a
// plain useRef) — a plain ref's identity never changes even once its
// .current gets populated, so an effect depending on it would never
// re-run once the .main element actually mounts (it doesn't exist yet on
// the very first render, while the login/loading screens are showing).
// Depending on the element itself via state guarantees this effect runs
// again exactly when the node becomes available.
function useSwipeNav(mainEl, nav, tab, setTab) {
  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    const el = mainEl;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let active = false;

    const onTouchStart = (e) => {
      const target = e.target;
      // The mobile nav strip has its own horizontal scroll, and modals
      // aren't portals in this app (they render inline inside .main) — a
      // swipe inside either shouldn't change tabs behind/around them.
      if (target.closest(".sidebar") || target.closest(".modal-overlay")) {
        active = false;
        return;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startTime = Date.now();
      active = true;
    };

    const onTouchEnd = (e) => {
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      const deltaX = t.clientX - startX;
      const deltaY = t.clientY - startY;
      if (Date.now() - startTime > 700) return; // slow drag-then-pause isn't a swipe
      if (Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY)) return;
      const idx = nav.findIndex((n) => n.id === tabRef.current);
      if (idx === -1) return;
      if (deltaX < 0 && idx < nav.length - 1) setTab(nav[idx + 1].id);
      else if (deltaX > 0 && idx > 0) setTab(nav[idx - 1].id);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [mainEl, nav, setTab]);
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [role, setRole] = useState(null); // 'owner' | 'staff'
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState({
    rooms: [], guests: [], bookings: [], staff: [], tasks: [], attendance: [], coGuests: [],
    expenses: [], nightAudits: [], inventoryItems: [], inventoryUsage: [], services: [], bookingServices: [], maintenanceTickets: [], activityLog: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notifiedOnce, setNotifiedOnce] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastSeenActivity, setLastSeenActivity] = useState(() => {
    try {
      return localStorage.getItem(LAST_SEEN_KEY) || "";
    } catch (e) {
      return "";
    }
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setRole(null);
      return;
    }
    getMyProfile(session.user.id).then(({ data }) => setRole(data?.role || "staff"));
    subscribeToPush(session.user.email, savePushSubscription);
  }, [session]);

  // Play a bell sound when a push notification arrives while the app is
  // already open — the OS notification sound only plays when unfocused.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event) => {
      if (event.data?.type === "PUSH_RECEIVED") playNotificationBell();
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [
      rooms, guests, bookings, staff, tasks, attendance, coGuests, expenses,
      nightAudits, inventoryItems, inventoryUsage, services, bookingServices, maintenanceTickets, activityLog,
    ] = await Promise.all([
      listRooms(),
      listGuests(),
      listBookings(),
      listStaff(),
      listTasks(),
      listAttendance(),
      listCoGuests(),
      listExpenses(),
      listNightAudits(),
      listInventoryItems(),
      listInventoryUsage(),
      listServices(),
      listBookingServices(),
      listMaintenanceTickets(),
      listActivityLog(),
    ]);
    // Expenses/activity log are owner-only at the database level, so a staff
    // login gets an error here — that's expected, not a bug; empty list for them.
    const criticalError = [rooms, guests, bookings, staff, tasks, attendance, coGuests].find((r) => r.error);
    if (criticalError) setError(criticalError.error.message);
    setData({
      rooms: rooms.data || [],
      guests: guests.data || [],
      bookings: bookings.data || [],
      staff: staff.data || [],
      tasks: tasks.data || [],
      attendance: attendance.data || [],
      coGuests: coGuests.data || [],
      expenses: expenses.data || [],
      nightAudits: nightAudits.data || [],
      inventoryItems: inventoryItems.data || [],
      inventoryUsage: inventoryUsage.data || [],
      services: services.data || [],
      bookingServices: bookingServices.data || [],
      maintenanceTickets: maintenanceTickets.data || [],
      activityLog: activityLog.data || [],
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session) reload();
  }, [session, reload]);

  // Match the logged-in account to a staff record (by email) so we can show
  // "tasks assigned to you" — this is an in-app notification, not a push/SMS.
  const myStaff = useMemo(() => {
    if (!session) return null;
    return data.staff.find((s) => (s.email || "").toLowerCase() === session.user.email.toLowerCase()) || null;
  }, [session, data.staff]);

  const myTasks = useMemo(() => {
    if (!myStaff) return [];
    return data.tasks.filter((t) => t.staff_id === myStaff.id && !t.done);
  }, [myStaff, data.tasks]);

  // How many activity-log entries have appeared since the owner last checked (per browser).
  const newActivityCount = useMemo(() => {
    if (role !== "owner") return 0;
    if (!lastSeenActivity) return data.activityLog.length;
    return data.activityLog.filter((a) => a.created_at > lastSeenActivity).length;
  }, [data.activityLog, lastSeenActivity, role]);

  const markActivitySeen = () => {
    const now = new Date().toISOString();
    setLastSeenActivity(now);
    try {
      localStorage.setItem(LAST_SEEN_KEY, now);
    } catch (e) {}
  };

  // Ask for OS-level notification permission once, and fire one when new tasks appear.
  // Note: this only works while the app tab is open in the browser — it is not a
  // true push notification that reaches a closed app or a different device.
  useEffect(() => {
    if (!("Notification" in window) || myTasks.length === 0) return;
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
    if (!notifiedOnce && Notification.permission === "granted") {
      new Notification("MANYAWAR HOTEL", {
        body: `You have ${myTasks.length} task${myTasks.length === 1 ? "" : "s"} assigned to you.`,
      });
      setNotifiedOnce(true);
    }
  }, [myTasks.length, notifiedOnce]);

  const markMyTaskDone = async (taskId) => {
    await updateTask(taskId, { done: true });
    reload();
  };

  // Check-in / check-out are triggered from either the Bookings tab or the
  // Dashboard's "Arriving/Departing today" cards — lifted here so both can
  // open the same modal. Both hold the FULL room group (1 or more sibling
  // bookings sharing guest+dates), resolved from whichever single booking
  // was actually clicked, so a multi-room stay checks in/out together
  // instead of needing the same steps repeated per room.
  const [checkInModal, setCheckInModal] = useState(null);
  const [checkOutModal, setCheckOutModal] = useState(null);
  const [autoOpenPaymentFor, setAutoOpenPaymentFor] = useState(null);

  const openCheckIn = (booking) => setCheckInModal(groupOfBooking(booking, data.bookings));
  const openCheckOut = (booking) => {
    setAutoOpenPaymentFor(null);
    setCheckOutModal(groupOfBooking(booking, data.bookings));
  };

  const finishCheckIn = async ({ early, earlyFee }) => {
    const group = checkInModal;
    const primary = group[0];
    for (const booking of group) {
      // The early-check-in fee (if any) is a one-time charge for the whole
      // group, not per room — attached to the primary booking only, same as
      // deposit/discount already are.
      const fee = booking.id === primary.id && early ? Number(earlyFee) || 0 : 0;
      await updateBooking(booking.id, {
        status: "checked-in",
        checked_in_at: new Date().toISOString(),
        early_checkin: !!early,
        early_checkin_fee: fee,
        total: booking.total + fee,
      });
      await updateRoom(booking.room_id, { status: "occupied" });
    }
    setCheckInModal(null);
    reload();
  };

  const finishCheckOut = async ({ late, lateFee }) => {
    const group = checkOutModal;
    const primary = group[0];
    let combinedNewTotal = 0;
    let combinedPaid = 0;
    for (const booking of group) {
      const fee = booking.id === primary.id && late ? Number(lateFee) || 0 : 0;
      const newTotal = booking.total + fee;
      await updateBooking(booking.id, {
        status: "checked-out",
        checked_out_at: new Date().toISOString(),
        late_checkout: !!late,
        late_checkout_fee: fee,
        total: newTotal,
      });
      await updateRoom(booking.room_id, { status: "cleaning" });
      // Auto-queue a cleaning task per room — any Housekeeping staff can pick it up (see Staff tab)
      await addTask({ staff_id: null, room_id: booking.room_id, task: "Clean room after checkout", done: false });
      combinedNewTotal += newTotal;
      combinedPaid += sumPayments(booking);
    }
    setCheckOutModal(null);
    // Pending balance across the group? Jump straight to Billing.
    if (combinedNewTotal - combinedPaid > 0) {
      setAutoOpenPaymentFor(primary.id);
      setTab("billing");
    }
    reload();
  };

  // ---------------- Global search ----------------
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return { guests: [], bookings: [], rooms: [] };
    const guests = data.guests.filter((g) => g.name?.toLowerCase().includes(q) || (g.phone || "").includes(q)).slice(0, 5);
    const bookings = data.bookings
      .filter((b) => {
        const g = data.guests.find((x) => x.id === b.guest_id);
        const r = data.rooms.find((x) => x.id === b.room_id);
        return (
          (b.booking_ref || "").toLowerCase().includes(q) ||
          (r?.number || "").toLowerCase().includes(q) ||
          (g?.name || "").toLowerCase().includes(q)
        );
      })
      .slice(0, 5);
    const rooms = data.rooms.filter((r) => r.number.toLowerCase().includes(q)).slice(0, 5);
    return { guests, bookings, rooms };
  }, [searchQuery, data.guests, data.bookings, data.rooms]);

  const hasSearchResults = searchResults.guests.length + searchResults.bookings.length + searchResults.rooms.length > 0;

  const goToSearchResult = (targetTab, id) => {
    setTab(targetTab);
    setHighlightId(id);
    setSearchQuery("");
    setTimeout(() => setHighlightId(null), 4000);
  };

  // Tab order used by both the nav bar and swipe navigation below — moved
  // above the early returns (and memoized) so the swipe hook can use it;
  // it used to be computed later, right before the JSX return, purely for
  // locality, which is preserved by reusing the same `nav` further down.
  const nav = useMemo(() => (role === "owner" ? [...BASE_NAV, ...OWNER_NAV] : BASE_NAV), [role]);

  // As a `display: standalone` PWA, there's no browser chrome back button
  // on iOS/Android — the only "back" affordance is Android's OS-level back
  // gesture/button. Without any history entries, that gesture exits the
  // app immediately from any tab. Pushing one history entry per tab change
  // (keyed on `tab` itself rather than wrapping every individual setTab
  // call site — there are several: nav clicks, global search jumps, the
  // post-checkout auto-open-billing jump, the activity banner's "View"
  // button) means every path that changes tabs gets this for free, and
  // back/forward then step through tab history instead of leaving the app.
  const skipNextPush = useRef(false);
  useEffect(() => {
    const onPopState = (e) => {
      if (e.state?.tab) {
        skipNextPush.current = true; // this tab change came FROM back/forward — don't re-push it
        setTab(e.state.tab);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return;
    }
    history.pushState({ tab }, "");
  }, [tab]);

  const [mainEl, setMainEl] = useState(null);
  useSwipeNav(mainEl, nav, tab, setTab);

  // Public route — guest scans a room QR code, no login needed at all.
  const reportRoom = new URLSearchParams(window.location.search).get("report");
  if (reportRoom) {
    return <GuestReport roomNumber={reportRoom} />;
  }

  if (session === undefined) {
    return <div className="login-shell" style={{ color: "#fff" }}>Loading…</div>;
  }
  if (!session) {
    return <Login />;
  }

  return (
    <div className="app">
      <div className="sidebar">
        <h1>MANYAWAR HOTEL</h1>

        <div className="global-search" style={{ marginTop: 18, position: "relative" }}>
          <input
            className="input"
            placeholder="Search guest, room, booking…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ fontSize: 12.5 }}
          />
          {searchQuery.trim().length >= 2 && (
            <div
              style={{
                position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 50,
                background: "#fff", border: "1px solid var(--hairline)", borderRadius: 8,
                boxShadow: "0 10px 30px rgba(0,0,0,0.25)", maxHeight: 320, overflowY: "auto",
              }}
            >
              {!hasSearchResults ? (
                <div style={{ padding: 12, fontSize: 12.5, color: "var(--ink45)" }}>No matches.</div>
              ) : (
                <>
                  {searchResults.guests.length > 0 && (
                    <SearchGroup label="Guests">
                      {searchResults.guests.map((g) => (
                        <SearchItem key={g.id} title={g.name} sub={g.phone} onClick={() => goToSearchResult("guests", g.id)} />
                      ))}
                    </SearchGroup>
                  )}
                  {searchResults.bookings.length > 0 && (
                    <SearchGroup label="Bookings">
                      {searchResults.bookings.map((b) => {
                        const g = data.guests.find((x) => x.id === b.guest_id);
                        const r = data.rooms.find((x) => x.id === b.room_id);
                        return (
                          <SearchItem
                            key={b.id}
                            title={`${g ? g.name : "Guest"} — Room ${r ? r.number : "—"}`}
                            sub={b.booking_ref ? `Ref: ${b.booking_ref}` : b.status}
                            onClick={() => goToSearchResult("bookings", b.id)}
                          />
                        );
                      })}
                    </SearchGroup>
                  )}
                  {searchResults.rooms.length > 0 && (
                    <SearchGroup label="Rooms">
                      {searchResults.rooms.map((r) => (
                        <SearchItem key={r.id} title={`Room ${r.number}`} sub={r.type} onClick={() => goToSearchResult("rooms", r.id)} />
                      ))}
                    </SearchGroup>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="nav">
          {nav.map((n) => (
            <button key={n.id} className={`nav-btn ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}>
              {n.label}
              {n.id === "staff" && myTasks.length > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    background: "#c99a3c",
                    color: "#16233A",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "1px 7px",
                  }}
                >
                  {myTasks.length}
                </span>
              )}
              {n.id === "activity" && newActivityCount > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    background: "#a6452f",
                    color: "#fff",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "1px 7px",
                  }}
                >
                  {newActivityCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
          <div className="muted">Signed in as {session.user.email}</div>
        </div>
      </div>
      <div className="main" ref={setMainEl}>
        {error && <div className="error-banner">{error}</div>}

        {role === "owner" && newActivityCount > 0 && tab !== "activity" && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 12, background: "#fff2ee",
              border: "1px solid rgba(166,69,47,0.35)", borderRadius: 10, padding: "12px 16px",
              marginBottom: 20, flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 220, fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>
              🔔 {newActivityCount} new activity log entr{newActivityCount === 1 ? "y" : "ies"} since you last checked
            </div>
            <button className="btn btn-dark" onClick={() => setTab("activity")}>
              View
            </button>
            <button className="btn btn-ghost" onClick={markActivitySeen}>
              Mark as read
            </button>
          </div>
        )}

        {myTasks.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              background: "#fff8ea",
              border: "1px solid rgba(201,154,60,0.4)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 20,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>
                🔔 You have {myTasks.length} task{myTasks.length === 1 ? "" : "s"} assigned to you
              </div>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                {myTasks.map((t) => {
                  const room = data.rooms.find((r) => r.id === t.room_id);
                  return (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink45)" }}>{room ? room.number : "—"}</span>
                      <span style={{ flex: 1 }}>{t.task}</span>
                      <button className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 11.5 }} onClick={() => markMyTaskDone(t.id)}>
                        Mark done
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ color: "var(--ink45)" }}>Loading…</p>
        ) : (
          <>
            {tab === "dashboard" && (
              <Dashboard
                rooms={data.rooms}
                bookings={data.bookings}
                guests={data.guests}
                setTab={setTab}
                onOpenCheckIn={openCheckIn}
                onOpenCheckOut={openCheckOut}
              />
            )}
            {tab === "calendar" && <CalendarPage bookings={data.bookings} guests={data.guests} rooms={data.rooms} />}
            {tab === "rooms" && <Rooms rooms={data.rooms} bookings={data.bookings} highlightId={highlightId} reload={reload} />}
            {tab === "bookings" && (
              <Bookings
                rooms={data.rooms}
                guests={data.guests}
                bookings={data.bookings}
                coGuests={data.coGuests}
                maintenanceTickets={data.maintenanceTickets}
                highlightId={highlightId}
                role={role}
                onOpenCheckIn={openCheckIn}
                onOpenCheckOut={openCheckOut}
                reload={reload}
              />
            )}
            {tab === "guests" && <Guests guests={data.guests} bookings={data.bookings} highlightId={highlightId} reload={reload} />}
            {tab === "billing" && (
              <Billing
                bookings={data.bookings}
                guests={data.guests}
                rooms={data.rooms}
                inventoryUsage={data.inventoryUsage}
                services={data.services}
                bookingServices={data.bookingServices}
                role={role}
                autoOpenPaymentFor={autoOpenPaymentFor}
                reload={reload}
              />
            )}
            {tab === "inventory" && (
              <Inventory
                items={data.inventoryItems}
                usage={data.inventoryUsage}
                bookings={data.bookings}
                guests={data.guests}
                rooms={data.rooms}
                reload={reload}
              />
            )}
            {tab === "services" && <Services services={data.services} reload={reload} />}
            {tab === "maintenance" && (
              <Maintenance tickets={data.maintenanceTickets} rooms={data.rooms} staff={data.staff} reload={reload} />
            )}
            {tab === "addexpense" && <AddExpense staff={data.staff} reload={reload} />}
            {tab === "staff" && (
              <Staff staff={data.staff} rooms={data.rooms} tasks={data.tasks} attendance={data.attendance} reload={reload} />
            )}
            {tab === "nightaudit" && role === "owner" && (
              <NightAudit
                rooms={data.rooms}
                bookings={data.bookings}
                guests={data.guests}
                expenses={data.expenses}
                nightAudits={data.nightAudits}
                role={role}
                runByEmail={session.user.email}
                reload={reload}
              />
            )}
            {tab === "finance" && role === "owner" && <Finance bookings={data.bookings} guests={data.guests} expenses={data.expenses} staff={data.staff} reload={reload} />}
            {tab === "paymentreview" && role === "owner" && (
              <PaymentReview bookings={data.bookings} guests={data.guests} reload={reload} />
            )}
            {tab === "accounts" && role === "owner" && (
              <Accounts bookings={data.bookings} expenses={data.expenses} bookingServices={data.bookingServices} inventoryUsage={data.inventoryUsage} />
            )}
            {tab === "reports" && role === "owner" && (
              <Reports rooms={data.rooms} guests={data.guests} bookings={data.bookings} staff={data.staff} attendance={data.attendance} />
            )}
            {tab === "activity" && role === "owner" && <Activity log={data.activityLog} />}
            {tab === "backup" && role === "owner" && <Backup data={data} />}
            {tab === "settings" && role === "owner" && <Settings />}
          </>
        )}
      </div>
      {checkInModal && (
        <CheckInModal
          bookings={checkInModal}
          guest={data.guests.find((g) => g.id === checkInModal[0].guest_id)}
          rooms={data.rooms}
          coGuestsByBooking={Object.fromEntries(
            checkInModal.map((b) => [b.id, data.coGuests.filter((c) => c.booking_id === b.id)])
          )}
          onClose={() => setCheckInModal(null)}
          onConfirm={finishCheckIn}
        />
      )}
      {checkOutModal && (
        <CheckOutModal bookings={checkOutModal} onClose={() => setCheckOutModal(null)} onConfirm={finishCheckOut} />
      )}
    </div>
  );
}

function SearchGroup({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink45)", textTransform: "uppercase", padding: "8px 12px 2px" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function SearchItem({ title, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box",
        padding: "8px 12px", borderBottom: "1px solid var(--hairline)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{title}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--ink45)" }}>{sub}</div>}
    </button>
  );
}
