import React, { useState, useEffect, useCallback } from "react";
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
import { listRooms, listGuests, listBookings, listStaff, listTasks, listAttendance, getMyProfile } from "./lib/api.js";

const BASE_NAV = [
  { id: "dashboard", label: "Dashboard" },
  { id: "rooms", label: "Rooms" },
  { id: "bookings", label: "Bookings" },
  { id: "guests", label: "Guests" },
  { id: "billing", label: "Billing" },
  { id: "staff", label: "Staff" },
];
const OWNER_NAV = [
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [role, setRole] = useState(null); // 'owner' | 'staff'
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState({ rooms: [], guests: [], bookings: [], staff: [], tasks: [], attendance: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    const [rooms, guests, bookings, staff, tasks, attendance] = await Promise.all([
      listRooms(),
      listGuests(),
      listBookings(),
      listStaff(),
      listTasks(),
      listAttendance(),
    ]);
    const firstError = [rooms, guests, bookings, staff, tasks, attendance].find((r) => r.error);
    if (firstError) setError(firstError.error.message);
    setData({
      rooms: rooms.data || [],
      guests: guests.data || [],
      bookings: bookings.data || [],
      staff: staff.data || [],
      tasks: tasks.data || [],
      attendance: attendance.data || [],
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session) reload();
  }, [session, reload]);

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
        {loading ? (
          <p style={{ color: "var(--ink45)" }}>Loading…</p>
        ) : (
          <>
            {tab === "dashboard" && <Dashboard rooms={data.rooms} bookings={data.bookings} guests={data.guests} setTab={setTab} />}
            {tab === "rooms" && <Rooms rooms={data.rooms} bookings={data.bookings} reload={reload} />}
            {tab === "bookings" && <Bookings rooms={data.rooms} guests={data.guests} bookings={data.bookings} reload={reload} />}
            {tab === "guests" && <Guests guests={data.guests} bookings={data.bookings} reload={reload} />}
            {tab === "billing" && <Billing bookings={data.bookings} guests={data.guests} rooms={data.rooms} reload={reload} />}
            {tab === "staff" && (
              <Staff staff={data.staff} rooms={data.rooms} tasks={data.tasks} attendance={data.attendance} reload={reload} />
            )}
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

