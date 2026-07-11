// Supabase Edge Function: daily-reminders
// Checks tomorrow's check-ins and check-outs, and sends a push reminder to
// the owner (and any staff with a login email) — meant to run once a day.
//
// Deploy with: supabase functions deploy daily-reminders
// Then schedule it (Supabase Dashboard → Edge Functions → daily-reminders →
// "Schedule" tab → e.g. run daily at 09:00). Uses the same VAPID secrets as send-push.

import { createClient } from "npm:@supabase/supabase-js@2";
import webPush from "npm:web-push@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const { data: arrivals } = await supabase
      .from("bookings")
      .select("id, guest_id, room_id, status")
      .eq("check_in", tomorrow)
      .eq("status", "reserved");

    const { data: departures } = await supabase
      .from("bookings")
      .select("id, guest_id, room_id, status")
      .eq("check_out", tomorrow)
      .eq("status", "checked-in");

    const arrivalCount = arrivals?.length || 0;
    const departureCount = departures?.length || 0;

    if (arrivalCount === 0 && departureCount === 0) {
      return new Response(JSON.stringify({ sent: 0, note: "Nothing scheduled for tomorrow" }), { status: 200 });
    }

    // Send to everyone who has ever subscribed (owner + any staff logins).
    const { data: subs } = await supabase.from("push_subscriptions").select("user_email").limit(500);
    const emails = [...new Set((subs || []).map((s) => s.user_email))];

    const body = `Tomorrow: ${arrivalCount} arrival${arrivalCount === 1 ? "" : "s"}, ${departureCount} departure${departureCount === 1 ? "" : "s"}.`;
    const payload = JSON.stringify({ title: "MANYAWAR HOTEL — Tomorrow's schedule", body, url: "/" });

    let sent = 0;
    for (const email of emails) {
      const { data: userSubs } = await supabase.from("push_subscriptions").select("*").eq("user_email", email);
      for (const sub of userSubs || []) {
        try {
          await webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
          sent++;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          }
        }
      }
    }

    return new Response(JSON.stringify({ sent, arrivalCount, departureCount }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
