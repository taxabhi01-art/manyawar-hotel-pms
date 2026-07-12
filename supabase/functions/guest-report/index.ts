// Supabase Edge Function: guest-report
// Public endpoint — a guest scans a room's QR code, lands on a no-login page,
// and submits an issue. This function creates the maintenance ticket and
// pushes a notification to everyone subscribed (owner + staff).
//
// Deploy with: supabase functions deploy guest-report
// Uses the same VAPID secrets already set for send-push/daily-reminders.

import { createClient } from "npm:@supabase/supabase-js@2";
import webPush from "npm:web-push@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });

  try {
    const { room_number, issue, priority } = await req.json();
    if (!room_number || !issue) {
      return new Response(JSON.stringify({ error: "room_number and issue are required" }), { status: 400, headers: CORS_HEADERS });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: room } = await supabase.from("rooms").select("id, number").eq("number", room_number).maybeSingle();
    if (!room) {
      return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers: CORS_HEADERS });
    }

    const { error: insertError } = await supabase.from("maintenance_tickets").insert({
      room_id: room.id,
      issue,
      priority: priority || "Medium",
      status: "Open",
      reported_by: "Guest (QR)",
    });
    if (insertError) throw insertError;

    await supabase.from("activity_log").insert({
      action: "Guest reported an issue",
      details: `Room ${room.number} — ${issue}`,
      performed_by: "Guest (QR)",
    });

    // Notify everyone subscribed to push (owner + staff)
    const { data: subs } = await supabase.from("push_subscriptions").select("*").limit(500);
    const payload = JSON.stringify({
      title: `⚠ Room ${room.number} — Guest reported an issue`,
      body: issue,
      url: "/",
    });
    for (const sub of subs || []) {
      try {
        await webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS_HEADERS });
  }
});
