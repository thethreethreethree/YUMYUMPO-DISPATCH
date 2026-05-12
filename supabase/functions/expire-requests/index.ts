// =============================================================================
// expire-requests — Supabase Edge Function
//
// Scans for delivery_requests that are still `Available` but past their
// `expires_at` timestamp, marks them Cancelled, and fires two notifications:
//   • request_expired → the restaurant ("no driver took it in time")
//   • request_expired → every rider that was eligible for the open wave
//                       (so it disappears from their open queue feed)
//
// Runs as the service role (bypasses RLS) so it can write notifications
// across user boundaries. The cron schedule lives in `supabase/migrations/`
// or in the Supabase dashboard under Database → Functions → Schedule.
//
// Local invoke:
//   supabase functions serve expire-requests --no-verify-jwt
//   curl -X POST http://localhost:54321/functions/v1/expire-requests
//
// Deploy:
//   supabase functions deploy expire-requests --no-verify-jwt
//
// Schedule (every minute is fine; the function is cheap and idempotent):
//   In Supabase Studio → Database → Cron Jobs → New job:
//     Name:     expire-requests
//     Schedule: */1 * * * *
//     Command:  select net.http_post(
//                 url:='https://YOUR-REF.functions.supabase.co/expire-requests',
//                 headers:=jsonb_build_object('Authorization','Bearer ' || (current_setting('app.cron_secret'))));
//   (Set `app.cron_secret` to your service-role key in Settings → API,
//    or use a separate signed secret you check inside this function.)
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deno globals — `Deno.env` is the runtime environment available in Supabase
// Edge Functions (https://supabase.com/docs/guides/functions).
declare const Deno: { env: { get(name: string): string | undefined } };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface ExpiredRequest {
  id: string;
  restaurant_id: string;
  zone: string;
  pickup: string;
  dropoff: string;
}

interface Rider {
  id: string;
  delivery_zones: string[] | null;
  availability_status: string;
  verification_status: string;
}

async function findExpired(): Promise<ExpiredRequest[]> {
  const { data, error } = await db
    .from("delivery_requests")
    .select("id, restaurant_id, zone, pickup, dropoff")
    .eq("status", "Available")
    .lt("expires_at", new Date().toISOString())
    .limit(100); // safety cap per run; cron repeats
  if (error) throw error;
  return data ?? [];
}

async function markCancelled(ids: string[]) {
  const { error } = await db
    .from("delivery_requests")
    .update({ status: "Cancelled", cancelled_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}

async function ridersInZones(zones: string[]): Promise<Rider[]> {
  if (!zones.length) return [];
  const { data, error } = await db
    .from("riders")
    .select("id, delivery_zones, availability_status, verification_status")
    .eq("verification_status", "verified")
    .overlaps("delivery_zones", zones);
  if (error) throw error;
  return (data ?? []) as Rider[];
}

async function sendNotification(rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const { error } = await db.from("notifications").insert(rows);
  if (error) throw error;
}

Deno.serve(async () => {
  try {
    const expired = await findExpired();
    if (!expired.length) {
      return new Response(JSON.stringify({ ok: true, expired: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1) Cancel the rows so the lifecycle is closed and the dashboards reflect it.
    await markCancelled(expired.map(r => r.id));

    // 2) Build notification batches.
    const restaurantNotifs = expired.map(r => ({
      recipient_type: "restaurant",
      recipient_id:   r.restaurant_id,
      kind:           "no_response",
      title:          `No driver accepted your request in ${r.zone}.`,
      body:           `Re-post the request when you're ready to try again — drivers come and go through the day.`,
      request_id:     r.id,
    }));

    // 3) For each unique zone in the batch, find verified riders who could
    //    have accepted it. Tell them the request expired so it stops haunting
    //    their open queue without a refresh.
    const zones = [...new Set(expired.map(r => r.zone))];
    const riders = await ridersInZones(zones);
    const ridersByZone = new Map<string, Rider[]>();
    for (const z of zones) ridersByZone.set(z, []);
    for (const r of riders) {
      for (const z of r.delivery_zones ?? []) {
        if (ridersByZone.has(z)) ridersByZone.get(z)!.push(r);
      }
    }
    const riderNotifs: Record<string, unknown>[] = [];
    for (const req of expired) {
      for (const rider of ridersByZone.get(req.zone) ?? []) {
        riderNotifs.push({
          recipient_type: "rider",
          recipient_id:   rider.id,
          kind:           "request_expired",
          title:          `Request near ${req.zone} expired before anyone accepted.`,
          body:           null,
          request_id:     req.id,
        });
      }
    }

    await sendNotification(restaurantNotifs);
    await sendNotification(riderNotifs);

    return new Response(
      JSON.stringify({
        ok: true,
        expired: expired.length,
        restaurants_notified: restaurantNotifs.length,
        riders_notified: riderNotifs.length,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("expire-requests failed:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
