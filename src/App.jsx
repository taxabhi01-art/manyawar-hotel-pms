import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Rooms from "./pages/Rooms.jsx";
import Bookings from "./pages/Bookings.jsx";
import Guests from "./pages/Guests.jsx";
import Billing from "./pages/Billing.jsx";
import Staff from "./pages/Staff.jsx";
import Reports from "./pages/Reports.jsx";
import Settings from "./pages/Settings.jsx";
import Finance from "./pages/Finance.jsx";
import CalendarPage from "./pages/Calendar.jsx";
import {
  listRooms,
  listGuests,
  listBookings,
  listStaff,
  listTasks,
  listAttendance,
  listCoGuests,
  listExpenses,
  getMyProfile,
  updateTask,
} from "./lib/api.js";

const BASE_NAV = [
  { id: "dashboard", label: "Dashboard" },
  { id: "calendar", label: "Calendar" },
  { id: "rooms", label: "Rooms" },
  { id: "bookings", label: "Bookings" },
  { id: "guests", label: "Guests" },
  { id: "billing", label: "Billing" },
  { id: "staff", label: "Staff" },
];
const OWNER_NAV = [
  { id: "finance", label: "Finance" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [role, setRole] = useState(null); // 'owner' | 'staff'
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState({ rooms: [], guests: [], bookings: [], staff: [], tasks: [], attendance: [], coGuests: [], expenses: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notifiedOnce, setNotifiedOnce] = useState(false);

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
  }, [session]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [rooms, guests, bookings, staff, tasks, attendance, coGuests, expenses] = await Promise.all([
      listRooms(),
      listGuests(),
      listBookings(),
      listStaff(),
      listTasks(),
      listAttendance(),
      listCoGuests(),
      listExpenses(),
    ]);
    // Expenses are owner-only at the database level, so a staff login will get
    // an error here — that's expected, not a bug; just show an empty list for them.
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

  if (session === undefined) {
    return <div className="login-shell" style={{ color: "#fff" }}>Loading…</div>;
  }
  if (!session) {
    return <Login />;
  }

  const nav = role === "owner" ? [...BASE_NAV, ...OWNER_NAV] : BASE_NAV;

  return (
    <div className="app">
      <div className="sidebar">
        <h1>MANYAWAR HOTEL</h1>
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
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
          <div className="muted">Signed in as {session.user.email}</div>
        </div>
      </div>
      <div className="main">
        {error && <div className="error-banner">{error}</div>}

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
            {tab === "dashboard" && <Dashboard rooms={data.rooms} bookings={data.bookings} guests={data.guests} setTab={setTab} />}
            {tab === "calendar" && <CalendarPage bookings={data.bookings} guests={data.guests} rooms={data.rooms} />}
            {tab === "rooms" && <Rooms rooms={data.rooms} bookings={data.bookings} reload={reload} />}
            {tab === "bookings" && <Bookings rooms={data.rooms} guests={data.guests} bookings={data.bookings} coGuests={data.coGuests} reload={reload} />}
            {tab === "guests" && <Guests guests={data.guests} bookings={data.bookings} reload={reload} />}
            {tab === "billing" && <Billing bookings={data.bookings} guests={data.guests} rooms={data.rooms} reload={reload} />}
            {tab === "staff" && (
              <Staff staff={data.staff} rooms={data.rooms} tasks={data.tasks} attendance={data.attendance} reload={reload} />
            )}
            {tab === "finance" && role === "owner" && <Finance bookings={data.bookings} expenses={data.expenses} reload={reload} />}
            {tab === "reports" && role === "owner" && (
              <Reports rooms={data.rooms} guests={data.guests} bookings={data.bookings} staff={data.staff} attendance={data.attendance} />
            )}
            {tab === "settings" && role === "owner" && <Settings />}
          </>
        )}
      </div>
    </div>
  );
}
