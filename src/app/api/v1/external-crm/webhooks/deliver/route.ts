/**
 * POST /api/v1/external-crm/webhooks/deliver
 *
 * Drain the pending deliveries queue. Designed to be called by a cron
 * every 60 seconds. Stateless — multiple concurrent runs are safe because
 * the SELECT … FOR UPDATE SKIP LOCKED pattern (via a Postgres-side claim)
 * keeps two workers from picking the same row.
 *
 * Auth:
 *   - Bearer with "webhooks_admin" permission (per-org), OR
 *   - X-Cron-Secret header matching env CRON_SECRET (global, no org scope —
 *     drains all orgs in one call)
 *
 * Response: summary of attempts made.
 *
 * Each pending row's lifecycle:
 *   1. Mark in-flight by writing delivered_at + a status sentinel? — no, we
 *      use a transaction with a single UPDATE … RETURNING that flips status
 *      from "pending" → temporary, then on completion we set "success" or
 *      schedule a retry.
 *   2. Build payload from event + subscription
 *   3. Compute X-Webnari-Signature = HMAC-SHA256(secret, raw body)
 *   4. POST with 10s timeout
 *   5. On 2xx: status='success', delivered_at=now()
 *   6. On non-2xx or network error: increment attempt, schedule next_attempt_at
 *      using inv_webhook_backoff(attempt). At attempt 5+, flip to 'exhausted'.
 */
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiResponse, apiError, corsHeaders } from "@/lib/api-key";
import { verifyExternalCrmKey } from "@/lib/external-crm-auth";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;
const REQUEST_TIMEOUT_MS = 10_000;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

/**
 * GET wrapper for Vercel Cron, which only supports GET. Vercel auto-injects
 * `Authorization: Bearer ${env.CRON_SECRET}` when a cron is configured in
 * vercel.json. We accept that same header pattern here so the same endpoint
 * works for Vercel Cron, manual curl, and the per-org Bearer flow.
 */
export async function GET(request: NextRequest) {
  return drainQueue(request);
}

export async function POST(request: NextRequest) {
  return drainQueue(request);
}

async function drainQueue(request: NextRequest): Promise<Response> {
  // Three auth paths, tried in order:
  //   1. X-Cron-Secret header  (manual / external cron)
  //   2. Authorization: Bearer <CRON_SECRET>  (Vercel Cron auto-injects this)
  //   3. Authorization: Bearer inv_...  (per-org admin key — only drains that org)
  const envCronSecret = process.env.CRON_SECRET;
  const xCron = request.headers.get("x-cron-secret");
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";

  let orgFilter: string | null = null;

  const isGlobalCron =
    !!envCronSecret &&
    ((xCron && xCron === envCronSecret) ||
      (bearer && !bearer.startsWith("inv_") && bearer === envCronSecret));

  if (isGlobalCron) {
    orgFilter = null;
  } else {
    // Per-org Bearer (inv_…) path
    const keyAuth = await verifyExternalCrmKey(request, {
      required: "webhooks_admin",
      enforceOrgIdParam: false,
    });
    if (keyAuth instanceof Response) return keyAuth;
    orgFilter = keyAuth.orgId;
  }

  const supabase = createAdminClient();

  // Claim up to BATCH_SIZE rows whose next_attempt_at is past. Marking them
  // as in-flight via attempt-counter bump + status='pending' is brittle —
  // the cleaner Postgres pattern is SELECT … FOR UPDATE SKIP LOCKED, which
  // PostgREST doesn't expose. So we use a "claim" round-trip: read, flip
  // delivered_at to a sentinel timestamp via UPDATE WHERE status='pending'
  // AND delivered_at IS NULL. Concurrent workers will only see rows where
  // delivered_at is still NULL.
  //
  // Actually the simplest race-safe approach without server-side functions:
  // grab the pending rows by ID, then for each row issue an UPDATE that
  // sets next_attempt_at far in the future as a soft lock; the worker that
  // wins the UPDATE proceeds. On completion we set the real status.
  let query = supabase
    .from("inv_webhook_deliveries")
    .select(
      "id, org_id, event_id, subscription_id, attempt, next_attempt_at",
    )
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (orgFilter) query = query.eq("org_id", orgFilter);

  const { data: dueRows, error: dueError } = await query;
  if (dueError) return apiError("QUERY_ERROR", dueError.message, 500);

  const summary = {
    claimed: 0,
    success: 0,
    failed: 0,
    exhausted: 0,
    skipped: 0,
  };

  for (const row of dueRows ?? []) {
    // Soft-claim by pushing next_attempt_at forward 5 minutes. Concurrent
    // workers will see it as not-due.
    const claimUntil = new Date(Date.now() + 5 * 60_000).toISOString();
    const { data: claimed } = await supabase
      .from("inv_webhook_deliveries")
      .update({ next_attempt_at: claimUntil })
      .eq("id", row.id)
      .eq("status", "pending")
      .lte("next_attempt_at", row.next_attempt_at) // optimistic — only if no one else moved it
      .select("id")
      .maybeSingle();
    if (!claimed) {
      summary.skipped++;
      continue;
    }
    summary.claimed++;

    try {
      const result = await deliverOne(supabase, row.id);
      if (result === "success") summary.success++;
      else if (result === "exhausted") summary.exhausted++;
      else summary.failed++;
    } catch (err) {
      console.error("[webhooks/deliver] uncaught error on row", row.id, err);
      summary.failed++;
    }
  }

  return apiResponse(summary);
}

