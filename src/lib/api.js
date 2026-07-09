import { supabase } from "../supabaseClient";

// ---------- ROOMS ----------
export async function listRooms() {
  return supabase.from("rooms").select("*").order("number");
}
export async function addRoom(room) {
  return supabase.from("rooms").insert(room).select().single();
}
export async function updateRoom(id, patch) {
  return supabase.from("rooms").update(patch).eq("id", id);
}
export async function deleteRoom(id) {
  return supabase.from("rooms").delete().eq("id", id);
}

// ---------- GUESTS ----------
export async function listGuests() {
  return supabase.from("guests").select("*").order("name");
}
export async function addGuest(guest) {
  return supabase.from("guests").insert(guest).select().single();
}
export async function updateGuest(id, patch) {
  return supabase.from("guests").update(patch).eq("id", id);
}
export async function deleteGuest(id) {
  return supabase.from("guests").delete().eq("id", id);
}

// ---------- BOOKINGS ----------
export async function listBookings() {
  return supabase.from("bookings").select("*, payments(*)").order("check_in", { ascending: false });
}
export async function addBooking(booking) {
  return supabase.from("bookings").insert(booking).select().single();
}
export async function updateBooking(id, patch) {
  return supabase.from("bookings").update(patch).eq("id", id);
}
export async function deleteBooking(id) {
  return supabase.from("bookings").delete().eq("id", id);
}

// ---------- PAYMENTS ----------
export async function addPayment(payment) {
  return supabase.from("payments").insert(payment).select().single();
}

// ---------- STAFF ----------
export async function listStaff() {
  return supabase.from("staff").select("*").order("name");
}
export async function addStaff(member) {
  return supabase.from("staff").insert(member).select().single();
}
export async function updateStaff(id, patch) {
  return supabase.from("staff").update(patch).eq("id", id);
}
export async function deleteStaff(id) {
  return supabase.from("staff").delete().eq("id", id);
}

// ---------- TASKS ----------
export async function listTasks() {
  return supabase.from("tasks").select("*");
}
export async function addTask(task) {
  return supabase.from("tasks").insert(task).select().single();
}
export async function updateTask(id, patch) {
  return supabase.from("tasks").update(patch).eq("id", id);
}
export async function deleteTask(id) {
  return supabase.from("tasks").delete().eq("id", id);
}

// ---------- PROFILE (role) ----------
export async function getMyProfile(userId) {
  return supabase.from("profiles").select("*").eq("id", userId).single();
}

// ---------- SETTINGS (hotel info + GST) ----------
export async function getSettings() {
  return supabase.from("settings").select("*").eq("id", 1).single();
}
export async function updateSettings(patch) {
  return supabase.from("settings").update(patch).eq("id", 1);
}

export async function listAttendance() {
  return supabase.from("attendance").select("*");
}
export async function upsertAttendance(records) {
  // records: array of { staff_id, date, status }
  return supabase.from("attendance").upsert(records, { onConflict: "staff_id,date" });
}

// ---------- CO-GUESTS ----------
export async function listCoGuests() {
  return supabase.from("co_guests").select("*");
}
export async function addCoGuest(coGuest) {
  return supabase.from("co_guests").insert(coGuest).select().single();
}
export async function updateCoGuest(id, patch) {
  return supabase.from("co_guests").update(patch).eq("id", id);
}
export async function deleteCoGuest(id) {
  return supabase.from("co_guests").delete().eq("id", id);
}

// ---------- ID PROOF PHOTOS (Supabase Storage) ----------
export async function uploadIdProof(path, file) {
  return supabase.storage.from("id-proofs").upload(path, file, { upsert: true, contentType: file.type });
}
export async function getIdProofSignedUrl(path) {
  return supabase.storage.from("id-proofs").createSignedUrl(path, 3600); // valid 1 hour
}