async function deliverOne(
  supabase: ReturnType<typeof createAdminClient>,
  deliveryId: string,
): Promise<"success" | "failed" | "exhausted"> {
  // Fetch full delivery context
  const { data: delivery, error: dErr } = await supabase
    .from("inv_webhook_deliveries")
    .select("id, org_id, event_id, subscription_id, attempt")
    .eq("id", deliveryId)
    .single();
  if (dErr || !delivery) return "failed";

  const [{ data: event }, { data: sub }] = await Promise.all([
    supabase
      .from("inv_webhook_events")
      .select("id, event, payload, created_at")
      .eq("id", delivery.event_id)
      .single(),
    supabase
      .from("inv_webhook_subscriptions")
      .select("id, url, secret, is_active")
      .eq("id", delivery.subscription_id)
      .single(),
  ]);

  if (!event || !sub || !sub.is_active) {
    // Subscription gone / disabled — mark exhausted so we don't keep retrying.
    await supabase
      .from("inv_webhook_deliveries")
      .update({
        status: "exhausted",
        delivered_at: new Date().toISOString(),
        response_body: "subscription missing or inactive",
      })
      .eq("id", deliveryId);
    return "exhausted";
  }

  const body = JSON.stringify({
    id: `evt_${event.id}`,
    event: event.event,
    org_id: delivery.org_id,
    data: event.payload,
    created_at: event.created_at,
    delivered_at: new Date().toISOString(),
    attempt: delivery.attempt,
  });

  const signature = await hmacSha256(sub.secret, body);

  const started = Date.now();
  let response_code: number | null = null;
  let response_body: string | null = null;
  let ok = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(sub.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Webnari-Inventory-Webhooks/1",
        "X-Webnari-Event": event.event,
        "X-Webnari-Delivery-Id": delivery.id,
        "X-Webnari-Signature": signature,
        "X-Webnari-Attempt": String(delivery.attempt),
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    response_code = res.status;
    response_body = (await res.text()).slice(0, 2000);
    ok = res.status >= 200 && res.status < 300;
  } catch (err) {
    response_code = 0;
    response_body =
      err instanceof Error ? err.message.slice(0, 2000) : String(err).slice(0, 2000);
    ok = false;
  }
  const duration_ms = Date.now() - started;

  if (ok) {
    await Promise.all([
      supabase
        .from("inv_webhook_deliveries")
        .update({
          status: "success",
          response_code,
          response_body,
          duration_ms,
          delivered_at: new Date().toISOString(),
        })
        .eq("id", deliveryId),
      supabase
        .from("inv_webhook_subscriptions")
        .update({
          last_delivered_at: new Date().toISOString(),
          failure_streak: 0,
        })
        .eq("id", sub.id),
    ]);
    return "success";
  }

  const nextAttempt = delivery.attempt + 1;
  if (nextAttempt > MAX_ATTEMPTS) {
    await Promise.all([
      supabase
        .from("inv_webhook_deliveries")
        .update({
          status: "exhausted",
          response_code,
          response_body,
          duration_ms,
          delivered_at: new Date().toISOString(),
        })
        .eq("id", deliveryId),
      supabase
        .from("inv_webhook_subscriptions")
        .update({
          last_failure_at: new Date().toISOString(),
          failure_streak: (await currentFailureStreak(supabase, sub.id)) + 1,
        })
        .eq("id", sub.id),
    ]);
    return "exhausted";
  }

  // Schedule the next attempt using inv_webhook_backoff.
  const { data: nextAtRow } = await supabase.rpc("inv_webhook_backoff", {
    p_attempt: nextAttempt,
  });
  const nextDelaySeconds = parseIntervalSeconds(nextAtRow);
  const nextAttemptAt = new Date(Date.now() + nextDelaySeconds * 1000).toISOString();

  await supabase
    .from("inv_webhook_deliveries")
    .update({
      attempt: nextAttempt,
      response_code,
      response_body,
      duration_ms,
      next_attempt_at: nextAttemptAt,
      status: "pending",
    })
    .eq("id", deliveryId);

  await supabase
    .from("inv_webhook_subscriptions")
    .update({
      last_failure_at: new Date().toISOString(),
      failure_streak: (await currentFailureStreak(supabase, sub.id)) + 1,
    })
    .eq("id", sub.id);

  return "failed";
}

async function currentFailureStreak(
  supabase: ReturnType<typeof createAdminClient>,
  subId: string,
): Promise<number> {
  const { data } = await supabase
    .from("inv_webhook_subscriptions")
    .select("failure_streak")
    .eq("id", subId)
    .single();
  return data?.failure_streak ?? 0;
}

async function hmacSha256(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Parse a Postgres interval string. We pass small intervals like "00:01:00"
// (1 minute) or "00:15:00" (15 minutes). For the catalog we use, the format
// is always "HH:MM:SS" or "MM:SS" — derive seconds.
function parseIntervalSeconds(interval: unknown): number {
  if (typeof interval !== "string") return 60; // safe fallback: 1 minute
  // "HH:MM:SS" or "MM:SS" → seconds
  const parts = interval.split(":").map((p) => parseInt(p, 10));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  // Fallback: try a "1 minute"-style fragment via simple regex
  const min = /(\d+)\s*minute/i.exec(interval);
  if (min) return parseInt(min[1], 10) * 60;
  const hr = /(\d+)\s*hour/i.exec(interval);
  if (hr) return parseInt(hr[1], 10) * 3600;
  return 60;
}
